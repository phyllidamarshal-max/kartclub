import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TRACKS, trackWidth } from "../shared/track.ts";
import { getLevel } from "../shared/levels.ts";
import {
  buildLandscape,
  createSea,
  createSky,
  decorateLandscape,
} from "../client/scenery.ts";

function random() {
  let seed = 921;
  return () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const coast = TRACKS.find((t) => t.id === "coast")!;

test("the closed cliff seam stays below the visible grass surface", () => {
  const scene = new THREE.Scene();
  const grass = new THREE.MeshStandardMaterial({ color: "#728b3e" });
  buildLandscape(scene, coast, grass);
  const cliff = scene.getObjectByName("coast-cliff") as THREE.Mesh;
  const gap = -0.18 - new THREE.Box3().setFromObject(cliff).max.y;
  assert.ok(gap > 0 && gap < 0.025, `cliff/grass separation: ${gap}`);
  const terrain = scene.children.find(
    (o) => o instanceof THREE.Mesh && o.material === grass,
  ) as THREE.Mesh;
  const geometry = terrain.geometry.toNonIndexed();
  const positions = geometry.getAttribute("position");
  const ray = new THREE.Raycaster();
  scene.updateMatrixWorld(true);
  for (let i = 0; i < positions.count; i += 30) {
    const origin = new THREE.Vector3();
    for (let j = 0; j < 3; j++)
      origin.add(new THREE.Vector3().fromBufferAttribute(positions, i + j));
    origin.multiplyScalar(1 / 3).setY(5);
    ray.set(origin, new THREE.Vector3(0, -1, 0));
    assert.equal(
      ray.intersectObjects(scene.children, false)[0]?.object,
      terrain,
      "the rock cap must not hide the grass texture",
    );
  }
  geometry.dispose();
});

test("coastal geometry remains outside both driveable ribbons and uses a bounded palette", () => {
  const scene = new THREE.Scene();
  decorateLandscape(scene, coast, random());
  scene.updateMatrixWorld(true);
  assert.ok(scene.getObjectByName("coast-shore-foam"));
  assert.ok(scene.getObjectByName("coast-village-cobbles"));
  assert.ok(scene.getObjectByName("coast-verge-stone-wall"));
  const contacts = scene.getObjectByName("coast-contact-shadows") as THREE.Mesh;
  assert.ok(contacts);
  assert.equal(contacts.userData.dynamic, true);
  const contactMaterial = contacts.material as THREE.MeshBasicMaterial;
  assert.equal(contactMaterial.transparent, true);
  assert.equal(contactMaterial.depthWrite, false);
  const contactColors = contacts.geometry.getAttribute("color");
  assert.equal(contactColors.itemSize, 4);
  for (let i = 0; i < contactColors.count; i++)
    assert.ok(contactColors.getW(i) <= 0.25);
  const occupied = scene.children
    .filter((object) => object.name === "coast-slate-cottage")
    .map((object) => new THREE.Box3().setFromObject(object));
  for (const name of ["coast-wildflower-meadow", "coast-verge-grass"]) {
    const mesh = scene.getObjectByName(name) as THREE.Mesh;
    assert.ok(mesh, `${name} missing`);
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i);
      assert.ok(
        !occupied.some((box) => box.containsPoint(point)),
        `${name} enters a cottage footprint`,
      );
    }
  }
  const meshes: THREE.Mesh[] = [],
    materials = new Set<THREE.Material>();
  let vertices = 0;
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes.push(o);
    vertices += o.geometry.getAttribute("position").count;
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      materials.add(m);
  });
  assert.ok(materials.size <= 32, `${materials.size} distinct materials`);
  assert.ok(vertices < 600000, `${vertices} scenery vertices`);
  const ray = new THREE.Raycaster();
  ray.far = 5.8;
  for (const [points, shortcut] of [
    [coast.points, false],
    [coast.shortcut, true],
  ] as const) {
    for (let i = 0; i < points.length; i += 4) {
      const p = points[i],
        width = shortcut ? (coast.shortcutWidth ?? 7) : trackWidth(p.t, coast);
      for (const lateral of [-width / 2 + 0.35, 0, width / 2 - 0.35]) {
        ray.set(
          new THREE.Vector3(
            p.x + Math.cos(p.heading) * lateral,
            p.y + 0.15,
            p.z - Math.sin(p.heading) * lateral,
          ),
          new THREE.Vector3(0, 1, 0),
        );
        assert.equal(
          ray.intersectObjects(meshes, false).length,
          0,
          `obstruction at ${p.t}, shortcut=${shortcut}`,
        );
      }
    }
  }
});

test("sea and sky keep animation contracts and own resources across scene rebuilds", () => {
  const a = new THREE.Scene(),
    b = new THREE.Scene();
  const waterA = createSea(a, "#168997"),
    waterB = createSea(b, "#168997");
  const skyA = createSky(a, "coast", getLevel("coast"));
  const skyB = createSky(b, "coast", getLevel("coast"));
  assert.equal(waterA.material.uniforms.clock.value, 0);
  waterA.material.uniforms.clock.value = 8;
  assert.equal(waterB.material.uniforms.clock.value, 0);
  assert.notEqual(waterA.sea.geometry, waterB.sea.geometry);
  assert.notEqual(skyA.geometry, skyB.geometry);
  assert.notEqual(skyA.material, skyB.material);
  assert.equal(a.children.length, 2, "clouds must stay in the sky draw call");
  let disposed = 0;
  for (const object of [waterA.sea, skyA]) {
    object.geometry.addEventListener("dispose", () => disposed++);
    object.material.addEventListener("dispose", () => disposed++);
    object.geometry.dispose();
    object.material.dispose();
  }
  assert.equal(disposed, 4);
  assert.equal(waterB.material.uniforms.clock.value, 0);
  for (const track of TRACKS.filter((t) =>
    ["mine", "space"].includes(getLevel(t.id).biome),
  )) {
    const sky = createSky(b, track.theme, getLevel(track.id));
    assert.equal(sky.material.uniforms.cloudStrength.value, 0);
  }
});
