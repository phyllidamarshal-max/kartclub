import { test } from "node:test";
import assert from "node:assert/strict";
import { aiInput } from "../shared/ai.ts";
import { aiInput as precedingAI } from "./fixtures/ai-before-mastery.ts";
import { TRACKS } from "../shared/track.ts";
import { raceHardLimit } from "../shared/rules.ts";
import { spawnCar, stepCar } from "../shared/race.ts";

test("every difficulty can earn drift nitro and use recovery boosts through legal driving", () => {
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    const track = TRACKS[0],
      car = spawnCar(1, "skills", track);
    for (let i = 0; i < 60 * raceHardLimit(track.id, 3) && car.lap < 3; i++)
      stepCar(car, aiInput(car, track, difficulty, i / 60), 1 / 60, track);
    assert.equal(car.lap, 3);
    assert.ok(
      car.nitroUses >= 3,
      `${difficulty}: ${car.nitroUses} nitro in 3 laps`,
    );
    assert.ok(car.miniUses >= 3, `${difficulty}: no regular recovery boosts`);
  }
});

test("expert driving charges and spends nitro on every route, including while boosting", () => {
  let oldTotal = 0,
    newTotal = 0,
    oldHits = 0,
    newHits = 0;
  for (const track of TRACKS) {
    const car = spawnCar(1, "mastery", track);
    let chargeDuringBoost = 0,
      resets = 0;
    for (let i = 0; i < 60 * raceHardLimit(track.id, 3) && car.lap < 3; i++) {
      const input = aiInput(car, track, "hard", i / 60);
      const energy = car.driftTotal,
        boosting = car.boostTime > 1 / 60;
      if (input.reset && !car.resetHeld) resets++;
      stepCar(car, input, 1 / 60, track);
      if (boosting) chargeDuringBoost += car.driftTotal - energy;
    }
    assert.equal(car.lap, 3, track.id);
    assert.equal(resets, 0, track.id);
    assert.ok(car.nitroUses >= 6, `${track.id}: only ${car.nitroUses} nitro`);
    assert.ok(
      chargeDuringBoost >= 30,
      `${track.id}: only ${chargeDuringBoost} charge during nitro`,
    );
    const preceding = spawnCar(1, "mastery", track);
    for (
      let i = 0;
      i < 60 * raceHardLimit(track.id, 3) && preceding.lap < 3;
      i++
    )
      stepCar(
        preceding,
        precedingAI(preceding, track, "hard", i / 60),
        1 / 60,
        track,
      );
    assert.equal(preceding.lap, 3);
    assert.ok(
      car.time < preceding.time * 0.98,
      `${track.id}: ${car.time} vs preceding ${preceding.time}`,
    );
    oldTotal += preceding.time;
    newTotal += car.time;
    oldHits += preceding.collisionCount;
    newHits += car.collisionCount;
  }
  assert.ok(
    newTotal < oldTotal * 0.96,
    "expert aggregate improvement must exceed 4%",
  );
  assert.ok(
    newHits <= oldHits,
    "faster laps must not increase total solo impacts",
  );
});
