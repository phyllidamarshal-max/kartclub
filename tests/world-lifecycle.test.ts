import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { World } from "../client/world.ts";

function bareWorld() {
  // Exercise the real lifecycle without requiring a browser/GPU constructor.
  const world = Object.assign(Object.create(World.prototype), {
    scene: new THREE.Scene(),
    cars: new Map<string, THREE.Group>(),
    content: { characterModel: null, sceneModel: null, modelScale: 1 },
    renderer: { dispose() {} },
    itemMeshes: new Map(),
    propellers: [],
  }) as World;
  return world;
}

test("world replacement disposes instance buffers, shared assets and both shadow targets once", (t) => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { removeEventListener() {} },
  });
  const world = bareWorld(),
    texture = new THREE.Texture(),
    material = new THREE.MeshBasicMaterial({ map: texture }),
    geometry = new THREE.BoxGeometry(),
    instances = new THREE.InstancedMesh(geometry, material, 2),
    light = new THREE.DirectionalLight();
  light.shadow.map = new THREE.WebGLRenderTarget(4, 4);
  light.shadow.mapPass = new THREE.WebGLRenderTarget(4, 4);
  const events: string[] = [];
  for (const [name, resource] of Object.entries({
    instances,
    geometry,
    material,
    texture,
    shadow: light.shadow.map,
    shadowPass: light.shadow.mapPass,
  }))
    (resource as THREE.EventDispatcher<{ dispose: {} }>).addEventListener(
      "dispose",
      () => events.push(name),
    );
  world.scene.add(instances, new THREE.Mesh(geometry, material), light);
  t.mock.method(world.renderer, "dispose", () => events.push("renderer"));
  world.dispose();
  world.dispose();
  assert.deepEqual(
    events.toSorted(),
    [
      "instances",
      "geometry",
      "material",
      "texture",
      "shadow",
      "shadowPass",
      "renderer",
    ].sort(),
  );
  assert.equal(events.at(-1), "renderer");
});

for (const asset of ["characterModel", "sceneModel"] as const) {
  test(`a pending ${asset} is released without attaching after world replacement`, async (t) => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { removeEventListener() {} },
    });
    const world = bareWorld();
    world.content[asset] = "/pending.glb";
    const model = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    model.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    let released = 0;
    geometry.addEventListener("dispose", () => released++);
    let resolve!: (gltf: GLTF) => void;
    t.mock.method(
      GLTFLoader.prototype,
      "loadAsync",
      () =>
        new Promise<GLTF>((done) => {
          resolve = done;
        }),
    );
    const car = new THREE.Group();
    world.cars.set("local", car);
    const pending = world.loadAssets();
    world.dispose();
    resolve({ scene: model } as GLTF);
    await pending;
    assert.equal(released, 1);
    assert.equal(model.parent, null);
    assert.equal(car.children.length, 0);
    assert.equal(world.scene.children.length, 0);
  });
}
