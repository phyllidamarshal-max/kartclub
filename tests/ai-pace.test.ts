import { test } from "node:test";
import assert from "node:assert/strict";
import { aiInput } from "../shared/ai.ts";
import { aiInput as beforeAI } from "./fixtures/ai-before-difficulty.ts";
import { TRACKS, getTrack, trackPoint } from "../shared/track.ts";
import { spawnCar, stepCar } from "../shared/race.ts";

test("AI keeps accelerating during nitro on a clear straight instead of braking at its cruising cap", () => {
  const track = TRACKS[0],
    car = spawnCar(1, "boost", track);
  const p = trackPoint(0.025, track);
  Object.assign(car, {
    x: p.x,
    z: p.z,
    heading: p.heading,
    lastT: p.t,
    speed: 44,
    vx: Math.sin(p.heading) * 44,
    vz: Math.cos(p.heading) * 44,
    boostTime: 2,
  });
  for (const difficulty of ["normal", "hard"] as const)
    assert.ok(aiInput(car, track, difficulty, 10).throttle > 0, difficulty);
});

test("new competitive AI is materially faster on every route using unchanged legal physics", () => {
  for (const difficulty of ["normal", "hard"] as const) {
    let totalBefore = 0,
      totalAfter = 0;
    for (const track of TRACKS) {
      const results = [beforeAI, aiInput].map((controller) => {
        const c = spawnCar(1, "pace", track);
        let resets = 0;
        for (let i = 0; i < 60 * 300 && c.lap < 3; i++) {
          const input = controller(c, track, difficulty, i / 60);
          if (input.reset && !c.resetHeld) resets++;
          assert.ok(Number.isFinite(input.steer) && Math.abs(input.steer) <= 1);
          stepCar(c, input, 1 / 60, track);
        }
        assert.equal(c.lap, 3, `${track.id}/${difficulty} did not finish`);
        return {
          time: c.time,
          collisions: c.collisionCount,
          resets,
          nitro: c.nitroUses,
          mini: c.miniUses,
          drift: c.driftTotal,
        };
      });
      const [old, next] = results;
      console.log(
        JSON.stringify({
          track: track.id,
          difficulty,
          before: old,
          after: next,
        }),
      );
      assert.ok(
        next.time < old.time * 0.96,
        `${track.id}/${difficulty}: ${next.time} vs ${old.time}`,
      );
      assert.equal(next.resets, 0, `${track.id}/${difficulty} needed a reset`);
      totalBefore += old.time;
      totalAfter += next.time;
    }
    assert.ok(
      totalAfter < totalBefore * 0.85,
      `${difficulty}: aggregate improvement only ${1 - totalAfter / totalBefore}`,
    );
  }
});

test("expert AI earns and spends real drift nitro and uses recovery mini boosts", () => {
  const track = TRACKS[0],
    c = spawnCar(1, "technique", track);
  for (let i = 0; i < 60 * 160 && c.lap < 3; i++)
    stepCar(c, aiInput(c, track, "hard", i / 60), 1 / 60, track);
  assert.ok(c.driftTotal >= 100, `only ${c.driftTotal} real energy`);
  assert.ok(c.nitroUses >= 1, "no nitro use");
  assert.ok(c.miniUses >= 1, "no recovery mini boost");
});

test("AI decisions do not mutate vehicle or rival physics and remain repeatable", () => {
  const track = TRACKS[0],
    car = spawnCar(1, "driver", track),
    rival = spawnCar(0, "rival", track);
  const before = structuredClone([car, rival]);
  const first = aiInput(car, track, "hard", 4, [car, rival]);
  const second = aiInput(car, track, "hard", 4, [car, rival]);
  assert.deepEqual(first, second);
  assert.deepEqual([car, rival], before);
});

test("AI escapes a glancing obstacle contact instead of driving indefinitely against it", () => {
  const track = getTrack("city-factory"),
    c = spawnCar(1, "blocked", track);
  Object.assign(c, {
    x: -164.60210758086515,
    z: -0.7853842805733047,
    heading: -4.768941179299482,
    speed: 34.9144913,
    progress: 0.7596073236641909,
    lastT: 0.7596073236641909,
    checkpoint: 9,
  });
  c.vx = Math.sin(c.heading) * c.speed;
  c.vz = Math.cos(c.heading) * c.speed;
  c.lastX = c.x;
  c.lastZ = c.z;
  for (let i = 0; i < 60 * 15; i++)
    stepCar(c, aiInput(c, track, "hard", 160 + i / 60), 1 / 60, track);
  assert.ok(c.progress > 0.85, `still stuck at ${c.progress}`);
});

test("competitive AI follows an occupied shortcut and rejoins the main road without resetting", () => {
  const track = getTrack("mountain");
  for (const difficulty of ["normal", "hard"] as const)
    for (const index of [0, 20, 40, 60, 79]) {
      const p = track.shortcut[index],
        c = spawnCar(1, "branch", track);
      Object.assign(c, {
        x: p.x,
        z: p.z,
        lastX: p.x,
        lastZ: p.z,
        heading: p.heading,
        routeBranch: "shortcut",
        speed: 30,
        vx: Math.sin(p.heading) * 30,
        vz: Math.cos(p.heading) * 30,
        lastT: p.t,
        progress: p.t,
        checkpoint: Math.floor(p.t * 12),
      });
      let resets = 0;
      for (let i = 0; i < 60 * 25; i++) {
        const input = aiInput(c, track, difficulty, 10 + i / 60);
        if (input.reset && !c.resetHeld) resets++;
        stepCar(c, input, 1 / 60, track);
      }
      assert.ok(
        c.progress > 0.8,
        `${difficulty}/${index}: stuck at ${c.progress}`,
      );
      assert.equal(c.routeBranch, "main");
      assert.equal(resets, 0);
    }
});
