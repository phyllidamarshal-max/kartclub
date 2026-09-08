import { type Car, type Input } from "../../shared/race.ts";
import {
  trackPoint,
  continuousTrack,
  nearestTrack,
  angleDiff,
  type Point,
  type Track,
} from "../../shared/track.ts";
import type { Difficulty } from "../../shared/gameplay.ts";
import { DRIVING_CONFIG as CFG } from "../../shared/driving-config.ts";
import { aiItemInput } from "./ai-items-before-mastery.ts";
import type { ItemWorld } from "../../shared/items.ts";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const obstaclePaths = new WeakMap<
  Track,
  { t: number; side: number; radius: number }[]
>();
function roadObstacles(track: Track) {
  let points = obstaclePaths.get(track);
  if (!points) {
    points = track.obstacles.map((o) => {
      const p = nearestTrack(o.x, o.z, track);
      return { t: p.t, side: p.lateral, radius: o.radius };
    });
    obstaclePaths.set(track, points);
  }
  return points;
}

// Canonical lap progress has a different metres-per-t on a shortcut. Walk the
// occupied branch in physical metres, then sample the main road beyond its exit.
function routeAhead(
  p: Point,
  distance: number,
  track: Track,
  branch: Car["routeBranch"],
  keepExitStraight = false,
): Point {
  if (branch !== "shortcut" || track.shortcut.length < 2)
    return trackPoint(p.t + distance / track.length, track);
  let previous = p;
  for (const next of track.shortcut) {
    if (next.t <= p.t) continue;
    const length = Math.hypot(next.x - previous.x, next.z - previous.z);
    if (distance <= length) {
      const f = distance / (length || 1);
      return {
        x: previous.x + (next.x - previous.x) * f,
        y: previous.y + (next.y - previous.y) * f,
        z: previous.z + (next.z - previous.z) * f,
        t: previous.t + (next.t - previous.t) * f,
        heading:
          previous.heading + angleDiff(next.heading, previous.heading) * f,
      };
    }
    distance -= length;
    previous = next;
  }
  const end = track.shortcut.at(-1)!;
  // Reach the branch endpoint before steering onto the main road; otherwise a
  // lookahead across the join cuts the corner and collides with the branch wall.
  if (keepExitStraight)
    return {
      ...end,
      x: end.x + Math.sin(end.heading) * 2,
      z: end.z + Math.cos(end.heading) * 2,
    };
  return trackPoint(end.t + distance / track.length, track);
}

/** Driving commands only: AI obeys the same acceleration, grip and resource rules. */
export function aiInput(
  c: Car,
  track: Track,
  difficulty: Difficulty,
  clock: number,
  rivals: readonly Car[] = [],
  items?: ItemWorld | null,
): Input {
  if (difficulty === "easy")
    return noviceInput(c, track, difficulty, clock, rivals);
  if (c.finished || c.resetTime > 0)
    return {
      throttle: 0,
      steer: 0,
      drift: false,
      boost: false,
      item: false,
      reset: false,
    };
  const expert = difficulty === "hard";
  const p = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch);
  const speed = Math.max(0, c.speed);
  const lookDistance = 7 + speed * 0.24;
  const look = routeAhead(p, lookDistance, track, c.routeBranch, true);
  const curve = angleDiff(look.heading, p.heading) / lookDistance;
  // Brake before the tightest upcoming bend, using stopping distance rather than
  // applying the same low speed through the entire corner and following straight.
  let target = CFG.vehicle.maxSpeed * (expert ? 1 : 0.98);
  if (c.boostTime > 0) target *= CFG.nitro.maxSpeed;
  else if (c.miniTime > 0) target *= CFG.mini.maxSpeed;
  let futureCurve = 0;
  for (let distance = 6; distance <= 78; distance += 6) {
    const a = routeAhead(p, distance - 3, track, c.routeBranch);
    const b = routeAhead(p, distance + 3, track, c.routeBranch);
    const k = Math.abs(angleDiff(b.heading, a.heading)) / 6;
    if (distance < 48) futureCurve = Math.max(futureCurve, k);
    const cornerSpeed = clamp(
      (expert ? 1.48 : 1.08) / Math.max(0.001, k),
      19,
      CFG.vehicle.maxSpeed * CFG.nitro.maxSpeed,
    );
    target = Math.min(
      target,
      Math.sqrt(cornerSpeed ** 2 + 2 * 18 * Math.max(0, distance - 6)),
    );
  }
  let lane = clamp(curve * 100, -1.4, 1.4) + (c.slot % 2 ? 0.22 : -0.22);
  const traffic = rivals
    .filter(
      (o) =>
        o.id !== c.id &&
        !o.finished &&
        o.ghostTime <= 0 &&
        o.resetTime <= 0 &&
        Math.abs(trackPoint(o.lastT, track).y - p.y) < 5,
    )
    .map((o) => ({
      car: o,
      forward:
        (o.x - c.x) * Math.sin(p.heading) + (o.z - c.z) * Math.cos(p.heading),
      side:
        (o.x - c.x) * Math.cos(p.heading) - (o.z - c.z) * Math.sin(p.heading),
    }))
    .filter((o) => o.forward > 0 && o.forward < 24 && Math.abs(o.side) < 4)
    .sort((a, b) => a.forward - b.forward)[0];
  if (traffic) {
    lane = clamp(
      p.lateral + (traffic.side >= 0 ? -3 : 3),
      -p.roadWidth / 2 + 2,
      p.roadWidth / 2 - 2,
    );
    if (traffic.forward < 5 && Math.abs(traffic.side) < 1.4)
      target = Math.min(target, Math.max(8, traffic.car.speed - 2));
  }
  if (c.routeBranch === "shortcut") lane = 0;
  let aim = look,
    avoidingObstacle = false;
  for (const obstacle of c.routeBranch === "main" ? roadObstacles(track) : []) {
    const forward = (((obstacle.t - p.t + 1.5) % 1) - 0.5) * track.length;
    const side = obstacle.side;
    if (
      forward > -obstacle.radius - 4 &&
      forward < lookDistance + 18 &&
      (Math.abs(side - lane) < obstacle.radius + 2.7 ||
        Math.abs(side - p.lateral) < obstacle.radius + 2.7)
    ) {
      lane = clamp(
        side + (side > 0 ? -1 : 1) * (obstacle.radius + 2.7),
        -p.roadWidth / 2 + 1.8,
        p.roadWidth / 2 - 1.8,
      );
      avoidingObstacle = true;
      if (forward < lookDistance && forward > -obstacle.radius)
        aim = trackPoint(
          p.t + Math.max(1.25, forward * 0.55) / track.length,
          track,
        );
    }
  }
  const x = aim.x + Math.cos(aim.heading) * lane,
    z = aim.z - Math.sin(aim.heading) * lane;
  const error = angleDiff(Math.atan2(x - c.x, z - c.z), c.heading);
  const bend = Math.abs(curve),
    slip = Math.abs(c.slipAngle);
  const drift =
    c.energy < CFG.energy.capacity &&
    speed > (expert ? 21 : 24) &&
    speed < target + 4 &&
    bend > 0.011 &&
    bend < 0.08 &&
    Math.abs(error) < 0.65 &&
    p.distance < p.roadWidth / 2 - 2.5 &&
    !traffic &&
    c.boostTime <= 0 &&
    c.miniWindow <= 0 &&
    slip < 0.48;
  const turnRate = drift ? CFG.vehicle.driftTurnRate : CFG.vehicle.turnRate;
  const steer = clamp(
    error * (drift ? 2.3 : 2.8) + ((curve * speed) / turnRate) * 0.42,
    -1,
    1,
  );
  const safeBoost =
    Math.abs(error) < 0.2 &&
    futureCurve < 0.021 &&
    !traffic &&
    !avoidingObstacle &&
    p.distance < p.roadWidth / 2 - 2;
  let throttle = speed < target - 0.3 ? 1 : speed > target + 0.6 ? -1 : 0.45;
  if (c.miniWindow > 0 && c.boostTime <= 0 && speed < target + 2)
    throttle = c.throttleHeld ? 0 : 1;
  return {
    throttle,
    steer,
    drift,
    boost:
      c.storedNitro > 0 &&
      !c.boostHeld &&
      (c.boostTime <= 0 || c.boostTime <= CFG.nitro.buffer) &&
      safeBoost,
    item: aiItemInput(c, track, difficulty, rivals, items, safeBoost),
    reset:
      speed < 2 &&
      clock > 8 &&
      !c.resetHeld &&
      (Math.abs(error) > 1.4 ||
        track.obstacles.some(
          (o) => Math.hypot(c.x - o.x, c.z - o.z) < o.radius + 1.2,
        )),
  };
}

function noviceInput(
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

