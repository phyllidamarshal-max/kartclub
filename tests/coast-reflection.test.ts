import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  CoastReflectionProbe,
  captureCoastReflection,
  withStaticReflectionScene,
} from "../client/coast-reflection.ts";

test("static reflection capture updates local asset cells and restores every visibility flag", () => {
  const scene = new THREE.Scene();
  const assets = new THREE.Group();
  assets.name = "coast-authored-assets";
  const nearby = new THREE.Mesh();
  nearby.userData.coastCell = { x: 0, z: 0, detail: false, tree: true };
  nearby.visible = false;
  nearby.castShadow = false;
  const distant = new THREE.Mesh();
  distant.userData.coastCell = { x: 1500, z: 0, detail: false, tree: true };
  distant.castShadow = true;
  assets.add(nearby, distant);
  const car = new THREE.Group();
  const effect = new THREE.Group();
  effect.visible = false;
  scene.add(assets, car, effect);
  const result = withStaticReflectionScene(
    scene,
    new THREE.Vector3(0, 2.2, 0),
    [car, effect],
    () => {
      assert.equal(nearby.visible, true);
      assert.equal(nearby.castShadow, true);
      assert.equal(distant.visible, false);
      assert.equal(distant.castShadow, false);
      assert.equal(car.visible, false);
      assert.equal(effect.visible, false);
      return 42;
    },
  );
  assert.equal(result, 42);
  assert.equal(nearby.visible, false);
  assert.equal(nearby.castShadow, false);
  assert.equal(distant.visible, true);
  assert.equal(distant.castShadow, true);
  assert.equal(car.visible, true);
  assert.equal(effect.visible, false);
});

function captureRenderer(
  scene: THREE.Scene,
  fail: "scene" | "filter" | "none",
) {
  let target: THREE.WebGLRenderTarget | null = null;
  let face = 0,
    level = 0;
  const viewport = new THREE.Vector4(4, 5, 320, 240);
  const scissor = new THREE.Vector4(1, 2, 300, 220);
  const color = new THREE.Color("#243546");
  let alpha = 0.4,
    scissorTest = true;
  const targets = new Set<THREE.WebGLRenderTarget>();
  let sceneRenders = 0,
    filterRenders = 0;
  const renderer = {
    state: { buffers: { depth: { getReversed: () => false } } },
    coordinateSystem: THREE.WebGLCoordinateSystem,
    reversedDepthBuffer: false,
    autoClear: false,
    toneMapping: THREE.ACESFilmicToneMapping,
    xr: { enabled: true },
    shadowMap: { needsUpdate: false },
    getRenderTarget: () => target,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => level,
    setRenderTarget(
      next: THREE.WebGLRenderTarget | null,
      nextFace = 0,
      nextLevel = 0,
    ) {
      target = next;
      face = nextFace;
      level = nextLevel;
      if (next) targets.add(next);
    },
    getViewport: (out: THREE.Vector4) => out.copy(viewport),
    setViewport: (next: THREE.Vector4) => viewport.copy(next),
    getScissor: (out: THREE.Vector4) => out.copy(scissor),
    setScissor: (next: THREE.Vector4) => scissor.copy(next),
    getScissorTest: () => scissorTest,
    setScissorTest: (next: boolean) => (scissorTest = next),
    getClearColor: (out: THREE.Color) => out.copy(color),
    getClearAlpha: () => alpha,
    setClearColor(next: THREE.Color, nextAlpha: number) {
      color.copy(next);
      alpha = nextAlpha;
    },
    render(object: THREE.Object3D) {
      if (object === scene) {
        sceneRenders++;
        if (fail === "scene") throw new Error("Injected scene shader failure");
      } else if (
        object instanceof THREE.Mesh &&
        (object.material as THREE.Material).name === "PMREMGGXConvolution"
      ) {
        filterRenders++;
        if (fail === "filter")
          throw new Error("Injected filter shader failure");
      }
    },
  };
  return { renderer, targets, count: () => ({ sceneRenders, filterRenders }) };
}

for (const failure of ["scene", "filter"] as const) {
  test(`real Three capture disposes every bound target after a ${failure} render failure`, (t) => {
    const scene = new THREE.Scene();
    const car = new THREE.Group();
    scene.add(car);
    const { renderer, targets } = captureRenderer(scene, failure);
    const disposed = new Map<THREE.WebGLRenderTarget, number>();
    const original = THREE.WebGLRenderTarget.prototype.dispose;
    t.mock.method(
      THREE.WebGLRenderTarget.prototype,
      "dispose",
      function (this: THREE.WebGLRenderTarget) {
        disposed.set(this, (disposed.get(this) ?? 0) + 1);
        original.call(this);
      },
    );
    assert.throws(
      () =>
        captureCoastReflection(
          renderer as unknown as THREE.WebGLRenderer,
          scene,
          {
            position: new THREE.Vector3(1, 2.2, 3),
            excluded: [car],
          },
        ),
      /Injected .* shader failure/,
    );
    for (const target of targets)
      assert.equal(disposed.get(target), 1, "a bound GPU render target leaked");
    assert.equal(
      [...disposed.keys()].filter(
        (target) => target instanceof THREE.WebGLCubeRenderTarget,
      ).length,
      1,
      "owned capture cube must be released",
    );
    assert.equal(
      [...disposed.keys()].filter(
        (target) => !(target instanceof THREE.WebGLCubeRenderTarget),
      ).length,
      2,
      "both owned PMREM output and generator scratch must be released",
    );
    assert.equal(car.visible, true);
    assert.equal(renderer.xr.enabled, true);
    assert.equal(renderer.autoClear, false);
    assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
    assert.equal(renderer.getRenderTarget(), null);
    assert.deepEqual(
      renderer.getViewport(new THREE.Vector4()).toArray(),
      [4, 5, 320, 240],
    );
  });
}

test("successful real Three capture transfers only its output target to the probe", (t) => {
  const scene = new THREE.Scene();
  const { renderer, targets, count } = captureRenderer(scene, "none");
  const disposed = new Set<THREE.WebGLRenderTarget>();
  const original = THREE.WebGLRenderTarget.prototype.dispose;
  t.mock.method(
    THREE.WebGLRenderTarget.prototype,
    "dispose",
    function (this: THREE.WebGLRenderTarget) {
      disposed.add(this);
      original.call(this);
    },
  );
  const probe = captureCoastReflection(
    renderer as unknown as THREE.WebGLRenderer,
    scene,
    {
      position: new THREE.Vector3(),
      excluded: [],
    },
  );
  assert.equal(count().sceneRenders, 6);
  assert.ok(count().filterRenders > 0);
  const alive = [...targets].filter((target) => !disposed.has(target));
  assert.equal(alive.length, 1);
  assert.equal(alive[0].texture.mapping, THREE.CubeUVReflectionMapping);
  assert.deepEqual([alive[0].width, alive[0].height], [384, 512]);
  probe.dispose();
  assert.ok([...targets].every((target) => disposed.has(target)));
});

test("a failed reflection capture restores scene visibility before propagating the failure", () => {
  const scene = new THREE.Scene();
  const car = new THREE.Group();
  const sky = new THREE.Color("#80bfd0");
  scene.background = sky;
  scene.add(car);
  assert.throws(
    () =>
      withStaticReflectionScene(scene, new THREE.Vector3(), [car], () => {
        assert.equal(car.visible, false);
        scene.background = null;
        throw new Error("GPU capture failed");
      }),
    /GPU capture failed/,
  );
  assert.equal(car.visible, true);
  assert.equal(scene.background, sky);
});

test("releasing a pruned kart detaches the shared render texture without disposing it", () => {
  const target = new THREE.WebGLRenderTarget();
  let disposed = 0;
  target.addEventListener("dispose", () => disposed++);
  const visor = new THREE.MeshPhysicalMaterial();
  visor.name = "kart-visor";
  const kart = new THREE.Mesh(undefined, visor);
  const probe = new CoastReflectionProbe(target);
  probe.applyToKart(kart);
  probe.releaseKart(kart);
  assert.equal(visor.envMap, null);
  assert.equal(disposed, 0);
  probe.applyToKart(kart);
  assert.equal(visor.envMap, target.texture);
  probe.dispose();
  assert.equal(disposed, 1);
});

test("one shared visor probe leaves paint alone and restores materials before exactly-once disposal", () => {
  const target = new THREE.WebGLRenderTarget(4, 4);
  let disposed = 0;
  target.addEventListener("dispose", () => disposed++);
  const old = new THREE.Texture();
  const visor = new THREE.MeshPhysicalMaterial({
    envMap: old,
    envMapIntensity: 0.7,
  });
  visor.name = "kart-visor";
  const paint = new THREE.MeshPhysicalMaterial();
  paint.name = "kart-paint";
  const car = new THREE.Group();
  car.add(new THREE.Mesh(undefined, visor), new THREE.Mesh(undefined, paint));
  const probe = new CoastReflectionProbe(target);
  probe.applyToKart(car);
  probe.applyToKart(car);
  assert.equal(visor.envMap, target.texture);
  assert.equal(visor.envMapIntensity, 2.4);
  assert.equal(paint.envMap, null);
  probe.dispose();
  probe.dispose();
  assert.equal(disposed, 1);
  assert.equal(visor.envMap, old);
  assert.equal(visor.envMapIntensity, 0.7);
  assert.throws(() => probe.applyToKart(car), /disposed/);
});

test("disposing an old probe does not overwrite a newer material reflection", () => {
  const material = new THREE.MeshPhysicalMaterial();
  material.name = "kart-visor";
  const mesh = new THREE.Mesh(undefined, material);
  const first = new CoastReflectionProbe(new THREE.WebGLRenderTarget());
  const replacement = new THREE.Texture();
  first.applyToKart(mesh);
  material.envMap = replacement;
  material.envMapIntensity = 1.7;
  first.dispose();
  assert.equal(material.envMap, replacement);
  assert.equal(material.envMapIntensity, 1.7);
});
