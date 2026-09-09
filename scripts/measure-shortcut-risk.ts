import { TRACKS, trackPoint, angleDiff, type Track } from "../shared/track.ts";
import { spawnCar, stepCar } from "../shared/race.ts";
import { aiInput } from "../shared/ai.ts";
import { pathToFileURL } from "node:url";

/** Same kart, approach, resources, physics and finish line; only the chosen path differs. */
export function shortcutTrial(track: Track, choose: boolean, errorSeconds = 0) {
  const entry = track.shortcut[0],
    exit = track.shortcut.at(-1)!;
  const start = trackPoint(entry.t - 65 / track.length, track);
  const car = spawnCar(2, "shortcut-trial", track);
  Object.assign(car, {
    x: start.x,
    z: start.z,
    lastX: start.x,
    lastZ: start.z,
    heading: start.heading,
    lastT: start.t,
    progress: start.t,
    checkpoint: Math.floor(start.t * 12),
    speed: 40,
    vx: Math.sin(start.heading) * 40,
    vz: Math.cos(start.heading) * 40,
  });
  const mainView: Track = { ...track, shortcut: [] };
  let selected = false,
    reset = false,
    errorFrames = 0,
    errorDirection = 0;
  for (let i = 0; i < 3600 && car.progress < exit.t + 100 / track.length; i++) {
    const input = aiInput(car, choose ? track : mainView, "hard", i / 60);
    if (
      errorSeconds &&
      car.routeBranch === "shortcut" &&
      car.lastT > entry.t + (exit.t - entry.t) * 0.35 &&
      errorFrames < errorSeconds * 60
    ) {
      // A missed change of direction, using only legal steering input.
      if (!errorFrames) errorDirection = -Math.sign(input.steer || 1);
      input.steer = errorDirection;
      input.throttle = 1;
      input.drift = false;
      errorFrames++;
    }
    reset ||= input.reset;
    stepCar(car, input, 1 / 60, track);
    selected ||= car.routeBranch === "shortcut";
  }
  return {
    seconds: +car.time.toFixed(3),
    selected,
    collisions: car.collisionCount,
    reset,
    finished: car.progress >= exit.t + 100 / track.length,
    branch: car.routeBranch,
  };
}
export function shortcutMetrics(track: Track) {
  let length = 0,
    curvature = 0,
    turn = 0;
  for (let i = 1; i < track.shortcut.length; i++) {
    const a = track.shortcut[i - 1],
      b = track.shortcut[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z),
      h = Math.abs(angleDiff(b.heading, a.heading));
    length += d;
    curvature = Math.max(curvature, h / d);
    turn += h;
  }
  const main = (track.shortcut.at(-1)!.t - track.shortcut[0].t) * track.length;
  return {
    mainMetres: +main.toFixed(2),
    shortcutMetres: +length.toFixed(2),
    savedPercent: +(100 * (1 - length / main)).toFixed(1),
    minRadius: +(1 / curvature).toFixed(2),
    turnDegrees: +((turn * 180) / Math.PI).toFixed(1),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(
    JSON.stringify(
      TRACKS.filter((t) => t.shortcut.length).map((track) => ({
        id: track.id,
        ...shortcutMetrics(track),
        main: shortcutTrial(track, false),
        clean: shortcutTrial(track, true),
        mistake: shortcutTrial(track, true, 0.75),
      })),
      null,
      2,
    ),
  );
}
