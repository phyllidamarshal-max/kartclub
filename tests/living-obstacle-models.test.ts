import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  DEFAULT_TRACK,
  TRACKS,
  trackPoint,
  type Track,
} from "../shared/track.ts";
import {
  movingObstaclesAt,
  pendulumLength,
  movingObstacleClearance,
  type MovingObstacleSpec,
} from "../shared/moving-obstacles.ts";
import { KART_FOOTPRINT } from "../shared/kart-contact.ts";
import { terrainHeight } from "../client/level-scenery.ts";
import { createKartModel } from "../client/kart-model.ts";
import { buildMovingObstacles } from "../client/moving-obstacles.ts";

function fixture(kind: MovingObstacleSpec["kind"]) {
  const point = trackPoint(0.35, DEFAULT_TRACK);
  const spec: MovingObstacleSpec = {
    id: kind,
    kind,
    x: point.x,
    y: point.y,
    z: point.z,
    heading: point.heading,
    radius: kind === "pendulum" ? 2.2 : 1.8,
    amplitude: 8,
    period: 12,
    phase: 0,
  };
  const track: Track = { ...DEFAULT_TRACK, movingObstacles: [spec] };
  const scene = new THREE.Scene();
  const renderer = buildMovingObstacles(scene, track);
  return {
    scene,
    renderer,
    track,
    spec,
    body: scene.getObjectByName(`moving-obstacle:${kind}`)!,
  };
}

for (const kind of ["sheep", "deer", "pendulum"] as const)
  test(`${kind}: every animated solid vertex fits the shared circular footprint, update reuses resources`, () => {
    const { scene, renderer, track, body, spec } = fixture(kind);
    const resources = new Set<unknown>(),
      nodes = new Set<THREE.Object3D>();
    scene.traverse((o) => {
      nodes.add(o);
      if (o instanceof THREE.Mesh) {
        resources.add(o.geometry);
        resources.add(o.material);
      }
    });
    for (let i = 0; i <= 120; i++) {
      renderer.update(i * 0.1);
      scene.updateMatrixWorld(true);
      const pose = movingObstaclesAt(track, i * 0.1)[0];
      assert.equal(body.position.y, pose.y);
      assert.equal(body.rotation.y, pose.facing);
      body.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const positions = o.geometry.getAttribute("position");
        const v = new THREE.Vector3();
        for (let j = 0; j < positions.count; j++) {
          v.fromBufferAttribute(positions, j).applyMatrix4(o.matrixWorld);
          assert.ok(
            Math.hypot(v.x - pose.x, v.z - pose.z) <= spec.radius + 1e-5,
            `${kind} ${o.name}: ${Math.hypot(v.x - pose.x, v.z - pose.z)} > ${spec.radius}`,
          );
        }
      });
      scene.traverse((o) => {
        assert.ok(nodes.has(o));
        if (o instanceof THREE.Mesh) {
          assert.ok(resources.has(o.geometry));
          assert.ok(resources.has(o.material));
        }
      });
    }
    const solidGeometries = new Set<unknown>();
    body.traverse((o) => {
      if (o instanceof THREE.Mesh) solidGeometries.add(o.geometry);
    });
    assert.ok(
      solidGeometries.size <= 4,
      "solid primitives should share a small geometry palette",
    );
  });

for (const kind of ["sheep", "deer"] as const)
  test(`${kind} actually walks through joints and turns its head while dwelling`, () => {
    const { scene, renderer, body } = fixture(kind);
    const hip = body.getObjectByName("hip:1:1")!,
      knee = body.getObjectByName("knee:1:1")!,
      head = body.getObjectByName("head-look")!;
    const hipAngles = new Set<number>(),
      kneeAngles = new Set<number>(),
      headAngles = new Set<number>();
    for (let i = 0; i <= 120; i++) {
      renderer.update(i * 0.1);
      hipAngles.add(hip.rotation.x);
      kneeAngles.add(knee.rotation.x);
      if (i < 18) headAngles.add(head.rotation.y);
    }
    assert.ok(hipAngles.size > 10);
    assert.ok(kneeAngles.size > 10);
    assert.ok(headAngles.size > 5);
    assert.ok(body.getObjectByName("nose"));
    assert.ok(body.getObjectByName("eye"));
    assert.ok(body.getObjectByName("hoof"));
    assert.equal(scene.getObjectByName(`obstacle-rig:${kind}`), undefined);
  });

test("pendulum rod end matches lifted weight center; fixed support is separate from collision body", () => {
  const { scene, renderer, track, spec, body } = fixture("pendulum");
  const rig = scene.getObjectByName("obstacle-rig:pendulum")!,
    pivot = rig.getObjectByName("swing-pivot")!;
  assert.ok(rig);
  assert.ok(!body.getObjectByName("pendulum-rod"));
  for (let i = 0; i < 40; i++) {
    renderer.update(i * 0.3);
    scene.updateMatrixWorld(true);
    const pose = movingObstaclesAt(track, i * 0.3)[0];
    const end = pivot.localToWorld(
      new THREE.Vector3(0, -pendulumLength(spec), 0),
    );
    assert.ok(
      end.distanceTo(new THREE.Vector3(pose.x, pose.y + spec.radius, pose.z)) <
        1e-7,
    );
  }
});

test("authored pendulums present a low solid impact surface at physical collision onset", () => {
  const kart = createKartModel("#a7cf35");
  const frontBounds = new THREE.Box3().setFromObject(
    kart.getObjectByName("front-bumper")!,
    true,
  );
  const authoredNoseMargin =
    Math.max(...KART_FOOTPRINT.map((p) => p[1])) - frontBounds.max.z;
  for (const track of TRACKS)
    for (const spec of track.movingObstacles ?? []) {
      if (spec.kind !== "pendulum") continue;
      assert.ok(
        Math.abs(spec.amplitude) <= 3,
        "authored low sweep must retain impact-height skirt",
      );
      const scene = new THREE.Scene();
      const renderer = buildMovingObstacles(scene, {
        ...track,
        movingObstacles: [spec],
      });
      const skirt = scene.getObjectByName("impact-skirt")!;
      for (let tick = 0; tick <= 16; tick++)
        for (const relativeHeading of [0, 0.3, -0.3, Math.PI]) {
          const clock = (spec.period * tick) / 16;
          const pose = movingObstaclesAt({ movingObstacles: [spec] }, clock)[0];
          renderer.update(clock);
          const heading = spec.heading + relativeHeading;
          let low = 0,
            high = 10;
          for (let step = 0; step < 40; step++) {
            const distance = (low + high) / 2;
            const body = {
              x: pose.x - Math.sin(heading) * distance,
              z: pose.z - Math.cos(heading) * distance,
              heading,
            };
            if (movingObstacleClearance(body, pose).distance > 0)
              high = distance;
            else low = distance;
          }
          kart.position.set(
            pose.x - Math.sin(heading) * high,
            spec.y,
            pose.z - Math.cos(heading) * high,
          );
          kart.rotation.y = heading;
          scene.updateMatrixWorld(true);
          kart.updateMatrixWorld(true);
          const skirtBox = new THREE.Box3().setFromObject(skirt, true);
          let closest = Infinity;
          for (const name of [
            "front-bumper",
            "front-bumper-rubber",
            "nose-fairing",
            "chassis",
          ]) {
            const box = new THREE.Box3().setFromObject(
              kart.getObjectByName(name)!,
              true,
            );
            // This is an inverse bounding-box clearance check, not triangle intersection.
            // It rejects a vertically separated airwall, permitting the kart outline's
            // authored small plan-view safety margin at the mathematical onset.
            if (box.max.y < skirtBox.min.y || box.min.y > skirtBox.max.y)
              continue;
            const dx = Math.max(
              0,
              box.min.x - skirtBox.max.x,
              skirtBox.min.x - box.max.x,
            );
            const dz = Math.max(
              0,
              box.min.z - skirtBox.max.z,
              skirtBox.min.z - box.max.z,
            );
            closest = Math.min(closest, Math.hypot(dx, dz));
          }
          assert.ok(
            closest < 0.25,
            `${spec.id} clock ${clock}: visible impact gap ${closest}`,
          );
          // Regression fixture: the reported z=-4m impact must visibly meet solid
          // geometry, including at the lifted endpoint, without a gap allowance.
          kart.position.set(
            pose.x - Math.sin(heading) * 4,
            spec.y,
            pose.z - Math.cos(heading) * 4,
          );
          kart.updateMatrixWorld(true);
          assert.ok(
            ["front-bumper", "nose-fairing", "chassis"].some((name) =>
              skirtBox.intersectsBox(
                new THREE.Box3().setFromObject(
                  kart.getObjectByName(name)!,
                  true,
                ),
              ),
            ),
            `${spec.id} clock ${clock}: four-metre fixture misses actual solid mesh boxes`,
          );
        }
    }
});

test("authored portal feet are buried into actual terrain and posts reach the feet", () => {
  for (const track of TRACKS)
    for (const spec of track.movingObstacles ?? []) {
      if (spec.kind !== "pendulum") continue;
      const scene = new THREE.Scene();
      buildMovingObstacles(scene, { ...track, movingObstacles: [spec] });
      scene.updateMatrixWorld(true);
      const rig = scene.getObjectByName(`obstacle-rig:${spec.id}`)!;
      const feet: THREE.Object3D[] = [],
        posts: THREE.Object3D[] = [];
      rig.traverse((o) => {
        if (o.name === "support-foot") feet.push(o);
        if (o.name === "support-post") posts.push(o);
      });
      assert.equal(feet.length, 2);
      for (let i = 0; i < feet.length; i++) {
        const foot = feet[i],
          box = new THREE.Box3().setFromObject(foot, true);
        for (const x of [-0.5, 0.5])
          for (const z of [-0.5, 0.5]) {
            const corner = foot.localToWorld(new THREE.Vector3(x, -0.5, z));
            assert.ok(
              corner.y <= terrainHeight(track, corner.x, corner.z) - 0.149,
              `${spec.id} foot floats`,
            );
          }
        const post = new THREE.Box3().setFromObject(posts[i], true);
        assert.ok(post.min.y <= box.max.y && post.max.y > box.max.y);
      }
    }
});
