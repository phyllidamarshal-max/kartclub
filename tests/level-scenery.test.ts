import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  TRACKS,
  nearestTrack,
  trackPoint,
  trackWidth,
} from "../shared/track.ts";
import { getLevel } from "../shared/levels.ts";
import { buildLevelLandscape, decorateLevel } from "../client/level-scenery.ts";
import { buildLandscape, decorateLandscape } from "../client/scenery.ts";

const landmarks: Record<string, string> = {
  harbor: "harbor-cargo-crane",
  desert: "desert-pyramid",
  city: "city-neon-tower",
  factory: "factory-refinery",
  space: "space-ring-planet",
  forest: "forest-covered-passage",
  ice: "ice-crystal-tunnel",
  mine: "mine-portal",
};
function random() {
  let seed = 741;
  return () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

test("coast scenery clears the varying-width main road", () => {
  const track = TRACKS.find((t) => t.id === "coast")!,
    scene = new THREE.Scene();
  buildLandscape(scene, track, new THREE.MeshStandardMaterial());
  const cliff = scene.getObjectByName("coast-cliff") as THREE.Mesh;
  assert.ok(cliff);
  assert.ok(new THREE.Box3().setFromObject(cliff).max.y >= -0.2);
  decorateLandscape(scene, track, random());
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.far = 5.85;
  for (let i = 0; i < track.points.length; i += 6) {
    const p = track.points[i],
      width = trackWidth(p.t, track);
    for (const lateral of [-width / 2 + 0.5, 0, width / 2 - 0.5]) {
      const x = p.x + Math.cos(p.heading) * lateral,
        z = p.z - Math.sin(p.heading) * lateral;
      ray.set(new THREE.Vector3(x, p.y + 0.15, z), new THREE.Vector3(0, 1, 0));
      assert.equal(
        ray.intersectObjects(scene.children, true).length,
        0,
        `coast obstacle at ${p.t}`,
      );
    }
  }
});
for (const track of TRACKS.filter((t) => getLevel(t.id).biome !== "coast")) {
  test(`${track.id} has distinct landmarks, reusable materials and unobstructed drivable space`, () => {
    const scene = new THREE.Scene();
    buildLevelLandscape(
      scene,
      track,
      new THREE.MeshStandardMaterial({ color: getLevel(track.id).ground }),
    );
    decorateLevel(scene, track, random());
    scene.updateMatrixWorld(true);
    const biome = getLevel(track.id).biome;
    assert.ok(
      scene.getObjectByName(landmarks[biome]),
      `${biome} landmark missing`,
    );
    const materials = new Set<THREE.Material>();
    const meshes: THREE.Mesh[] = [];
    let vertices = 0;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes.push(object);
      vertices += object.geometry.getAttribute("position").count;
      for (const mat of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(mat);
      const box = new THREE.Box3().setFromObject(object);
      assert.ok(
        [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite),
      );
    });
    assert.ok(meshes.length > 80, `${biome} lacks substantial scenery`);
    assert.ok(
      materials.size <= 25,
      `${biome} uses ${materials.size} materials`,
    );
    assert.ok(vertices < 600000, `${biome} uses ${vertices} vertices`);
    const ray = new THREE.Raycaster();
    for (const [route, branch] of [
      [track.points, "main"],
      [track.shortcut, "shortcut"],
    ] as const) {
      for (let i = 0; i < route.length; i += 6) {
        const p = route[i];
        const width =
          branch === "main"
            ? trackWidth(p.t, track)
            : (track.shortcutWidth ?? 7);
        for (const lateral of [-width / 2 + 0.5, 0, width / 2 - 0.5]) {
          const x = p.x + Math.cos(p.heading) * lateral;
          const z = p.z - Math.sin(p.heading) * lateral;
          ray.set(
            new THREE.Vector3(x, p.y + 0.12, z),
            new THREE.Vector3(0, 1, 0),
          );
          ray.far = 5.88;
          assert.equal(
            ray.intersectObjects(meshes, false).length,
            0,
            `${biome} obstacle at t=${p.t.toFixed(3)}, lateral=${lateral}`,
          );
          // Ground surfaces face up; a ray from underneath would miss a terrain
          // triangle that accidentally rises through an elevated road.
          ray.set(
            new THREE.Vector3(x, p.y + 6, z),
            new THREE.Vector3(0, -1, 0),
          );
          assert.equal(
            ray.intersectObjects(meshes, false).length,
            0,
            `${biome} surface intrudes at t=${p.t.toFixed(3)}, lateral=${lateral}`,
          );
        }
      }
    }
    for (const object of scene.children) {
      const radius = object.userData.footprintRadius;
      if (typeof radius !== "number") continue;
      const p = nearestTrack(object.position.x, object.position.z, track);
      assert.ok(
        p.distance > p.roadWidth / 2 + radius,
        `${object.name} overlaps a road footprint`,
      );
    }
    if (biome === "space") {
      assert.ok(scene.getObjectByName("space-road-foundation"));
      assert.equal(scene.getObjectByName("level-terrain"), undefined);
      if (track.shortcut.length > 1) {
        const foundation = scene.getObjectByName("space-shortcut-foundation");
        assert.ok(foundation, "space shortcut needs a platform beneath it");
        for (let i = 2; i < track.shortcut.length - 2; i += 7) {
          const p = track.shortcut[i];
          ray.set(
            new THREE.Vector3(p.x, p.y + 0.1, p.z),
            new THREE.Vector3(0, -1, 0),
          );
          ray.far = 4;
          assert.ok(
            ray.intersectObject(foundation, true).length,
            "space shortcut has a void beneath its road",
          );
        }
      }
    }
    if (biome === "forest" && track.shortcut.length) {
      assert.ok(scene.getObjectByName("forest-shortcut-bridge"));
      assert.ok(
        scene.getObjectByName("forest-bridge-support"),
        "shortcut needs visible timber support structure",
      );
    }
    if (["forest", "ice", "mine"].includes(biome)) {
      const p = trackPoint(getLevel(track.id).preview.t + 0.016, track);
      ray.set(new THREE.Vector3(p.x, p.y + 6, p.z), new THREE.Vector3(0, 1, 0));
      ray.far = 10;
      assert.ok(
        ray.intersectObject(scene.getObjectByName(landmarks[biome])!, true)
          .length,
        `${biome} passage must actually cover the driveable route`,
      );
    }
  });
}
