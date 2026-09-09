import { TRACKS, trackPoint, trackWidth } from "../shared/track.ts";
import { aiInput } from "../shared/ai.ts";
import { spawnCar, stepCar } from "../shared/race.ts";
import { CornerPractice } from "../client/practice.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { VERSIONS } from "../shared/rules.ts";

const paths = [
  "shared/route-course.ts",
  "shared/track.ts",
  "shared/route-data.ts",
  "shared/road-design.ts",
  "shared/levels.ts",
  "shared/race.ts",
  "shared/ai.ts",
  "shared/ai-course.ts",
  "shared/ai-profiles.ts",
  "shared/driving-config.ts",
  "shared/driving-skills.ts",
  "client/practice.ts",
  "scripts/measure-track-mastery.ts",
];
const hashes = () =>
  Object.fromEntries(
    paths.map((p) => [
      p,
      createHash("sha256").update(readFileSync(p)).digest("hex"),
    ]),
  );
const sourceHashes = hashes();
const bends = [],
  exits = [],
  contacts = [];
for (const track of TRACKS) {
  for (let j = 0; j < (track.bends?.length ?? 0); j++) {
    const practice = new CornerPractice(track, j),
      c = practice.restart();
    const bend = track.bends![j];
    let insideMetres = 0,
      driftingMetres = 0,
      sustained = 0,
      longestDriftMetres = 0;
    for (let i = 0; i < 60 * 40 && !practice.complete(c); i++) {
      const before = c.progress;
      stepCar(c, aiInput(c, track, "hard", i / 60), 1 / 60, track);
      const distance =
        Math.max(
          0,
          Math.min(c.progress, bend.end) - Math.max(before, bend.start),
        ) * track.length;
      insideMetres += distance;
      if (distance > 0 && c.drifting && Math.abs(c.slipAngle) > 0.12) {
        driftingMetres += distance;
        sustained += distance;
        longestDriftMetres = Math.max(longestDriftMetres, sustained);
      } else sustained = 0;
    }
    bends.push({
      track: track.id,
      kind: track.bends![j].kind,
      id: track.bends![j].id,
      finished: practice.complete(c),
      cleanDrifts: c.cleanDrifts,
      collisions: c.collisionCount,
      seconds: +c.time.toFixed(3),
      driftCoverage: +(driftingMetres / insideMetres).toFixed(3),
      longestDriftMetres: +longestDriftMetres.toFixed(2),
    });
  }
  if (track.shortcut.length) {
    const exit = track.shortcut.at(-1)!;
    for (const remaining of [45, 20, 4])
      for (const lane of [-2.4, 0, 2.4]) {
        let distance = 0,
          index = track.shortcut.length - 1;
        while (index > 0 && distance < remaining) {
          const a = track.shortcut[index],
            b = track.shortcut[--index];
          distance += Math.hypot(a.x - b.x, a.z - b.z);
        }
        const p = track.shortcut[index],
          c = spawnCar(1, "exit", track);
        Object.assign(c, {
          x: p.x + Math.cos(p.heading) * lane,
          z: p.z - Math.sin(p.heading) * lane,
          lastT: p.t,
          progress: p.t,
          checkpoint: Math.floor(p.t * 12),
          heading: p.heading,
          routeBranch: "shortcut",
          speed: 30,
          vx: Math.sin(p.heading) * 30,
          vz: Math.cos(p.heading) * 30,
        });
        c.lastX = c.x;
        c.lastZ = c.z;
        let resets = 0,
          maxStill = 0,
          still = 0,
          previous = c.progress;
        for (
          let i = 0;
          i < 60 * 15 && c.progress < exit.t + 90 / track.length;
          i++
        ) {
          const input = aiInput(c, track, "hard", i / 60);
          if (input.reset && !c.resetHeld) resets++;
          stepCar(c, input, 1 / 60, track);
          still = c.progress > previous + 1e-8 ? 0 : still + 1 / 60;
          maxStill = Math.max(maxStill, still);
          previous = c.progress;
        }
        exits.push({
          track: track.id,
          remaining,
          lane,
          passed: c.progress >= exit.t + 90 / track.length,
          branch: c.routeBranch,
          collisions: c.collisionCount,
          resets,
          maxStill: +maxStill.toFixed(3),
        });
      }
  }
  const c = spawnCar(1, "contact-audit", track);
  for (let i = 0; i < 60 * 500 && c.lap < 3; i++) {
    const previous = c.collisionCount,
      input = aiInput(c, track, "hard", i / 60);
    stepCar(c, input, 1 / 60, track);
    if (c.collisionCount > previous)
      contacts.push({
        track: track.id,
        t: c.lastT,
        speed: c.speed,
        slip: c.slipAngle,
        lastKind: c.lastDriftKind,
        input,
        width: trackWidth(c.lastT, track),
        point: trackPoint(c.lastT, track),
      });
  }
}
console.log(
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      versions: VERSIONS,
      sourceHashes,
      sourcesUnchanged:
        JSON.stringify(sourceHashes) === JSON.stringify(hashes()),
      bends,
      exits,
      contacts,
    },
    null,
    2,
  ),
);
if (
  bends.some((b) => !b.finished || b.collisions || !b.cleanDrifts) ||
  exits.some((e) => !e.passed || e.resets || e.collisions || e.maxStill > 1)
)
  process.exitCode = 1;
