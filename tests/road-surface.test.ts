import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { getTrack, nearestTrack, trackWidth } from "../shared/track.ts";
import { addRoadWear, enhanceAsphalt } from "../client/road-surface.ts";

test("road wear follows the actual road height and stays inside its ribbon", () => {
  const scene = new THREE.Scene(),
    track = getTrack("coast");
  addRoadWear(scene, track);
  const wear = scene.getObjectByName("coast-road-wear") as THREE.Mesh;
  assert.ok(wear);
  assert.equal(wear.castShadow, false);
  const position = wear.geometry.getAttribute("position");
  assert.ok(position.count > 100 && position.count < 15000);
  for (let i = 0; i < position.count; i++) {
    const p = nearestTrack(position.getX(i), position.getZ(i), track);
    assert.ok(
      p.distance < trackWidth(p.t, track) / 2 - 0.5,
      "rubber trace outside road",
    );
    assert.ok(
      Math.abs(position.getY(i) - p.y) < 0.12,
      "trace detached from asphalt",
    );
  }
  assert.equal((wear.material as THREE.MeshBasicMaterial).depthWrite, false);
});
test("asphalt enhancement preserves imported color texture and owns no extra GPU textures", () => {
  const mat = new THREE.MeshStandardMaterial({
      map: new THREE.Texture(),
      roughness: 0.94,
    }),
    texture = mat.map;
  enhanceAsphalt(mat);
  assert.equal(mat.map, texture);
  assert.equal(mat.normalMap, null);
  assert.equal(mat.bumpMap, null);
  assert.notEqual(
    mat.customProgramCacheKey(),
    new THREE.MeshStandardMaterial().customProgramCacheKey(),
  );
});
