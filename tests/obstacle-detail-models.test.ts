import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { DEFAULT_TRACK, trackPoint } from "../shared/track.ts";
import { movingObstaclesAt, type MovingObstacleSpec } from "../shared/moving-obstacles.ts";
import { buildMovingObstacles } from "../client/moving-obstacles.ts";
import { buildStaticObstacles } from "../client/static-obstacle-models.ts";

for (const [kind, half, flank, radius] of [["spinner", .8, .2, 3.5], ["minecart", .45, .55, 2.1], ["hauler", .3, .7, 2.4], ["shuttle", 0, 1, 2], ["sweeper", 0, 1, 2]] as const) {
  test(`${kind}: solid geometry fits contact capsule and animation retains scene resources`, () => {
    const p = trackPoint(.35, DEFAULT_TRACK);
    const spec: MovingObstacleSpec = { id: kind, kind, x: p.x, y: p.y, z: p.z, heading: p.heading, amplitude: 3, radius, period: 12, phase: 0 };
    const track = { ...DEFAULT_TRACK, movingObstacles: [spec] };
    const scene = new THREE.Scene();
    const renderer = buildMovingObstacles(scene, track);
    const body = scene.getObjectByName(`moving-obstacle:${kind}`)!;
    const impact = body.getObjectByName("impact-deck") as THREE.Mesh;
    const impactPositions = impact.geometry.getAttribute("position");
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 24) {
      let support = -Infinity;
      for (let i = 0; i < impactPositions.count; i++) support = Math.max(support, impactPositions.getX(i) * Math.cos(angle) + impactPositions.getZ(i) * Math.sin(angle));
      const expected = flank + half * Math.abs(Math.sin(angle));
      assert.ok(expected - support < .012, "every collision approach reaches visible solid without an air gap");
    }
    const resources = new Set<unknown>();
    scene.traverse(o => { resources.add(o); if (o instanceof THREE.Mesh) { resources.add(o.geometry); resources.add(o.material); } });
    const rotations = new Set<number>();
    const v = new THREE.Vector3();
    for (let tick = 0; tick <= 24; tick++) {
      renderer.update(tick / 2);
      scene.updateMatrixWorld(true);
      const pose = movingObstaclesAt(track, tick / 2)[0];
      assert.equal(body.rotation.y, pose.facing);
      const inverse = body.matrixWorld.clone().invert();
      body.traverse(o => {
        assert.ok(resources.has(o));
        if (!(o instanceof THREE.Mesh)) return;
        assert.equal(o.userData.dynamic, true);
        assert.ok(resources.has(o.geometry) && resources.has(o.material));
        const a = o.geometry.getAttribute("position");
        for (let i = 0; i < a.count; i++) {
          v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).applyMatrix4(inverse);
          assert.ok(Math.hypot(v.x, Math.max(0, Math.abs(v.z) - half)) <= flank + 1e-5, `${kind} ${o.name} exceeds capsule at ${v.toArray()}`);
        }
      });
      rotations.add(kind === "spinner" ? body.rotation.y : body.getObjectByName("rolling-wheel")!.rotation.x);
      const deck = new THREE.Box3().setFromObject(body.getObjectByName("impact-deck")!, true);
      assert.ok(deck.min.y - pose.y < .3 && deck.max.y - pose.y > .6, "visible broad impact deck meets kart bumper height");
      if (kind === "minecart" || kind === "hauler") {
        const wheel = new THREE.Box3().setFromObject(body.getObjectByName("rolling-wheel")!, true);
        assert.ok(deck.min.y - wheel.min.y > .2, "wheel silhouette remains visible below the low impact bumper");
        assert.ok(wheel.max.y - deck.max.y > .25, "wheel shoulder rises above the thin impact bumper");
      }
    }
    assert.ok(rotations.size > 4);
  });
}

test("static circles all have full low contact bases at actual road height", () => {
  const p = trackPoint(.4, DEFAULT_TRACK);
  const track = { ...DEFAULT_TRACK, obstacles: [{ x: p.x, z: p.z, radius: 2 }, { x: p.x + 1, z: p.z + 1, radius: 2 }] };
  const scene = new THREE.Scene();
  const root = buildStaticObstacles(scene, track);
  assert.equal(root.children.length, 2);
  scene.updateMatrixWorld(true);
  const feet = root.children.map(body => body.getObjectByName("bollard-foot")! as THREE.Mesh);
  assert.equal(feet[0].geometry, feet[1].geometry);
  assert.equal(feet[0].material, feet[1].material);
  const bounds = new THREE.Box3().setFromObject(feet[0], true);
  assert.ok(bounds.min.y <= p.y + .1);
  assert.ok(bounds.max.x - bounds.min.x > 3.95);
});
