import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar, stepCar } from "../shared/race.ts";
import { pilot } from "../scripts/pilot.ts";
test("a car can complete the full circuit using only legal steering and throttle", () => {
  const c = spawnCar(0);
  let steps = 0;
  while (c.lap < 1 && steps < 60 * 90) {
    stepCar(c, pilot(c), 1 / 60);
    steps++;
  }
  assert.equal(
    c.lap,
    1,
    `lap ${c.lap}, progress ${c.progress}, time ${steps / 60}`,
  );
  assert.ok(
    steps / 60 < 55,
    `reference driver ${steps / 60}s must fit time challenge`,
  );
});

test("rear grid cars require a full legal-input lap before finishing", () => {
  for (const slot of [2, 3]) {
    const c = spawnCar(slot);
    let steps = 0;
    while (c.lap < 1 && steps < 60 * 90) {
      stepCar(c, pilot(c), 1 / 60);
      steps++;
    }
    assert.equal(c.lap, 1, `slot ${slot} did not finish`);
    assert.ok(c.progress >= 1, `slot ${slot} finished early at ${c.progress}`);
  }
});

test("legal reverse then forward driving cannot earn an early checkpoint", () => {
  const c = spawnCar(0);
  for (let i = 0; i < 180; i++)
    stepCar(c, { ...pilot(c), throttle: -1 }, 1 / 60);
  assert.ok(c.progress < 0);
  assert.equal(c.checkpoint, 0);
  let steps = 0;
  while (c.checkpoint < 1 && steps < 60 * 30) {
    stepCar(c, pilot(c), 1 / 60);
    steps++;
  }
  assert.equal(c.checkpoint, 1);
  assert.ok(c.progress >= 1 / 12);
});
