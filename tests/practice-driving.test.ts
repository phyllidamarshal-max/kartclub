import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKS } from "../shared/track.ts";
import { aiInput } from "../shared/ai.ts";
import { stepCar } from "../shared/race.ts";
import { CornerPractice, practiceCorners } from "../client/practice.ts";

test("every offered corner practice can be completed from its standing start on ordinary inputs", () => {
  for (const track of TRACKS) {
    for (let index = 0; index < practiceCorners(track).length; index++) {
      const practice = new CornerPractice(track, index),
        car = practice.restart();
      for (let frame = 0; frame < 60 * 30 && !practice.complete(car); frame++)
        stepCar(car, aiInput(car, track, "hard", frame / 60), 1 / 60, track);
      assert.ok(
        practice.complete(car),
        `${track.id} bend ${index + 1} must remain reachable after spawning`,
      );
    }
  }
});
