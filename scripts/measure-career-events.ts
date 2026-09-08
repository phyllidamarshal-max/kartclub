import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CHALLENGES } from "../shared/gameplay.ts";
import {
  ChallengeRun,
  challengeGrade,
  CAREER_EVENT_VERSION,
} from "../shared/challenge-events.ts";
import { getTrack } from "../shared/track.ts";
import {
  spawnCar,
  stepCar,
  separateCars,
  EMPTY_INPUT,
  type Input,
} from "../shared/race.ts";
import { aiInput, aiProfile } from "../shared/ai.ts";
import { createItems, stepItems } from "../shared/items.ts";
import { classify, VERSIONS, raceDeadline } from "../shared/rules.ts";
import { soloRaceComplete } from "../client/lifecycle.ts";
import { DRIVING_CONFIG } from "../shared/driving-config.ts";
const rows = [];
for (const q of CHALLENGES)
  for (const profile of process.argv.includes("--profiles") ? [0, 1, 2] : [0]) {
    const track = getTrack(q.trackId),
      run = new ChallengeRun(q),
      player = spawnCar(0, "local", track);
    const cars = [
      player,
      ...Array.from({ length: q.opponents }, (_, i) =>
        spawnCar(i + 1, "AI-" + i, track),
      ),
    ];
    const items =
      q.mode === "items"
        ? createItems(
            cars.map((c) => c.id),
            track,
          )
        : null;
    if (items && q.startingItem) items.players.local.held = q.startingItem;
    const competitive = q.mode === "race" || q.mode === "items";
    const deadline = () =>
      Math.min(q.limit || Infinity, raceDeadline(cars, competitive));
    const gates: { gate: number; time: number }[] = [];
    let elapsed = 0;
    for (let f = 0; f <= 60 * 300 && !run.failed; f++) {
      const dt = Math.min(1 / 60, Math.max(0, deadline() - elapsed));
      const playerFrozenThisTick = run.releaseRemaining(elapsed) > 0;
      elapsed += dt;
      const commands: Record<string, Input> = {};
      for (const c of cars) {
        commands[c.id] = aiInput(
          c === player ? { ...c, slot: profile } : c,
          track,
          c.id === "local" ? "hard" : q.difficulty,
          elapsed,
          cars,
          items,
        );
        if (c === player && playerFrozenThisTick) {
          c.time = elapsed;
          continue;
        }
        const before = c.progress;
        stepCar(c, commands[c.id], dt, track);
        if (c === player) {
          const gate = run.gate;
          run.update(before, c.progress, elapsed);
          run.observeTechnique(c);
          if (run.gate > gate) gates.push({ gate, time: elapsed });
        }
        if (!c.finished && c.lap >= q.laps) {
          c.finished = true;
          c.time = c.lastLapTime || elapsed;
          stepCar(c, EMPTY_INPUT, 0, track);
        }
      }
      separateCars(
        playerFrozenThisTick ? cars.filter((c) => c !== player) : cars,
        track,
      );
      if (items) stepItems(items, cars, commands, dt, track);
      if (soloRaceComplete(cars, elapsed, deadline(), competitive)) break;
    }
    const rank = classify(cars, {}).find((r) => r.car === player)?.rank ?? 0;
    const m = {
      finished: player.finished,
      time: player.time,
      rank,
      collisions: player.collisionCount,
      cleanDrifts: player.cleanDrifts,
      miniUses: player.miniUses,
      driftChains: player.driftChains,
      usefulHits: items?.players.local.usefulHits ?? 0,
      blocks: items?.players.local.blocks ?? 0,
      failed: run.failed,
    };
    const metrics = { ...m, techniqueCorners: run.completedCorners.length };
    rows.push({
      id: q.id,
      event: q.event,
      referenceProfile: aiProfile(profile, "hard").name,
      gold: q.gold,
      limit: q.limit,
      opponents: q.opponents,
      difficulty: q.difficulty,
      gates,
      grade: challengeGrade(q, metrics),
      ...metrics,
    });
  }
const sourcePaths = [
  "shared/race.ts",
  "shared/driving-config.ts",
  "shared/ai.ts",
  "shared/ai-items.ts",
  "shared/items.ts",
  "shared/item-strategy.ts",
  "shared/challenge-events.ts",
  "shared/gameplay.ts",
  "shared/rules.ts",
  "client/lifecycle.ts",
];
const sourceHashes = Object.fromEntries(
  sourcePaths.map((p) => [
    p,
    createHash("sha256").update(readFileSync(p)).digest("hex"),
  ]),
);
const report = {
  recordedAt: new Date().toISOString(),
  context: VERSIONS,
  physics: DRIVING_CONFIG.version,
  eventVersion: CAREER_EVENT_VERSION,
  sourceHashes,
  note: "Fixed expert input policies on the same player starting grid, vehicle and zero drift resources (authored starting item retained). Profile changes only controller personality and its small lane preference. Runtime deadline/finish window preserved. Not a measured human skill estimate; primary objectives are not automatically awarded.",
  rows,
};
writeFileSync(
  process.argv.includes("--profiles")
    ? "output/gameplay-career-profiles.json"
    : "output/gameplay-career-validation.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
