import { test } from "node:test";
import assert from "node:assert/strict";
import {
  spawnCar,
  stepCar,
  EMPTY_INPUT,
  advanceProgress,
} from "../shared/race.ts";
import { trackPoint, TRACK_LENGTH } from "../shared/track.ts";
test("throttle accelerates a vehicle and finite positions survive malformed input", () => {
  const c = spawnCar(0);
  for (let i = 0; i < 60; i++)
    stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, 1 / 60);
  assert.ok(c.speed > 15);
  stepCar(c, { ...EMPTY_INPUT, throttle: NaN, steer: Infinity }, 1 / 60);
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.speed));
});
test("idle drift cannot generate energy and empty boost cannot accelerate", () => {
  const c = spawnCar(0);
  for (let i = 0; i < 120; i++)
    stepCar(c, { ...EMPTY_INPUT, drift: true, steer: 1, boost: true }, 1 / 60);
  assert.equal(c.energy, 0);
  assert.equal(c.boostTime, 0);
});
test("nitro consumes a whole charge only on a new press", () => {
  const c = spawnCar(0);
  c.energy = 100;
  stepCar(c, { ...EMPTY_INPUT, boost: true }, 1 / 60);
  assert.ok(c.energy < 1);
  assert.ok(c.boostTime > 0);
});
test("reset returns car to its validated checkpoint without granting progress", () => {
  const c = spawnCar(0);
  c.x = 999;
  c.z = 999;
  const p = c.progress;
  stepCar(c, { ...EMPTY_INPUT, reset: true }, 1 / 60);
  assert.equal(c.progress, p);
  assert.ok(Math.hypot(c.x, c.z) < 400);
});
test("forward sequential travel completes a lap but skips/reverse crossings do not", () => {
  const c = spawnCar(0);
  for (let d = 0; d < TRACK_LENGTH + 3; d += 2)
    advanceProgress(c, (d % TRACK_LENGTH) / TRACK_LENGTH);
  assert.equal(c.lap, 1);
  const bad = spawnCar(0);
  advanceProgress(bad, 0.8);
  advanceProgress(bad, 0.02);
  assert.equal(bad.lap, 0);
  const reverse = spawnCar(0);
  advanceProgress(reverse, 0.99);
  advanceProgress(reverse, 0.98);
  assert.equal(reverse.lap, 0);
});
test("track is closed with a finite tangent", () => {
  const a = trackPoint(0),
    b = trackPoint(1);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.001);
  assert.ok(Number.isFinite(a.heading));
});
