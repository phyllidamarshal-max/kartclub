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
