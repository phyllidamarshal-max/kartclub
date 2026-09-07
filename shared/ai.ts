import { type Car, type Input } from "./race.ts";
import { trackPoint, nearestTrack, angleDiff, type Track } from "./track.ts";
import type { Difficulty } from "./gameplay.ts";
export function aiInput(
  c: Car,
  track: Track,
  difficulty: Difficulty,
  clock: number,
): Input {
  const level = { easy: 0, normal: 1, hard: 2 }[difficulty];
  const p = nearestTrack(c.x, c.z, track),
    look = trackPoint(
      p.t + (11 + Math.abs(c.speed) * 0.28) / track.length,
      track,
    );
  const lane =
    (c.slot % 2 ? 1 : -1) * (level === 0 ? 1.9 : 1) +
    Math.sin(clock * (0.6 + level * 0.1) + c.slot) * [1.2, 0.5, 0.15][level];
  let x = look.x + Math.cos(look.heading) * lane,
    z = look.z - Math.sin(look.heading) * lane;
  for (const o of track.obstacles)
    if (Math.hypot(o.x - x, o.z - z) < 6) {
      x =
        look.x -
        Math.cos(look.heading) *
          Math.sign(
            (o.x - look.x) * Math.cos(look.heading) -
              (o.z - look.z) * Math.sin(look.heading),
          ) *
          4;
      z =
        look.z +
        Math.sin(look.heading) *
          Math.sign(
            (o.x - look.x) * Math.cos(look.heading) -
              (o.z - look.z) * Math.sin(look.heading),
          ) *
          4;
    }
  const error = angleDiff(Math.atan2(x - c.x, z - c.z), c.heading),
    curvature = Math.abs(angleDiff(look.heading, p.heading));
  const target =
    (curvature > 0.4 ? 20 : curvature > 0.23 ? 27 : [31, 36, 41][level]) -
    (level === 0 && Math.sin(clock * 0.35 + c.slot) > 0.93 ? 5 : 0);
  return {
    throttle: c.speed < target ? 1 : -0.45,
    steer: Math.max(-1, Math.min(1, error * [1.65, 1.95, 2.1][level])),
    drift:
      level === 2 &&
      curvature > 0.15 &&
      curvature < 0.35 &&
      Math.abs(error) > 0.15,
    boost: c.energy >= 100 && Math.abs(error) < 0.08,
    item: Math.sin(clock * 1.3 + c.slot) > 0.85,
    reset: c.speed < 2 && clock > 10 && Math.sin(clock) > 0.995,
  };
}
