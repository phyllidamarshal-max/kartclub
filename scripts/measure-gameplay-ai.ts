import { aiInput, aiProfile } from "../shared/ai.ts";
import { aiInput as beforeAI } from "../tests/fixtures/ai-before-phase-one.ts";
import { TRACKS } from "../shared/track.ts";
import { spawnCar, stepCar } from "../shared/race.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DRIVING_CONFIG } from "../shared/driving-config.ts";
import { VERSIONS } from "../shared/rules.ts";
import type { Difficulty } from "../shared/gameplay.ts";

const sourcePaths = [
  "shared/race.ts",
  "shared/driving-config.ts",
  "shared/driving-skills.ts",
  "shared/rules.ts",
  "shared/track.ts",
  "shared/route-course.ts",
  "shared/route-data.ts",
  "shared/road-design.ts",
  "shared/levels.ts",
  "shared/ai.ts",
  "shared/ai-profiles.ts",
  "shared/ai-course.ts",
  "shared/ai-items.ts",
  "tests/fixtures/ai-before-phase-one.ts",
];
const hashSources = () =>
  Object.fromEntries(
    sourcePaths.map((path) => [
      path,
      createHash("sha256")
        .update(readFileSync(new URL(`../${path}`, import.meta.url)))
        .digest("hex"),
    ]),
  );
const sourceHashes = hashSources();

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
    for (const track of TRACKS)
      for (const slot of process.argv.includes("--profiles")
        ? [0, 1, 2]
        : [1]) {
        const car = spawnCar(slot, "measure", track);
        let resets = 0,
          driftSeconds = 0,
          boostDriftSeconds = 0,
          maxSlip = 0,
          shortcutSeconds = 0,
          maxNoProgressSeconds = 0,
          noProgressSeconds = 0,
          bestProgress = car.progress;
        for (let i = 0; i < 60 * 600 && car.lap < 3; i++) {
          const input = controller(car, track, difficulty, i / 60);
          if (input.reset && !car.resetHeld) resets++;
          if (input.drift) driftSeconds += 1 / 60;
          if (input.drift && car.boostTime > 0) boostDriftSeconds += 1 / 60;
          stepCar(car, input, 1 / 60, track);
          if (car.routeBranch === "shortcut") shortcutSeconds += 1 / 60;
          if (car.progress > bestProgress + 0.002) {
            bestProgress = car.progress;
            noProgressSeconds = 0;
          } else noProgressSeconds += 1 / 60;
          maxNoProgressSeconds = Math.max(
            maxNoProgressSeconds,
            noProgressSeconds,
          );
          maxSlip = Math.max(maxSlip, Math.abs(car.slipAngle));
        }
        records.push({
          revision,
          slot,
          personality: aiProfile(slot, difficulty).name,
          difficulty,
          track: track.id,
          finished: car.lap >= 3,
          seconds: +car.time.toFixed(3),
          collisions: car.collisionCount,
          resets,
          nitro: car.nitroUses,
          mini: car.miniUses,
          driftChains: car.driftChains,
          energy: +car.driftTotal.toFixed(2),
          driftSeconds: +driftSeconds.toFixed(2),
          boostDriftSeconds: +boostDriftSeconds.toFixed(2),
          maxSlip: +maxSlip.toFixed(3),
          shortcutSeconds: +shortcutSeconds.toFixed(2),
          maxNoProgressSeconds: +maxNoProgressSeconds.toFixed(2),
        });
      }
console.log(
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      versions: VERSIONS,
      sourceHashes,
      sourcesUnchanged:
        JSON.stringify(sourceHashes) === JSON.stringify(hashSources()),
      physics: DRIVING_CONFIG.version,
      physicsHash: createHash("sha256")
        .update(JSON.stringify(DRIVING_CONFIG))
        .digest("hex")
        .slice(0, 16),
      routesHash: createHash("sha256")
        .update(JSON.stringify(TRACKS))
        .digest("hex")
        .slice(0, 16),
      tickRate: 60,
      laps: 3,
      records,
    },
    null,
    2,
  ),
);

if (
  JSON.stringify(sourceHashes) !== JSON.stringify(hashSources()) ||
  records.some(
    (record) =>
      !record.finished || record.resets > 0 || record.maxNoProgressSeconds > 10,
  )
)
  process.exitCode = 1;
