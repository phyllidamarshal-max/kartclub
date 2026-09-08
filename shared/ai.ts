import { type Car, type Input } from "./race.ts";
import {
  trackPoint,
  trackWidth,
  continuousTrack,
  nearestTrack,
  angleDiff,
  type Point,
  type Track,
} from "./track.ts";
import type { Difficulty } from "./gameplay.ts";
import { DRIVING_CONFIG as CFG } from "./driving-config.ts";
import { aiItemInput } from "./ai-items.ts";
import type { ItemWorld } from "./items.ts";
import { drivingZoneAt, getLevel } from "./levels.ts";
import { itemCourse } from "./ai-course.ts";
import { aiProfile } from "./ai-profiles.ts";
export { aiProfile } from "./ai-profiles.ts";

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
  if (c.finished || c.resetTime > 0)
    return {
      throttle: 0,
      steer: 0,
      drift: false,
      boost: false,
      item: false,
      reset: false,
    };
  const profile = aiProfile(c.slot, difficulty);
  const expert = difficulty === "hard";

  const p = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch);
  const speed = Math.max(0, c.speed);
  const baseLookDistance = 7 + speed * 0.24;
  const upcomingWidth =
    c.routeBranch === "shortcut"
      ? (track.shortcutWidth ?? 7)
      : trackWidth(p.t + baseLookDistance / track.length, track);
  const lookDistance =
    baseLookDistance * clamp(Math.min(p.roadWidth, upcomingWidth) / 14, 0.6, 1);
  const look = routeAhead(p, lookDistance, track, c.routeBranch, true);
  const curve = angleDiff(look.heading, p.heading) / lookDistance;
  // Brake before the tightest upcoming bend, using stopping distance rather than
  // applying the same low speed through the entire corner and following straight.
  let target = CFG.vehicle.maxSpeed * profile.pace;
  if (c.boostTime > 0) target *= CFG.nitro.maxSpeed;
  else if (c.miniTime > 0) target *= CFG.mini.maxSpeed;
  const surfaceZone = drivingZoneAt(track.id, p.t, p.lateral, c.routeBranch);
  if (surfaceZone?.kind === "boost")
    target = Math.max(target, CFG.vehicle.maxSpeed * 1.15);
  let futureCurve = 0;
  for (let distance = 6; distance <= 78; distance += 6) {
    const a = routeAhead(p, distance - 3, track, c.routeBranch);
    const b = routeAhead(p, distance + 3, track, c.routeBranch);
    const k = Math.abs(angleDiff(b.heading, a.heading)) / 6;
    if (distance < 48) futureCurve = Math.max(futureCurve, k);
    const icy =
      drivingZoneAt(track.id, a.t, p.lateral, c.routeBranch)?.kind === "ice";
    const cornerWidth =
      c.routeBranch === "shortcut"
        ? (track.shortcutWidth ?? 7)
        : trackWidth(a.t, track);
    const cornerSpeed = clamp(
      ((profile.cornerRate - (expert && cornerWidth < 11 ? 0.05 : 0)) *
        (icy ? 0.82 : 1)) /
        Math.max(0.001, k),
      cornerWidth < 12 ? 17 : 19,
      CFG.vehicle.maxSpeed * CFG.nitro.maxSpeed,
    );
    target = Math.min(
      target,
      Math.sqrt(cornerSpeed ** 2 + 2 * 18 * Math.max(0, distance - 6)),
    );
  }
  let lane = clamp(curve * 100, -1.4, 1.4) + (c.slot % 2 ? 0.22 : -0.22);
  if (c.routeBranch === "main")
    for (const zone of getLevel(track.id).zones) {
      const ahead = (((zone.start - p.t + 1.5) % 1) - 0.5) * track.length;
      const inside = p.t >= zone.start && p.t <= zone.end;
      if (!inside && (ahead < 0 || ahead > lookDistance + 12)) continue;
      if (
        zone.kind === "sand" &&
        Math.abs(lane - zone.lateral) < zone.halfWidth + 1
      )
        lane =
          zone.lateral + (zone.lateral > 0 ? -1 : 1) * (zone.halfWidth + 1.2);
      if (zone.kind === "boost")
        lane = clamp(
          lane,
          zone.lateral - zone.halfWidth + 0.6,
          zone.lateral + zone.halfWidth - 0.6,
        );
    }
  lane = clamp(lane, -p.roadWidth / 2 + 2, p.roadWidth / 2 - 2);
  const course = itemCourse(c, track, items);
  if (course.pickupLane !== null) lane = course.pickupLane;
  const nearby = rivals
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
    .filter(
      (o) =>
        o.forward > -6 &&
        o.forward < profile.trafficHorizon &&
        Math.abs(o.side) < p.roadWidth,
    );
  const traffic = nearby
    .filter((o) => o.forward > 0 && Math.abs(o.side) < 3)
    .sort((a, b) => a.forward - b.forward)[0];
  if (traffic) {
    const candidates = [-1, 1].map((side) =>
      clamp(
        p.lateral + side * profile.overtakeOffset,
        -p.roadWidth / 2 + 2,
        p.roadWidth / 2 - 2,
      ),
    );
    const clearance = (candidate: number) =>
      nearby.reduce(
        (score, other) =>
          score +
          Math.max(0, 2.8 - Math.abs(p.lateral + other.side - candidate)) *
            (other.forward < 10 ? 4 : 1),
        Math.abs(candidate - lane) * 0.15,
      );
    lane =
      clearance(candidates[0]) <= clearance(candidates[1])
        ? candidates[0]
        : candidates[1];
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
      if (
        forward < obstacle.radius + 3 &&
        forward > -obstacle.radius &&
        Math.abs(side - p.lateral) < obstacle.radius + 1.2
      )
        aim = trackPoint(
          p.t + Math.max(1.25, forward * 0.55) / track.length,
          track,
        );
    }
  }
  const trapThreat = course.traps.some(
    (t) => Math.abs(t.lane - lane) < 3.2 || Math.abs(t.lane - p.lateral) < 3.2,
  );
  if (trapThreat) {
    const candidates = course.traps
      .flatMap((t) => [t.lane - 3.4, t.lane + 3.4])
      .map((v) => clamp(v, -p.roadWidth / 2 + 1.8, p.roadWidth / 2 - 1.8));
    const danger = (candidate: number) => {
      let cost = Math.abs(candidate - p.lateral) * 0.1;
      for (const t of course.traps)
        cost += Math.max(0, 3.2 - Math.abs(t.lane - candidate)) * 5;
      for (const o of nearby)
        if (o.forward < 12)
          cost +=
            Math.max(0, 2.5 - Math.abs(p.lateral + o.side - candidate)) * 4;
      for (const o of roadObstacles(track)) {
        const ahead = (((o.t - p.t + 1.5) % 1) - 0.5) * track.length;
        if (ahead > -o.radius && ahead < lookDistance + 12)
          cost +=
            Math.max(0, o.radius + 2.3 - Math.abs(o.side - candidate)) * 5;
      }
      return cost;
    };
    lane = candidates.reduce(
      (best, candidate) =>
        danger(candidate) < danger(best) ? candidate : best,
      lane,
    );
    if (course.traps.some((t) => Math.abs(t.lane - lane) < 3.2))
      target = Math.min(target, 18);
  }
  const blockedLine = nearby.some(
    (o) =>
      o.forward > -3 &&
      o.forward < 12 &&
      Math.abs(p.lateral + o.side - lane) < 2.5,
  );
  // Commit to a lane that still exists at the pursuit point, before the taper.
  const aimWidth =
    c.routeBranch === "shortcut"
      ? (track.shortcutWidth ?? 7)
      : trackWidth(aim.t, track);
  const laneLimit = Math.max(0, Math.min(p.roadWidth, aimWidth) / 2 - 1.8);
  lane = clamp(lane, -laneLimit, laneLimit);
  // A straighter lookahead does not mean the kart has finished turning. Allow
  // time for the chassis to align and for grip to settle its outward velocity
  // before accelerating into a narrowing exit or continuing a wide drift.
  const lateralSpeed = c.vx * Math.cos(p.heading) - c.vz * Math.sin(p.heading);
  const recoveryTime = Math.min(
    0.6,
    Math.abs(angleDiff(c.heading, p.heading)) / CFG.vehicle.turnRate +
      1 / CFG.vehicle.grip,
  );
  const projectedLateral = p.lateral + lateralSpeed * recoveryTime;
  // The planned lane has a larger margin than the kart needs to clear the rail.
  // Brake for a projected body contact, not merely for leaving that ideal lane.
  const exitLimit = Math.max(0, Math.min(p.roadWidth, aimWidth) / 2 - 1.3);
  const unsafeExit =
    projectedLateral * lateralSpeed > 0 &&
    Math.abs(projectedLateral) > exitLimit;
  if (unsafeExit && Math.abs(angleDiff(c.heading, p.heading)) > 0.3)
    target = Math.min(target, 17);
  // Steer through the real branch mouth. The physics engine alone decides when
  // the kart has actually entered; never assign routeBranch or canonical progress.
  if (
    profile.chooseShortcut &&
    c.routeBranch === "main" &&
    track.shortcut.length > 1 &&
    !blockedLine &&
    !avoidingObstacle &&
    !trapThreat
  ) {
    const entry = track.shortcut[0];
    const toEntry = (((entry.t - p.t + 1.5) % 1) - 0.5) * track.length;
    if (
      Math.abs(angleDiff(entry.heading, trackPoint(entry.t, track).heading)) <
        0.35 &&
      toEntry > -12 &&
      toEntry < lookDistance
    ) {
      aim = routeAhead(
        entry,
        Math.max(3, lookDistance - Math.max(0, toEntry)),
        track,
        "shortcut",
        true,
      );
      lane = 0;
      target = Math.min(target, 28);
    }
  }
  const x = aim.x + Math.cos(aim.heading) * lane,
    z = aim.z - Math.sin(aim.heading) * lane;
  const error = angleDiff(Math.atan2(x - c.x, z - c.z), c.heading);
  const bend = Math.abs(curve),
    slip = Math.abs(c.slipAngle);
  // Trade an earned mini opportunity for the next useful turn, only on a clean,
  // roomy line. A recovered chain is followed by a mini, not repeated chaining.
  const chainLine =
    expert &&
    profile.name === "technical" &&
    c.lastDriftKind !== "chain" &&
    c.throttleHeld &&
    c.boostTime <= 0 &&
    Math.min(p.roadWidth, aimWidth) >= 18 &&
    bend > 0.012 &&
    futureCurve > 0.015 &&
    !unsafeExit &&
    c.collisionCooldown <= 0 &&
    c.impact < 0.1;
  // Recover deliberately before the continuing bend ends, so the second drift
  // can use its earned window. No eligibility/window/counter is assigned here.
  const recoverForChain = chainLine && c.driftDuration >= 0.55;
  const chainTurn = chainLine && c.miniWindow > 0.18;
  const drift =
    c.energy < CFG.energy.capacity &&
    c.energyLockTime <= 0 &&
    speed > profile.driftMinSpeed &&
    speed < target + 4 &&
    bend > 0.01 &&
    bend < 0.08 &&
    Math.abs(error) < 0.65 &&
    p.distance < p.roadWidth / 2 - 2.5 &&
    !blockedLine &&
    !trapThreat &&
    !avoidingObstacle &&
    !recoverForChain &&
    (c.miniWindow <= 0 || chainTurn) &&
    slip < 0.6;
  const turnRate = drift ? CFG.vehicle.driftTurnRate : CFG.vehicle.turnRate;
  // Aim the velocity along the racing line while the chassis points into the
  // bend. A grip-only pursuit target straightens the drift before it can charge.
  const driftLead = drift
    ? Math.sign(curve) *
      clamp(
        (bend * speed) / CFG.vehicle.driftGrip,
        Math.min(p.roadWidth, aimWidth) >= 15 ? 0.3 : 0,
        0.46,
      )
    : 0;
  const steer = clamp(
    (error + driftLead) * (drift ? 2.3 : 2.8) +
      ((curve * speed) / turnRate) * 0.42,
    -1,
    1,
  );
  const safeBoost =
    Math.abs(error) < 0.2 &&
    futureCurve < profile.boostCurve &&
    !blockedLine &&
    !trapThreat &&
    !avoidingObstacle &&
    p.distance < p.roadWidth / 2 - 2;
  let throttle = speed < target - 0.3 ? 1 : speed > target + 0.6 ? -1 : 0.45;
  if (chainTurn && drift) throttle = 1;
  else if (c.miniWindow > 0 && c.boostTime <= 0 && speed < target + 2)
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

export const AI_NAMES = [
  "弯道猎手",
  "直线先锋",
  "稳健领航",
  "夜行快客",
  "山路游侠",
  "极限追风",
  "终点守望",
];
