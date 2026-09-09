import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar, stepCar, EMPTY_INPUT } from "../shared/race.ts";
import { DEFAULT_TRACK } from "../shared/track.ts";

test("an explicit cosmetic model survives spawning and reset without changing driving", () => {
  const chosen = Reflect.apply(spawnCar, undefined, [
    0,
    "local",
    DEFAULT_TRACK,
    "vesper",
  ]);
  assert.equal(chosen.kartId, "vesper");
  const classic = Reflect.apply(spawnCar, undefined, [
    0,
    "local",
    DEFAULT_TRACK,
    "club",
  ]);
  for (let frame = 0; frame < 180; frame++) {
    const input = {
      ...EMPTY_INPUT,
      throttle: 1,
      steer: frame > 90 ? 0.3 : 0,
      drift: frame > 100,
      reset: frame === 150,
    };
    stepCar(chosen, input, 1 / 60, DEFAULT_TRACK);
    stepCar(classic, input, 1 / 60, DEFAULT_TRACK);
  }
  assert.equal(chosen.kartId, "vesper");
  const { kartId: _one, ...one } = chosen;
  const { kartId: _two, ...two } = classic;
  assert.deepEqual(one, two);
});
