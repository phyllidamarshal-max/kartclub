import { test } from "node:test";
import assert from "node:assert/strict";
import { getTrack } from "../shared/track.ts";
import { spawnCar, stepCar } from "../shared/race.ts";
import { aiInput } from "../shared/ai.ts";
import { Training } from "../client/training.ts";
test("five-step coast teaching can complete from a fresh kart using only legal driving inputs", () => {
  const track = getTrack("coast"),
    car = spawnCar(0, "learner", track),
    training = new Training(),
    steps = new Set<number>();
  for (let frame = 0; frame < 60 * 300 && training.step < 5; frame++) {
    const clock = frame / 60,
      input = aiInput(car, track, "hard", clock),
      cycle = clock % 8;
    // Periodic committed steering is a repeatable driving fixture, not a grant of energy or progress.
    if (cycle > 3 && cycle < 3.6 && car.speed > 25) {
      input.drift = true;
      input.steer = Math.sign(input.steer || 1);
      input.throttle = 1;
    }
    if (car.miniWindow > 0) input.throttle = car.throttleHeld ? 0 : 1;
    stepCar(car, input, 1 / 60, track);
    training.update(car);
    steps.add(training.step);
  }
  assert.equal(training.step, 5);
  assert.equal(steps.size, 6);
  assert.ok(car.nitroUses >= 1);
  assert.ok(car.miniUses >= 1);
  assert.ok(car.driftTotal >= 100);
  assert.ok(car.lap >= 1);
  assert.equal(car.collisionCount, 0);
  assert.ok(car.time < 300);
  console.log(
    "legal-input training",
    JSON.stringify({
      seconds: car.time,
      laps: car.lap,
      energyEarned: car.driftTotal,
      nitro: car.nitroUses,
      mini: car.miniUses,
    }),
  );
});
