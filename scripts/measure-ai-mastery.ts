import { aiInput } from "../shared/ai.ts";
import { aiInput as beforeAI } from "../tests/fixtures/ai-before-mastery.ts";
import { TRACKS } from "../shared/track.ts";
import { spawnCar, stepCar } from "../shared/race.ts";
import type { Difficulty } from "../shared/gameplay.ts";

// Independent legal-input laps. The fixture is the controller immediately before
// this revision, with the same current player physics and no granted resources.
const revisions = process.argv.includes("--before")
  ? [["before", beforeAI] as const]
  : process.argv.includes("--after")
    ? [["after", aiInput] as const]
    : [["before", beforeAI] as const, ["after", aiInput] as const];
const difficulties: Difficulty[] = process.argv.includes("--all")
  ? ["easy", "normal", "hard"]
  : ["hard"];
const records = [];
for (const [revision, controller] of revisions)
  for (const difficulty of difficulties)
    for (const track of TRACKS) {
      const car = spawnCar(1, "measure", track);
      let resets = 0,
        driftSeconds = 0,
        boostDriftSeconds = 0,
        maxSlip = 0;
      for (let i = 0; i < 60 * 300 && car.lap < 3; i++) {
        const input = controller(car, track, difficulty, i / 60);
        if (input.reset && !car.resetHeld) resets++;
        if (input.drift) driftSeconds += 1 / 60;
        if (input.drift && car.boostTime > 0) boostDriftSeconds += 1 / 60;
        stepCar(car, input, 1 / 60, track);
        maxSlip = Math.max(maxSlip, Math.abs(car.slipAngle));
      }
      records.push({
        revision,
        difficulty,
        track: track.id,
        finished: car.lap >= 3,
        seconds: +car.time.toFixed(3),
        collisions: car.collisionCount,
        resets,
        nitro: car.nitroUses,
        mini: car.miniUses,
        energy: +car.driftTotal.toFixed(2),
        driftSeconds: +driftSeconds.toFixed(2),
        boostDriftSeconds: +boostDriftSeconds.toFixed(2),
        maxSlip: +maxSlip.toFixed(3),
      });
    }
console.log(
  JSON.stringify({ physics: "driving-v3.1", laps: 3, records }, null, 2),
);
