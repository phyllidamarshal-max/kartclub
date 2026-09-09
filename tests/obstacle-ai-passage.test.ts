import assert from "node:assert/strict";
import { test } from "node:test";
import { TRACKS, nearestTrack, trackPoint } from "../shared/track.ts";
import { aiInput } from "../shared/ai.ts";
import { spawnCar, stepCar } from "../shared/race.ts";
import {
  movingObstacleClearance,
  movingObstaclesAt,
} from "../shared/moving-obstacles.ts";
import {
  predictObstaclePassage,
  obstaclePassageClearance,
} from "../shared/ai-obstacles.ts";

test("passage prediction preserves the rotating arm's directional gap instead of a full disc", () => {
  const track = TRACKS.find((t) => t.id === "city-switchback")!;
  const authored = track.movingObstacles!.find((s) => s.kind === "spinner")!;
  const longitudinal = { ...authored, phase: 0, period: 0 };
  const transverse = { ...longitudinal, phase: Math.PI / 2 };
  const narrow = predictObstaclePassage(longitudinal, track, 0, 1, 30);
  const broad = predictObstaclePassage(transverse, track, 0, 1, 30);
  assert.ok(
    obstaclePassageClearance(narrow, 3.1) > 0.4,
    "real longitudinal arm leaves a usable gap",
  );
  assert.ok(
    obstaclePassageClearance(broad, 3.1) < 0,
    "the rotated arm occupies the same lane",
  );
  assert.ok(
    obstaclePassageClearance(narrow, 0) < 0,
    "central bearing remains solid",
  );
  const rotating = predictObstaclePassage(
    { ...authored, phase: 0 },
    track,
    0,
    1,
    30,
  );
  assert.ok(
    new Set(rotating.map((s) => s.pose.facing)).size > 3,
    "passage samples actual changing orientation",
  );
});

for (const track of TRACKS)
  for (const spec of track.movingObstacles ?? []) {
    if (!["spinner", "minecart", "hauler"].includes(spec.kind)) continue;
    test(`AI passes authored ${track.id}/${spec.id} from 85m upstream across phases`, () => {
      const crossing = nearestTrack(spec.x, spec.z, track);
      for (const difficulty of ["normal", "hard"] as const)
        for (const phase of [0, 0.25, 0.5, 0.75]) {
          const t = crossing.t - 85 / track.length,
            p = trackPoint(t, track);
          const car = spawnCar(1, "passage", track);
          Object.assign(car, {
            x: p.x,
            z: p.z,
            lastX: p.x,
            lastZ: p.z,
            heading: p.heading,
            lastT: t,
            progress: t,
            spawnProgress: t,
            checkpoint: Math.floor(t * 12),
            ghostTime: 0,
            speed: 28,
            vx: Math.sin(p.heading) * 28,
            vz: Math.cos(p.heading) * 28,
          });
          const startClock = phase * spec.period;
          let passed = false;
          for (let tick = 0; tick < 20 * 60; tick++) {
            const clock = startClock + tick / 60;
            stepCar(
              car,
              aiInput(car, track, difficulty, clock),
              1 / 60,
              track,
              clock,
            );
            assert.equal(
              car.resetTime,
              0,
              `${spec.id}/${difficulty}/${phase}: reset at ${tick / 60}s`,
            );
            const pose = movingObstaclesAt(
              { movingObstacles: [spec] },
              clock + 1 / 60,
            )[0];
            const clearance = movingObstacleClearance(car, pose).distance;
            assert.ok(
              clearance >= -0.002,
              `${spec.id}/${difficulty}/${phase}: overlap ${clearance} at ${tick / 60}s`,
            );
            if ((car.progress - crossing.t) * track.length > 25) {
              passed = true;
              break;
            }
          }
          assert.ok(
            passed,
            `${spec.id}/${difficulty}/${phase}: stalled ${(car.progress - crossing.t) * track.length}m from crossing, speed ${car.speed}, collisions ${car.collisionCount}`,
          );
        }
    });
  }
