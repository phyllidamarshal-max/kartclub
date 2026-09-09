import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  TRACKS,
  DEFAULT_TRACK,
  trackWidth,
  nearestTrack,
} from "../shared/track.ts";
import { createCoastLayout, COAST_FOOTPRINTS } from "../client/coast-layout.ts";
import { getLevel } from "../shared/levels.ts";
import {
  buildLandscape,
  createSea,
  createSky,
  decorateLandscape,
  roadsideClear,
} from "../client/scenery.ts";

function random() {
  let seed = 921;
  return () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const coast = TRACKS.find((t) => t.id === "coast")!;

test("authored village retains human-scale spacing on the long official coast", () => {
  const layout = createCoastLayout(coast);
  assert.deepEqual(layout, createCoastLayout(coast));
  const houses = layout.filter((p) => p.asset.startsWith("cottage"));
  assert.ok(houses.length >= 7 && houses.length <= 10);
  const distances = houses
    .map((p) => nearestTrack(p.x, p.z, coast).t * coast.length)
    .sort((a, b) => a - b);
  assert.ok(
    distances.at(-1)! - distances[0] < 180,
    "village must not stretch into a 300 m procession",
  );
  const orderedHouses = houses.toSorted((a,b)=>nearestTrack(a.x,a.z,coast).t-nearestTrack(b.x,b.z,coast).t);
  for (let i = 1; i < orderedHouses.length; i++)
    assert.ok(
      Math.hypot(orderedHouses[i].x-orderedHouses[i-1].x,orderedHouses[i].z-orderedHouses[i-1].z) < 32,
      "cottages must read as a connected village",
    );
  const nearHouses = houses.filter((p) => {
    const n = nearestTrack(p.x, p.z, coast);
    return (
      n.distance -
        trackWidth(n.t, coast) / 2 -
        COAST_FOOTPRINTS[p.asset] * p.scale <
      5
    );
  });
  assert.ok(nearHouses.length >= 6, "most homes need a short front garden");
});

test("village trees have separate crowns and leave building silhouettes readable", () => {
  const layout = createCoastLayout(coast);
  const solids = layout.filter((p) =>
    /^(cottage|tree)|lighthouse/.test(p.asset),
  );
  const trees = solids.filter((p) => p.asset.startsWith("tree"));
  assert.ok(trees.length >= 90 && trees.length <= 190);
  assert.ok(
    trees.some((p) => p.asset === "tree-blossom"),
    "retain a single framing blossom accent",
  );
  assert.ok(
    trees.filter((p) => p.asset === "tree-blossom").length / trees.length <=
      0.1,
  );
  for (let i = 0; i < solids.length; i++)
    for (const other of solids.slice(i + 1)) {
      const a = solids[i];
      const gap =
        Math.hypot(a.x - other.x, a.z - other.z) -
        COAST_FOOTPRINTS[a.asset] * a.scale -
        COAST_FOOTPRINTS[other.asset] * other.scale;
      assert.ok(
        gap >= 0.75 - 1e-6,
        `${a.asset}/${other.asset} crown or wall gap ${gap}`,
      );
    }
});

test("authored coast footprints clear every main and shortcut road segment", (context) => {
  for (const track of [coast, DEFAULT_TRACK]) {
    const layout = createCoastLayout(track);
    let minimum = Infinity;
    for (const item of layout) {
      const radius = COAST_FOOTPRINTS[item.asset] * item.scale;
      assert.ok(roadsideClear(track, item.x, item.z, radius + 0.5));
      // Independently inspect the full ribbons; do not rely on the placement
      // helper's nearest-road fast path when validating shortcut junctions.
      for (const [points, closed, shortcut] of [
        [track.points, true, false],
        [track.shortcut, false, true],
      ] as const) {
        for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
          const a = points[i],
            b = points[(i + 1) % points.length];
          const dx = b.x - a.x,
            dz = b.z - a.z;
          const f = Math.max(
            0,
            Math.min(
              1,
              ((item.x - a.x) * dx + (item.z - a.z) * dz) /
                (dx * dx + dz * dz || 1),
            ),
          );
          const t = (a.t + ((b.t < a.t ? b.t + 1 : b.t) - a.t) * f) % 1;
          const width = shortcut
            ? (track.shortcutWidth ?? 7)
            : trackWidth(t, track);
          const gap =
            Math.hypot(item.x - a.x - dx * f, item.z - a.z - dz * f) -
            width / 2 -
            radius;
          minimum = Math.min(minimum, gap);
          assert.ok(
            gap >= 0.75 - 1e-6,
            `${track.id}/${item.asset}, shortcut=${shortcut}: ${gap}`,
          );
        }
      }
    }
    context.diagnostic(
      `${track.id}: ${layout.length} full footprints, minimum road-edge gap ${minimum.toFixed(4)} m`,
    );
  }
});

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
  // Longer authored routes legitimately expose more of the existing village and
  // flower placements. Bound their growth per kilometre, without lowering detail.
  const vertexBudget = Math.min(
    850000,
    600000 + Math.max(0, coast.length - 1300) * 80,
  );
  assert.ok(
    vertices < vertexBudget,
    `${vertices} scenery vertices / ${vertexBudget} budget`,
  );
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
