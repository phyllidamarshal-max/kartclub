// Frozen 2026-09-08 baseline for reproducible pace comparisons; never used by the game.
import { type Car, type Input } from "../../shared/race.ts";
import { trackPoint, continuousTrack, angleDiff, type Track } from "../../shared/track.ts";
import type { Difficulty } from "../../shared/gameplay.ts";
export function aiInput(
  c: Car,
  track: Track,
  difficulty: Difficulty,
  clock: number,
  rivals: readonly Car[] = [],
): Input {
  const level = { easy: 0, normal: 1, hard: 2 }[difficulty];
  const p = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch),
    look = trackPoint(
      p.t + (11 + Math.abs(c.speed) * 0.28) / track.length,
      track,
    );
  let lane =
    (c.slot % 2 ? 1 : -1) * (level === 0 ? 1.9 : 1) +
    Math.sin(clock * (0.6 + level * 0.1) + c.slot) * [1.2, 0.5, 0.15][level];
  // Faster drivers choose the inside of the upcoming bend and react to occupied lanes.
  const bend = angleDiff(look.heading, p.heading);
  if (level > 0)
    lane += Math.max(-1, Math.min(1, bend * 3)) * [0, 1, 1.8][level];
  const front = rivals
    .filter((o) => o.id !== c.id && !o.finished && o.ghostTime <= 0)
    .map((o) => ({
      car: o,
      forward:
        (o.x - c.x) * Math.sin(c.heading) + (o.z - c.z) * Math.cos(c.heading),
      side:
        (o.x - c.x) * Math.cos(c.heading) - (o.z - c.z) * Math.sin(c.heading),
    }))
    .filter((o) => o.forward > 0 && o.forward < 14 && Math.abs(o.side) < 4)
    .sort((a, b) => a.forward - b.forward)[0];
  if (front && level > 0)
    lane =
      front.side >= 0
        ? -Math.min(3, track.width / 2 - 2)
        : Math.min(3, track.width / 2 - 2);
  lane = Math.max(-track.width / 2 + 2, Math.min(track.width / 2 - 2, lane));
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
  let target =
    (curvature > 0.4 ? 20 : curvature > 0.23 ? 27 : [31, 36, 41][level]) -
    (level === 0 && Math.sin(clock * 0.35 + c.slot) > 0.93 ? 5 : 0);
  if (front && front.forward < 5 && Math.abs(front.side) < 1.4)
    target = Math.min(target, Math.max(10, front.car.speed - 2));
  return {
    throttle: c.speed < target ? 1 : -0.45,
    steer: Math.max(-1, Math.min(1, error * [1.65, 1.95, 2.1][level])),
    drift:
      level === 2 &&
      curvature > 0.15 &&
      curvature < 0.35 &&
      Math.abs(error) > 0.15,
    boost:
      c.storedNitro > 0 &&
      !c.boostHeld &&
      (c.boostTime <= 0 || c.boostTime <= 0.15) &&
      Math.abs(error) < 0.08,
    item: Math.sin(clock * 1.3 + c.slot) > 0.85,
    reset: c.speed < 2 && clock > 10 && Math.sin(clock) > 0.995,
  };
}

export const AI_NAMES = [
  "弯道猎手",
  "直线先锋",
  "稳健领航",
  "夜行快客",
  "山路游侠",
  "极限追风",
  "终点守望",
];
