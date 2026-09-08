import { aiInput } from "../shared/ai.ts";
import { aiInput as oldInput } from "../tests/fixtures/ai-before-mastery.ts";
import { CHALLENGES, type Difficulty } from "../shared/gameplay.ts";
import { getTrack } from "../shared/track.ts";
import { spawnCar, stepCar, separateCars } from "../shared/race.ts";
import { createItems, stepItems } from "../shared/items.ts";

// Complete identical legal races with the old and new controller. No account,
// browser storage, player economy or score files are read or written.
const records = [];
for (const q of CHALLENGES.filter((q) => q.opponents > 0)) {
  const runs = [];
  for (const seed of [537, 42, 2026]) {
    const beforeDifficulty: Difficulty = q.difficulty;
    const pair = [];
    for (const [revision, controller, difficulty] of [
      ["before", oldInput, beforeDifficulty],
      ["after", aiInput, q.difficulty],
    ] as const) {
      const track = getTrack(q.trackId),
        cars = Array.from({ length: q.opponents + 1 }, (_, slot) =>
          spawnCar(slot, "ai" + slot, track),
        );
      const world =
        q.mode === "items"
          ? createItems(
              cars.map((c) => c.id),
              track,
              seed,
            )
          : null;
      let clock = 0,
        resets = 0;
      while (clock < 300 && cars.some((c) => !c.finished)) {
        clock += 1 / 60;
        const inputs = Object.fromEntries(
          cars.map((c) => [
            c.id,
            (controller as typeof aiInput)(
              c,
              track,
              difficulty,
              clock,
              cars,
              world,
            ),
          ]),
        );
        for (const c of cars) {
          if (inputs[c.id].reset && !c.resetHeld) resets++;
          stepCar(c, inputs[c.id], 1 / 60, track);
          if (!c.finished && c.lap >= q.laps) {
            c.finished = true;
            c.time = c.lastLapTime;
          }
        }
        separateCars(cars, track);
        if (world) stepItems(world, cars, inputs, 1 / 60, track);
      }
      const times = cars
        .filter((c) => c.finished)
        .map((c) => c.time)
        .sort((a, b) => a - b);
      pair.push({
        revision,
        difficulty,
        finished: times.length,
        first: times[0] ?? null,
        last: times.at(-1) ?? null,
        median: times.length ? times[Math.floor(times.length / 2)] : null,
        resets,
        collisions: cars.reduce((sum, c) => sum + c.collisionCount, 0),
        nitro: cars.reduce((sum, c) => sum + c.nitroUses, 0),
        mini: cars.reduce((sum, c) => sum + c.miniUses, 0),
        itemUses: world
          ? Object.values(world.players).reduce((sum, p) => sum + p.uses, 0)
          : 0,
      });
    }
    runs.push({ seed, before: pair[0], after: pair[1] });
  }
  records.push({
    challenge: q.id,
    track: q.trackId,
    laps: q.laps,
    cars: q.opponents + 1,
    runs,
  });
}
console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      step: 1 / 60,
      unchangedPlayerPhysics: true,
      records,
    },
    null,
    2,
  ),
);
