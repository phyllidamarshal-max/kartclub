import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { decorateLevel } from "../client/level-scenery.ts";
import {
  buildLandscape,
  decorateLandscape,
  roadsideClear,
} from "../client/scenery.ts";
import { getLevel } from "../shared/levels.ts";
import {
  DEFAULT_TRACK,
  TRACKS,
  nearestTrack,
  trackPoint,
  trackWidth,
  type Track,
} from "../shared/track.ts";

const modulePath = "../client/vfx/environment.ts";
const loaded: Promise<any> = import(modulePath).catch(() => null);
const allTracks = [DEFAULT_TRACK, ...TRACKS];

function track(id: string) {
  const value = allTracks.find((candidate) => candidate.id === id);
  assert.ok(value, `missing track ${id}`);
  return value;
}

function source(
  scene: THREE.Scene | THREE.Group,
  name: string,
  x: number,
  y: number,
  z: number,
) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  scene.add(group);
  return group;
}

function offroadPoint(course: Track, t: number, extra = 12) {
  const p = trackPoint(t, course);
  const side = trackWidth(t, course) / 2 + extra;
  return {
    x: p.x + Math.cos(p.heading) * side,
    y: p.y,
    z: p.z - Math.sin(p.heading) * side,
  };
}

function releaseScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  scene.clear();
}

test("environment module exposes the world lifecycle API", async () => {
  const module = await loaded;
  assert.equal(typeof module?.EnvironmentVfx, "function");
  assert.equal(typeof module?.collectEnvironmentAnchors, "function");
});

test("all nine authored scenes produce only their intended environment anchors", async () => {
  const { collectEnvironmentAnchors } = await loaded;
  const expected: Record<string, string[]> = {
    coast: ["coast-spray", "coast-petal"],
    "coast-harbor": ["harbor-navigation", "harbor-wake", "harbor-exhaust"],
    "coast-breakwater": ["desert-dust"],
    city: ["city-sign", "city-steam"],
    "city-factory": ["factory-smoke", "factory-steam", "factory-weld"],
    "city-nightshift": ["space-energy", "space-glimmer"],
    mountain: ["forest-leaf", "forest-mote"],
    "mountain-pass": ["ice-snow", "ice-aurora", "ice-crystal"],
    "mountain-summit": ["mine-ember", "mine-dust", "mine-crystal"],
  };
  for (const [id, kinds] of Object.entries(expected)) {
    const course = track(id);
    const scene = new THREE.Scene();
    if (id === "coast") {
      buildLandscape(scene, course, new THREE.MeshStandardMaterial());
      decorateLandscape(scene, course, () => 0.42);
    } else decorateLevel(scene, course, () => 0.42);
    const anchors = collectEnvironmentAnchors(scene, course);
    assert.deepEqual(
      [
        ...new Set<string>(
          anchors.map((anchor: { kind: string }) => anchor.kind),
        ),
      ]
        .filter((kind) => kinds.includes(kind))
        .sort(),
      kinds.toSorted(),
      `${id} anchor kinds`,
    );
    assert.ok(
      anchors.every((anchor: { source: string }) =>
        scene.getObjectByName(anchor.source),
      ),
      `${id} anchors retain a real named source`,
    );
    releaseScene(scene);
  }
});

test("factory smoke uses the real refinery tops and only machinery with a chimney", async () => {
  const { collectEnvironmentAnchors } = await loaded;
  const course = track("city-factory");
  const scene = new THREE.Scene();
  const refinery = source(scene, "factory-refinery", 10, 2, 20);
  refinery.rotation.y = Math.PI / 2;
  const plainMachine = source(scene, "factory-machinery", -300, 0, -300);
  plainMachine.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial(),
    ),
  );
  const chimneyMachine = source(scene, "factory-machinery", 300, 0, 300);
  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.7, 16, 9),
    new THREE.MeshBasicMaterial(),
  );
  chimney.position.set(3, 15, 3);
  chimneyMachine.add(chimney);
  const smoke = collectEnvironmentAnchors(scene, course).filter(
    (anchor: { kind: string }) => anchor.kind === "factory-smoke",
  );
  assert.equal(
    smoke.filter(
      (anchor: { source: string }) => anchor.source === "factory-refinery",
    ).length,
    3,
  );
  assert.equal(
    smoke.filter((anchor: { x: number }) => anchor.x < -200).length,
    0,
  );
  assert.equal(
    smoke.filter((anchor: { x: number }) => anchor.x > 200).length,
    1,
  );
  assert.deepEqual(
    smoke
      .filter(
        (anchor: { source: string }) => anchor.source === "factory-refinery",
      )
      .map((anchor: { x: number; y: number; z: number }) => [
        Math.round(anchor.x),
        Math.round(anchor.y),
        Math.round(anchor.z),
      ])
      .sort((a: number[], b: number[]) => a[2] - b[2]),
    [
      [22, 50, 8],
      [22, 50, 20],
      [22, 50, 32],
    ],
  );
  releaseScene(scene);
});

test("ground emitters stay clear of the main road and shortcut", async () => {
  const { collectEnvironmentAnchors } = await loaded;
  for (const id of [
    "coast-breakwater",
    "city-factory",
    "mountain",
    "mountain-summit",
  ]) {
    const course = track(id);
    const scene = new THREE.Scene();
    decorateLevel(scene, course, () => 0.42);
    for (const anchor of collectEnvironmentAnchors(scene, course).filter(
      (value: { clearance: number }) => value.clearance > 0,
    )) {
      assert.ok(
        roadsideClear(course, anchor.x, anchor.z, anchor.clearance),
        `${id} ${anchor.kind} is outside every driveable ribbon`,
      );
      const nearest = nearestTrack(anchor.x, anchor.z, course);
      assert.ok(Number.isFinite(nearest.y));
    }
    releaseScene(scene);
  }

  const course = track("mountain");
  const scene = new THREE.Scene();
  const shortcut = course.shortcut[Math.floor(course.shortcut.length / 2)];
  source(scene, "forest-giant-tree", shortcut.x, shortcut.y, shortcut.z);
  assert.equal(
    collectEnvironmentAnchors(scene, course).filter(
      (anchor: { kind: string }) => anchor.kind === "forest-leaf",
    ).length,
    0,
  );
});

test("ice snow sources inside the crystal tunnel are suppressed", async () => {
  const { collectEnvironmentAnchors } = await loaded;
  const course = track("mountain-pass");
  const scene = new THREE.Scene();
  const inside = offroadPoint(course, 0.2, 15);
  const outside = offroadPoint(course, 0.72, 24);
  const tunnel = source(
    scene,
    "ice-crystal-tunnel",
    inside.x,
    inside.y,
    inside.z,
  );
  tunnel.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(36, 18, 36),
      new THREE.MeshBasicMaterial(),
    ),
  );
  source(scene, "ice-snow-pine", inside.x, inside.y, inside.z);
  source(scene, "ice-snow-pine", outside.x, outside.y, outside.z);
  const snow = collectEnvironmentAnchors(scene, course).filter(
    (anchor: { kind: string }) => anchor.kind === "ice-snow",
  );
  assert.equal(snow.length, 1);
  assert.ok(Math.hypot(snow[0].x - outside.x, snow[0].z - outside.z) < 0.01);
  releaseScene(scene);
});

test("space planet energy follows the authored ring belt outside the sphere", async () => {
  const { collectEnvironmentAnchors } = await loaded;
  const course = track("city-nightshift");
  const scene = new THREE.Scene();
  const planet = source(scene, "space-ring-planet", 420, 110, -360);
  const rings = new THREE.Group();
  rings.rotation.set(0.95, 0.2, -0.35);
  planet.add(rings);
  const belt = new THREE.Mesh(
    new THREE.RingGeometry(76, 109, 64),
    new THREE.MeshBasicMaterial(),
  );
  belt.rotation.x = -Math.PI / 2;
  rings.add(belt);
  scene.updateMatrixWorld(true);
  const want = belt.getWorldQuaternion(new THREE.Quaternion());
  const anchor = collectEnvironmentAnchors(scene, course).find(
    (value: { kind: string }) => value.kind === "space-energy",
  );
  assert.ok(anchor);
  assert.equal(anchor.scaleX, 200);
  const actual = new THREE.Quaternion().fromArray(anchor.quaternion);
  assert.ok(Math.abs(actual.dot(want)) > 0.999999);
  releaseScene(scene);
});

test("reduced motion keeps the distant aurora ahead of local decoration sampling", async () => {
  const { EnvironmentVfx } = await loaded;
  const course = track("mountain-pass");
  const scene = new THREE.Scene();
  for (let i = 0; i < 88; i++) {
    const p = offroadPoint(course, i / 88, 24);
    source(scene, "ice-snow-pine", p.x, p.y, p.z);
  }
  const spire = offroadPoint(course, 0.61, 42);
  source(scene, "ice-crystal-spire", spire.x, spire.y, spire.z);
  const fx = new EnvironmentVfx(scene, course);
  fx.update(undefined, 0.1, {
    active: true,
    paused: false,
    quality: "low",
    motion: 0,
  });
  assert.equal(fx.stats.particles, 0);
  assert.equal(fx.stats.instances, 1);
  fx.dispose();
  releaseScene(scene);
});

test("environment budget yields first to quality, pressure, reduced motion and lifecycle", async () => {
  const { EnvironmentVfx } = await loaded;
  const course = track("mountain");
  const scene = new THREE.Scene();
  for (let i = 0; i < 32; i++) {
    const p = offroadPoint(course, i / 32, 16 + (i % 3) * 4);
    source(scene, "forest-giant-tree", p.x, p.y, p.z);
  }
  const fx = new EnvironmentVfx(scene, course);
  const frame = {
    active: true,
    paused: false,
    quality: "high",
    motion: 1,
    pixelHeight: 1080,
  };
  for (let i = 0; i < 80; i++) fx.update(undefined, 0.1, frame);
  assert.equal(fx.stats.limit, 128);
  assert.ok(fx.stats.particles > 0 && fx.stats.particles <= 128);
  fx.update(undefined, 0.1, { ...frame, quality: "low" });
  assert.equal(fx.stats.limit, 16);
  assert.ok(fx.stats.particles <= 16);
  fx.update(undefined, 0.1, { ...frame, pressure: true });
  assert.equal(fx.stats.particles, 0);
  assert.equal(fx.stats.instances, 0);
  fx.update(undefined, 0.1, { ...frame, motion: 0 });
  assert.equal(fx.stats.particles, 0);
  for (let i = 0; i < 20; i++) fx.update(undefined, 0.1, frame);
  const frozen = { time: fx.stats.time, particles: fx.stats.particles };
  fx.update(undefined, 1, { ...frame, paused: true });
  assert.deepEqual(
    { time: fx.stats.time, particles: fx.stats.particles },
    frozen,
  );
  fx.update(undefined, 0.26, frame);
  assert.equal(fx.stats.time, 0);
  assert.equal(fx.stats.particles, 0);
  fx.dispose();
  releaseScene(scene);
});

test("coast refresh replaces removed fallback anchors with exact authored instances", async () => {
  const { EnvironmentVfx } = await loaded;
  const course = track("coast");
  const scene = new THREE.Scene();
  const fallback = new THREE.Group();
  fallback.name = "coast-procedural-fallback";
  const blossom = offroadPoint(course, 0.32, 30);
  source(fallback, "coast-blossom-tree", blossom.x, blossom.y, blossom.z);
  const cliff = new THREE.Mesh(
    new THREE.BoxGeometry(3, 3, 3),
    new THREE.MeshBasicMaterial(),
  );
  cliff.name = "coast-cliff";
  fallback.add(cliff);
  scene.add(fallback);
  const fx = new EnvironmentVfx(scene, course);
  assert.ok(
    fx.stats.sources.some((name: string) => name === "coast-blossom-tree"),
  );

  fallback.removeFromParent();
  fallback.clear();
  const authored = new THREE.Group();
  authored.name = "coast-authored-assets";
  const tree = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    2,
  );
  tree.name = "coast:tree-blossom";
  tree.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-180, 0, -160));
  tree.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-150, 0, -130));
  const rocks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    2,
  );
  rocks.name = "coast:rock-cluster";
  rocks.setMatrixAt(0, new THREE.Matrix4().makeTranslation(180, -5, 160));
  rocks.setMatrixAt(1, new THREE.Matrix4().makeTranslation(150, -5, 130));
  authored.add(tree, rocks);
  scene.add(authored);
  fx.refreshAnchors();
  const once = fx.stats;
  fx.refreshAnchors();
  assert.equal(fx.stats.anchors, once.anchors);
  assert.deepEqual(fx.stats.sources, [
    "coast:rock-cluster",
    "coast:tree-blossom",
  ]);
  assert.equal(fx.stats.anchorsByKind["coast-petal"], 2);
  assert.equal(fx.stats.anchorsByKind["coast-spray"], 2);
  fx.dispose();
  releaseScene(scene);
});

test("environment owns two dynamic draws and cleanup is idempotent", async () => {
  const { EnvironmentVfx } = await loaded;
  const course = track("city-nightshift");
  const scene = new THREE.Scene();
  const p = offroadPoint(course, 0.15, 20);
  source(scene, "space-station-module", p.x, p.y, p.z);
  const fx = new EnvironmentVfx(scene, course);
  const renderables: THREE.Object3D[] = [];
  fx.group.traverse((object: THREE.Object3D) => {
    if (object instanceof THREE.Points || object instanceof THREE.InstancedMesh)
      renderables.push(object);
  });
  assert.equal(renderables.length, 2);
  assert.ok(renderables.every((object) => object.userData.dynamic === true));
  assert.equal(
    fx.group.children.some(
      (object: THREE.Object3D) => object instanceof THREE.Light,
    ),
    false,
  );
  fx.dispose();
  fx.dispose();
  assert.equal(fx.group.parent, null);
  assert.equal(fx.stats.particles, 0);
  releaseScene(scene);
});
