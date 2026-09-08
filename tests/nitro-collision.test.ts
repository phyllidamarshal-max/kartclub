import { test } from "node:test";
import assert from "node:assert/strict";
import {
  spawnCar,
  stepCar,
  separateCars,
  EMPTY_INPUT,
} from "../shared/race.ts";
import { DEFAULT_TRACK, trackPoint } from "../shared/track.ts";

const dt = 1 / 60;
function movingCar(speed = 35) {
  const c = spawnCar();
  Object.assign(c, {
    speed,
    vx: Math.sin(c.heading) * speed,
    vz: Math.cos(c.heading) * speed,
  });
  return c;
}
function wallHit(
  angle: number,
  energy = 80,
  phase: "drift" | "straight" | "recovering" | "aligned" | "held" = "drift",
) {
  const c = spawnCar(),
    p = trackPoint(0),
    side = DEFAULT_TRACK.width / 2 - 1.05 - 0.015;
  Object.assign(c, {
    x: p.x + Math.cos(p.heading) * side,
    z: p.z - Math.sin(p.heading) * side,
    heading:
      p.heading +
      angle +
      (phase === "drift" || phase === "recovering" ? 0.3 : 0),
    speed: 35,
    energy,
    storedNitro: 1,
    driftDuration:
      phase === "drift" || phase === "recovering" || phase === "aligned"
        ? 0.4
        : 0,
    driftState:
      phase === "drift"
        ? "drifting"
        : phase === "recovering" || phase === "aligned"
          ? "recovering"
          : "grip",
    drifting: phase === "drift",
    miniWindow: 0.3,
    lastT: 0,
    progress: 0,
  });
  c.vx = Math.sin(p.heading + angle) * c.speed;
  c.vz = Math.cos(p.heading + angle) * c.speed;
  c.lastX = c.x;
  c.lastZ = c.z;
  stepCar(
    c,
    {
      ...EMPTY_INPUT,
      throttle: 1,
      drift: phase === "drift" || phase === "held",
      steer: phase === "drift" ? 0.2 : 0,
    },
    dt,
  );
  return c;
}

test("a quick point drift earns less than a committed clean drift and neither fills a bottle", () => {
  const c = movingCar(),
    point = movingCar();
  for (let i = 0; i < 10; i++)
    stepCar(point, { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 1 }, dt);
  for (let i = 0; i < 40; i++)
    stepCar(c, { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 1 }, dt);
  console.log("40-tick charge", c.driftTotal);
  assert.equal(c.collisionCount, 0);
  assert.ok(point.driftTotal < 5);
  assert.ok(c.driftTotal > point.driftTotal * 5);
  assert.equal(c.storedNitro, 0);
});

test("a full gauge waits for drift release and cannot mint repeated bottles while drift stays held", () => {
  const c = movingCar();
  c.energy = 100;
  const track = { ...DEFAULT_TRACK, width: 2000 };
  for (let i = 0; i < 30; i++)
    stepCar(
      c,
      { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 1 },
      dt,
      track,
    );
  assert.equal(c.storedNitro, 0);
  assert.equal(c.energy, 100);
  assert.equal(
    c.driftTotal,
    0,
    "a capped gauge cannot farm career drift score",
  );
  stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, dt, track);
  assert.equal(c.storedNitro, 1);
  assert.equal(c.energy, 0);
  stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, dt, track);
  assert.equal(c.storedNitro, 1);
});

test("wall impacts deduct current charge by severity, retain bottles and interrupt mini eligibility", () => {
  const light = wallHit(0.15),
    hard = wallHit(1);
  assert.ok(light.energy < 80 && light.energy >= 55, `light ${light.energy}`);
  assert.ok(
    hard.energy < light.energy && hard.energy >= 20,
    `hard ${hard.energy}`,
  );
  for (const c of [light, hard]) {
    assert.equal(c.storedNitro, 1);
    assert.equal(c.miniWindow, 0);
    assert.equal(c.lastCollisionKind, "wall");
    assert.ok(c.energyLockTime > 0);
    assert.ok(c.lastEnergyLoss > 0);
  }
});

test("holding a full gauge into a collision cannot convert it before the impact penalty", () => {
  const c = wallHit(1, 100);
  assert.equal(c.storedNitro, 1);
  assert.ok(c.energy < 100 && c.energy > 0);
});

test("one contact episode does not drain repeatedly and stationary overlap corrections are free", () => {
  const a = movingCar(30),
    b = spawnCar(1, "other");
  b.x = a.x + Math.sin(a.heading) * 1.8;
  b.z = a.z + Math.cos(a.heading) * 1.8;
  a.energy = b.energy = 90;
  a.heading += 0.3;
  a.drifting = true;
  a.driftState = "drifting";
  separateCars([a, b]);
  assert.ok(a.energy < 90);
  assert.equal(b.energy, 90, "the other driver is not drifting");
  const before = [a.energy, b.energy, a.collisionCount, b.collisionCount];
  for (let i = 0; i < 10; i++) separateCars([a, b]);
  assert.deepEqual(
    [a.energy, b.energy, a.collisionCount, b.collisionCount],
    before,
  );
  const x = spawnCar(),
    y = spawnCar(1, "stationary");
  y.x = x.x;
  y.z = x.z;
  x.energy = y.energy = 70;
  separateCars([x, y]);
  assert.equal(x.energy, 70);
  assert.equal(y.energy, 70);
});

test("straight driving, held Shift without a slide, and a fully aligned recovery never lose gauge on a wall", () => {
  for (const phase of ["straight", "held", "aligned"] as const) {
    const c = wallHit(0.7, 80, phase);
    assert.equal(c.energy, 80, phase);
    assert.equal(c.energyLockTime, 0, phase);
    assert.equal(c.lastEnergyLoss, 0, phase);
    assert.equal(
      c.collisionCount,
      1,
      "collision still emits sound and physical feedback",
    );
    assert.ok(c.speed < 35);
  }
});

test("unfinished drift recovery still loses gauge if the sliding kart hits a wall", () => {
  const c = wallHit(0.7, 80, "recovering");
  assert.ok(c.energy < 80);
  assert.ok(c.energyLockTime > 0);
});

test("two non-drifting karts can collide without losing either gauge", () => {
  const a = movingCar(30),
    b = spawnCar(1, "straight-rival");
  b.x = a.x + Math.sin(a.heading) * 1.8;
  b.z = a.z + Math.cos(a.heading) * 1.8;
  a.energy = b.energy = 80;
  separateCars([a, b]);
  assert.equal(a.energy, 80);
  assert.equal(b.energy, 80);
  assert.ok(a.collisionCount > 0 && b.collisionCount > 0);
});

test("a straight nitro run hitting an obstacle retains gauge and bottles", () => {
  const c = movingCar(40);
  c.energy = 80;
  c.storedNitro = 1;
  c.boostTime = 2;
  const track = {
    ...DEFAULT_TRACK,
    obstacles: [
      {
        x: c.x + Math.sin(c.heading) * 3.2,
        z: c.z + Math.cos(c.heading) * 3.2,
        radius: 2,
      },
    ],
  };
  stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, dt, track);
  assert.equal(c.energy, 80);
  assert.equal(c.storedNitro, 1);
  assert.equal(c.lastCollisionKind, "obstacle");
  assert.ok(c.speed < 10);
  assert.ok(c.boostTime > 1.9);
});

test("post-impact lockout prevents immediately earning charge again or repeatedly charging against a wall", () => {
  const c = wallHit(0.65),
    before = c.driftTotal;
  for (let i = 0; i < 20; i++)
    stepCar(c, { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 1 }, dt);
  assert.equal(c.driftTotal, before);
  assert.ok(c.energy >= 0);
});

test("charge stays locked after the impact shake has faded even on a clean exit", () => {
  const c = wallHit(0.15),
    p = trackPoint(0);
  // Isolate the post-contact timers on a coherent, obstacle-free exit fixture.
  Object.assign(c, {
    x: p.x,
    z: p.z,
    lastX: p.x,
    lastZ: p.z,
    lastT: 0,
    progress: 0,
    heading: p.heading + 0.3,
    vx: Math.sin(p.heading) * 35,
    vz: Math.cos(p.heading) * 35,
    speed: 35,
  });
  const control = structuredClone(c);
  control.energyLockTime = 0;
  const track = { ...DEFAULT_TRACK, width: 2000, obstacles: [] };
  for (let i = 0; i < 20; i++) {
    const input = { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 0.7 };
    stepCar(c, input, dt, track);
    stepCar(control, input, dt, track);
  }
  assert.equal(c.impact, 0);
  assert.ok(c.energyLockTime > 0);
  assert.equal(c.driftTotal, 0);
  assert.ok(
    control.driftTotal > 1,
    "the same clean exit without a lock earns charge",
  );
});
