import { TRACKS, trackWidthRange } from "../shared/track.ts";
import { mapProfile } from "../shared/map-profiles.ts";
import { spawnCar, stepCar } from "../shared/race.ts";
import { aiInput } from "../shared/ai.ts";
import { shortcutMetrics, shortcutTrial } from "./measure-shortcut-risk.ts";
import { VERSIONS } from "../shared/rules.ts";

const runs = [];
for (const track of TRACKS.filter((t) => mapProfile(t.id).isNew)) {
  const timings = [];
  for (const difficulty of ["normal", "hard"] as const) {
    const car = spawnCar(1, "audit", track);
    let resets = 0,
      branch = false;
    const contacts: { t: number; kind: string; clock: number }[] = [];
    for (let i = 0; i < 60 * 600 && car.lap < 3; i++) {
      const input = aiInput(car, track, difficulty, car.time);
      if (input.reset && !car.resetHeld) resets++;
      const count = car.collisionCount;
      stepCar(car, input, 1 / 60, track);
      if (car.collisionCount > count)
        contacts.push({
          t: car.lastT,
          kind: car.lastCollisionKind,
          clock: car.time,
        });
      branch ||= car.routeBranch === "shortcut";
    }
    timings.push({
      difficulty,
      seconds: +car.time.toFixed(2),
      laps: car.lap,
      collisions: car.collisionCount,
      resets,
      branch,
      contacts,
    });
  }
  runs.push({
    id: track.id,
    name: track.name,
    rating: mapProfile(track.id).rating,
    metres: +track.length.toFixed(1),
    minutes: track.raceMinutes,
    widths: trackWidthRange(track),
    moving: track.movingObstacles?.length ?? 0,
    timings,
    ab:
      track.layout === "ab"
        ? {
            ...shortcutMetrics(track),
            a: shortcutTrial(track, false),
            b: shortcutTrial(track, true),
          }
        : null,
  });
}
console.log(
  JSON.stringify(
    { versions: VERSIONS, total: TRACKS.length, added: runs.length, runs },
    null,
    2,
  ),
);
