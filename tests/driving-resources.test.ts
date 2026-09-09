import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar, stepCar, EMPTY_INPUT, type Car } from "../shared/race.ts";
import { DEFAULT_TRACK, trackPoint } from "./fixtures/tracks-before-route-mastery.ts";
const dt = 1 / 60;
function drive(c: Car, n: number, input = { ...EMPTY_INPUT }) {
  for (let i = 0; i < n; i++) stepCar(c, input, dt);
}
test("AC06 two bottles plus full energy refills only the consumed inventory slot", () => {
  const c = spawnCar();
  Object.assign(c, { storedNitro: 2, energy: 100 });
  stepCar(c, { ...EMPTY_INPUT, boost: true }, dt);
  assert.equal(c.storedNitro, 2);
  assert.equal(c.energy, 0);
  assert.equal(c.nitroUses, 1);
  assert.equal(c.boostTime, 3);
  drive(c, 240, { ...EMPTY_INPUT, boost: true });
  assert.equal(c.nitroUses, 1);
  assert.equal(c.storedNitro, 2);
});
test("AC08 a fresh press in final 150ms chains once; early held input never queues", () => {
  const c = spawnCar();
  Object.assign(c, { storedNitro: 2, boostTime: 0.1 });
  stepCar(c, { ...EMPTY_INPUT, boost: true }, dt);
  drive(c, 12, { ...EMPTY_INPUT, boost: true });
  assert.equal(c.nitroUses, 1);
  assert.equal(c.storedNitro, 1);
  assert.ok(c.boostTime > 2.8);
  const early = spawnCar();
  Object.assign(early, { storedNitro: 2, boostTime: 0.3 });
  drive(early, 30, { ...EMPTY_INPUT, boost: true });
  assert.equal(early.nitroUses, 0);
  assert.equal(early.storedNitro, 2);
});
test("AC03 fast near-zero-slip steering cannot charge simply by holding drift", () => {
  const c = spawnCar();
  Object.assign(c, {
    speed: 30,
    vx: Math.sin(c.heading) * 30,
    vz: Math.cos(c.heading) * 30,
  });
  stepCar(c, { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 0.2 }, dt);
  assert.equal(c.energy, 0);
});
test("AC14 reset waits 1.5s, preserves resources and never advances a reversed car", () => {
  const c = spawnCar();
  const p = trackPoint(0.06);
  Object.assign(c, {
    x: p.x,
    z: p.z,
    progress: 0.06,
    lastT: 0.06,
    checkpoint: 2,
    storedNitro: 2,
    energy: 67,
    boostTime: 2,
    miniWindow: 0.4,
  });
  stepCar(c, { ...EMPTY_INPUT, reset: true, throttle: 1, boost: true }, dt);
  assert.ok(c.resetTime > 1.4);
  assert.equal(c.x, p.x);
  assert.equal(c.z, p.z);
  assert.equal(c.boostTime, 0);
  assert.equal(c.miniWindow, 0);
  drive(c, 89, { ...EMPTY_INPUT, reset: true, throttle: 1, boost: true });
  assert.equal(c.resetTime, 0);
  assert.ok(c.progress <= 0.06);
  assert.equal(c.storedNitro, 2);
  assert.equal(c.energy, 67);
  assert.equal(c.ghostTime, 1);
  assert.ok(Math.abs(c.time - 1.5) < 1e-9);
});
test("AC10 projected teleport cannot grant any progress or energy", () => {
  const c = spawnCar();
  const p = trackPoint(0.025);
  Object.assign(c, {
    x: p.x,
    z: p.z,
    heading: p.heading,
    speed: 30,
    vx: Math.sin(p.heading) * 30,
    vz: Math.cos(p.heading) * 30,
  });
  const before = c.progress;
  stepCar(c, { ...EMPTY_INPUT, throttle: 1, steer: 1, drift: true }, dt);
  assert.equal(c.progress, before);
  assert.equal(c.energy, 0);
});
test("finish cancels eligibility and queued input without consuming resources", () => {
  const c = spawnCar();
  Object.assign(c, {
    finished: true,
    storedNitro: 2,
    energy: 80,
    boostTime: 2,
    miniWindow: 0.4,
    nitroBuffer: 0.1,
  });
  stepCar(c, { ...EMPTY_INPUT, boost: true, throttle: 1 }, dt);
  assert.equal(c.miniWindow, 0);
  assert.equal(c.nitroBuffer, 0);
  assert.equal(c.boostTime, 0);
  assert.equal(c.storedNitro, 2);
  assert.equal(c.energy, 80);
  assert.equal(c.time, 0);
});

test("AC04 holding drift after real recovery cannot postpone or renew the mini window", () => {
  const c = spawnCar(),
    track = { ...DEFAULT_TRACK, width: 2000, obstacles: [] };
  Object.assign(c, {
    speed: 35,
    vx: Math.sin(c.heading) * 35,
    vz: Math.cos(c.heading) * 35,
  });
  for (let i = 0; i < 25; i++)
    stepCar(
      c,
      { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 1 },
      dt,
      track,
    );
  assert.ok(c.driftDuration >= 0.25);
  let recoveredAt = -1;
  for (let i = 0; i < 120; i++) {
    stepCar(
      c,
      { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 0.16 },
      dt,
      track,
    );
    if (recoveredAt < 0 && Math.abs(c.slipAngle) <= (8 * Math.PI) / 180) {
      recoveredAt = c.time;
      assert.equal(
        c.miniWindow,
        0.5,
        "actual recovery opens the window while drift remains held",
      );
      assert.equal(c.driftDuration, 0, "the qualifying drift is consumed once");
    }
  }
  assert.ok(recoveredAt > 0 && c.time - recoveredAt > 0.5);
  assert.equal(c.impact, 0);
  assert.equal(c.miniWindow, 0);
  stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, dt, track);
  assert.equal(
    c.miniWindow,
    0,
    "releasing drift cannot renew an expired window",
  );
  stepCar(c, EMPTY_INPUT, dt, track);
  stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, dt, track);
  assert.equal(c.miniUses, 0);
});

test("AC04/05 a real drift recovers once and needs a new throttle press", () => {
  const c = spawnCar();
  Object.assign(c, {
    speed: 35,
    vx: Math.sin(c.heading) * 35,
    vz: Math.cos(c.heading) * 35,
  });
  drive(c, 40, { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 0.65 });
  assert.ok(c.driftDuration >= 0.25);
  assert.ok(c.energy > 0);
  for (let i = 0; i < 30 && c.miniWindow <= 0; i++)
    stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, dt);
  assert.ok(c.miniWindow > 0);
  assert.equal(c.miniUses, 0);
  stepCar(c, EMPTY_INPUT, dt);
  stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, dt);
  assert.equal(c.miniUses, 1);
  assert.equal(c.miniTime, 0.35);
  drive(c, 90, { ...EMPTY_INPUT, throttle: 1 });
  assert.equal(c.miniUses, 1);
  assert.equal(c.miniWindow, 0);
});
test("AC07 nitro overrides mini without multiplying acceleration or speed caps", () => {
  const c = spawnCar(),
    other = spawnCar();
  Object.assign(c, { storedNitro: 1, miniWindow: 0.5 });
  Object.assign(other, { storedNitro: 1 });
  stepCar(c, { ...EMPTY_INPUT, throttle: 1, boost: true }, dt);
  stepCar(other, { ...EMPTY_INPUT, throttle: 1, boost: true }, dt);
  assert.equal(c.speed, other.speed);
  assert.equal(c.miniUses, 0);
  assert.equal(c.miniTime, 0);
  const straight = { ...DEFAULT_TRACK, width: 2000, obstacles: [] };
  for (let i = 0; i < 180; i++)
    stepCar(c, { ...EMPTY_INPUT, throttle: 1, boost: true }, dt, straight);
  assert.ok(c.speed <= 43 * 1.2 + 1e-7, `speed ${c.speed}`);
});
test("AC09 nitro wall impact removes speed, preserves its clock and cancels mini/buffer", () => {
  const c = spawnCar(),
    p = trackPoint(0);
  const track = {
    ...DEFAULT_TRACK,
    obstacles: [{ x: p.x, z: p.z, radius: 2 }],
  };
  Object.assign(c, {
    x: p.x,
    z: p.z,
    boostTime: 2,
    speed: 40,
    vx: Math.sin(c.heading) * 40,
    vz: Math.cos(c.heading) * 40,
    miniWindow: 0.4,
    nitroBuffer: 0.1,
  });
  stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, dt, track);
  assert.ok(c.speed < 10);
  assert.ok(Math.abs(c.boostTime - (2 - dt)) < 1e-9);
  assert.equal(c.miniWindow, 0);
  assert.equal(c.nitroBuffer, 0);
  assert.equal(c.collisionCount, 1);
});
test("AC03/10 reverse, wall pressure and stopped steering generate no energy", () => {
  for (const mode of ["reverse", "wall", "stopped"]) {
    const c = spawnCar();
    if (mode === "reverse")
      Object.assign(c, {
        speed: -10,
        vx: -Math.sin(c.heading) * 10,
        vz: -Math.cos(c.heading) * 10,
      });
    const p = trackPoint(0),
      track =
        mode === "wall"
          ? { ...DEFAULT_TRACK, obstacles: [{ x: c.x, z: c.z, radius: 2 }] }
          : DEFAULT_TRACK;
    for (let i = 0; i < 120; i++)
      stepCar(
        c,
        {
          ...EMPTY_INPUT,
          throttle: mode === "reverse" ? -1 : mode === "wall" ? 1 : 0,
          steer: 1,
          drift: true,
        },
        dt,
        track,
      );
    assert.equal(c.energy, 0, mode);
    assert.equal(c.storedNitro, 0, mode);
  }
});
test("AC02 same tick input at 30/60/120 render schedules produces identical state within 1e-7", () => {
  const run = (fps: number) => {
    const c = spawnCar();
    c.storedNitro = 2;
    let accumulator = 0,
      tick = 0;
    for (let frame = 0; frame < fps * 12; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-12 >= dt) {
        const input = {
          ...EMPTY_INPUT,
          throttle: tick % 180 < 175 ? 1 : 0,
          steer: tick % 120 < 40 ? 0.55 : 0,
          drift: tick % 120 < 40,
          boost: tick === 0 || tick === 178,
          reset: tick === 500,
        };
        stepCar(c, input, dt);
        tick++;
        accumulator -= dt;
      }
    }
    return c;
  };
  const baseline = run(60);
  for (const fps of [30, 120]) {
    const c = run(fps);
    for (const key of ["x", "z", "vx", "vz", "time"] as const)
      assert.ok(Math.abs(c[key] - baseline[key]) <= 1e-7);
    assert.deepEqual(c, baseline);
  }
});
test("ordinary throttle cannot creep above configured normal maximum", () => {
  const c = spawnCar();
  Object.assign(c, {
    speed: 43,
    vx: Math.sin(c.heading) * 43,
    vz: Math.cos(c.heading) * 43,
  });
  stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, dt);
  assert.ok(c.speed <= 43, `speed ${c.speed}`);
});

import { getTrack, continuousTrack } from "./fixtures/tracks-before-route-mastery.ts";
import { aiInput } from "../shared/ai.ts";
test("AC12 legal mountain branch traverses and merges with continuous canonical progress", () => {
  const track = getTrack("mountain"),
    entry = track.shortcut[0],
    exit = track.shortcut.at(-1)!;
  const c = spawnCar(0, "branch", track);
  Object.assign(c, {
    x: entry.x,
    z: entry.z,
    lastX: entry.x,
    lastZ: entry.z,
    heading: entry.heading,
    lastT: entry.t,
    progress: entry.t,
    checkpoint: 5,
    speed: 30,
    vx: Math.sin(entry.heading) * 30,
    vz: Math.cos(entry.heading) * 30,
  });
  let usedBranch = false;
  for (let i = 0; i < 60 * 30 && c.progress < exit.t + 0.02; i++) {
    const input =
      c.lastT < exit.t
        ? { ...EMPTY_INPUT, throttle: 1 }
        : aiInput(c, track, "normal", i / 60);
    const previous = c.progress;
    stepCar(c, input, dt, track);
    usedBranch ||= c.routeBranch === "shortcut";
    assert.ok(c.progress >= previous - 1e-8);
    assert.ok(c.progress - previous < 0.003);
  }
  assert.ok(usedBranch);
  assert.ok(c.progress > exit.t + 0.01, `progress ${c.progress}`);
  assert.equal(c.routeBranch, "main");
});
test("reference 40-tick clean high-slip bend earns only a modest fraction of a bottle", () => {
  const c = spawnCar();
  Object.assign(c, {
    speed: 35,
    vx: Math.sin(c.heading) * 35,
    vz: Math.cos(c.heading) * 35,
  });
  drive(c, 40, { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 1 });
  assert.equal(c.impact, 0);
  assert.ok(c.driftTotal >= 10 && c.driftTotal <= 30, `charge ${c.driftTotal}`);
});

