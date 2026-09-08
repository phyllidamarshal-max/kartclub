import { aiInput } from "../shared/ai.ts";
import { aiInput as beforeAI } from "../tests/fixtures/ai-before-mastery.ts";
import { CHALLENGES } from "../shared/gameplay.ts";
import { getTrack } from "../shared/track.ts";
import { spawnCar, stepCar, separateCars } from "../shared/race.ts";
import { createItems, stepItems } from "../shared/items.ts";

// Four current vs four immediately preceding controllers on the same grid.
// Alternate grid sides over two seeds. This is a bot benchmark, not human data.
const records = [];
for (const q of CHALLENGES.filter((q) => q.opponents > 0))
  for (const [side, seed] of [537, 42].entries()) {
    const track = getTrack(q.trackId);
    const cars = Array.from({ length: 8 }, (_, slot) =>
      spawnCar(slot, "ai" + slot, track),
    );
    const next = (slot: number) => slot % 2 === side;
    const world =
      q.mode === "items"
        ? createItems(
            cars.map((c) => c.id),
            track,
            seed,
          )
        : null;
    let clock = 0,
      decisionsMs = 0,
      maxTickMs = 0,
      ticks = 0;
    while (clock < 300 && cars.some((c) => !c.finished)) {
      clock += 1 / 60;
      const start = performance.now();
      const inputs = Object.fromEntries(
        cars.map((c) => [
          c.id,
          (next(c.slot) ? aiInput : beforeAI)(
            c,
            track,
            "hard",
            clock,
            cars,
            world,
          ),
        ]),
      );
      const duration = performance.now() - start;
      decisionsMs += duration;
      maxTickMs = Math.max(maxTickMs, duration);
      ticks++;
      for (const c of cars) {
        stepCar(c, inputs[c.id], 1 / 60, track);
        if (!c.finished && c.lap >= q.laps) {
          c.finished = true;
          c.time = c.lastLapTime;
        }
      }
      separateCars(cars, track);
      if (world) stepItems(world, cars, inputs, 1 / 60, track);
    }
    const standings = cars
      .sort((a, b) =>
        a.finished && b.finished ? a.time - b.time : b.progress - a.progress,
      )
      .map((c, i) => ({
        rank: i + 1,
        revision: next(c.slot) ? "after" : "before",
        slot: c.slot,
        finished: c.finished,
        time: c.time,
        nitro: c.nitroUses,
        items: world?.players[c.id].uses ?? 0,
      }));
    records.push({
      challenge: q.id,
      track: track.id,
      mode: q.mode,
      seed,
      newGridSide: side,
      meanDecisionMsForEight: decisionsMs / ticks,
      maxDecisionTickMs: maxTickMs,
      standings,
    });
  }
console.log(
  JSON.stringify(
    {
      description:
        "Current vs preceding AI, all hard, identical legal resources and physics; not human performance data.",
      records,
    },
    null,
    2,
  ),
);
