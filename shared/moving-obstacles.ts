import {
  contactOutline,
  expandContactOutline,
  discClearance,
  sweepRoundedPolygon,
} from "./moving-obstacle-contact.ts";
import { KART_FOOTPRINT } from "./kart-contact.ts";

/** Seconds and radians throughout; phase is a fixed angular offset. */
export interface MovingObstacleSpec {
  readonly id: string;
  readonly kind:
    | "shuttle"
    | "sweeper"
    | "pendulum"
    | "sheep"
    | "deer"
    | "spinner"
    | "minecart"
    | "hauler";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly radius: number;
  readonly amplitude: number;
  readonly period: number;
  readonly phase: number;
}

export interface MovingObstaclePose extends MovingObstacleSpec {
  readonly vx: number;
  readonly vz: number;
  readonly offset: number;
  readonly facing: number;
  readonly yawRate: number;
  readonly stride: number;
  readonly lift: number;
  readonly swingAngle: number;
}

interface ObstacleTrack {
  readonly movingObstacles?: readonly MovingObstacleSpec[];
}
interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
  heading: number;
}

/** Circumscribes the complete nose, bumpers, and steered-wheel support polygon. */
export const MOVING_OBSTACLE_KART_RADIUS = Math.max(
  ...KART_FOOTPRINT.map(([x, z]) => Math.hypot(x, z)),
);
const TAU = Math.PI * 2;
const CONTACT_EPSILON = 1e-6;
const SEPARATION = 1e-5;

export function pendulumLength(spec: MovingObstacleSpec): number {
  return Math.max(10, Math.abs(spec.amplitude) * 1.8);
}
const smooth = (t: number) => t * t * t * (10 + t * (-15 + 6 * t));
const smoothVelocity = (t: number) => 30 * t * t * (1 - t) * (1 - t);
function poseAt(spec: MovingObstacleSpec, clock: number): MovingObstaclePose {
  const omega = spec.period > 0 ? TAU / spec.period : 0;
  const angle =
    (Number.isFinite(clock) && spec.period > 0
      ? (clock % spec.period) * omega
      : 0) + spec.phase;
  let offset = spec.amplitude * Math.sin(angle);
  let velocity = spec.amplitude * omega * Math.cos(angle);
  let yawRate = 0;
  let facing = spec.heading,
    stride = 0,
    lift = 0,
    swingAngle = 0;
  if (spec.kind === "spinner") {
    offset = velocity = 0;
    facing = spec.heading + angle;
    yawRate = omega;
  } else if (spec.kind === "minecart" || spec.kind === "hauler") {
    const cycle = (((angle / TAU) % 1) + 1) % 1;
    const dwell = spec.kind === "minecart" ? 0.12 : 0.2;
    const travel = 0.5 - dwell;
    const returning = cycle >= 0.5;
    const local = returning ? cycle - 0.5 : cycle;
    const progress = Math.max(0, Math.min(1, (local - dwell) / travel));
    const position = returning ? 1 - smooth(progress) : smooth(progress);
    offset = spec.amplitude * (2 * position - 1);
    velocity =
      ((returning ? -1 : 1) *
        2 *
        spec.amplitude *
        smoothVelocity(progress) *
        omega) /
      TAU /
      travel;
    facing = spec.heading + Math.PI / 2;
    // Signed wheel travel reverses with the vehicle; no reset at the midpoint.
    stride = offset + spec.amplitude;
  } else if (spec.kind === "sheep" || spec.kind === "deer") {
    const cycle = (((angle / TAU) % 1) + 1) % 1;
    let progress = 0,
      direction = 1;
    if (cycle < 0.15) {
      facing = spec.heading - Math.PI / 2 + Math.PI * smooth(cycle / 0.15);
      yawRate = (Math.PI * smoothVelocity(cycle / 0.15) * omega) / TAU / 0.15;
    } else if (cycle < 0.5) {
      progress = smooth((cycle - 0.15) / 0.35);
      velocity =
        (2 * spec.amplitude * smoothVelocity((cycle - 0.15) / 0.35) * omega) /
        TAU /
        0.35;
      facing = spec.heading + Math.PI / 2;
    } else if (cycle < 0.65) {
      progress = 1;
      facing =
        spec.heading + Math.PI / 2 + Math.PI * smooth((cycle - 0.5) / 0.15);
      yawRate =
        (Math.PI * smoothVelocity((cycle - 0.5) / 0.15) * omega) / TAU / 0.15;
    } else {
      progress = 1 - smooth((cycle - 0.65) / 0.35);
      direction = -1;
      velocity =
        (-2 * spec.amplitude * smoothVelocity((cycle - 0.65) / 0.35) * omega) /
        TAU /
        0.35;
      facing = spec.heading + Math.PI * 1.5;
    }
    if (cycle < 0.15 || (cycle >= 0.5 && cycle < 0.65)) velocity = 0;
    offset = spec.amplitude * (2 * progress - 1);
    stride =
      2 *
      Math.abs(spec.amplitude) *
      (direction === 1 ? progress : 2 - progress);
    if (spec.amplitude < 0) facing += Math.PI;
  } else if (spec.kind === "pendulum") {
    const length = pendulumLength(spec);
    lift = length - Math.sqrt(Math.max(0, length * length - offset * offset));
    swingAngle = Math.asin(offset / length);
  }
  const nx = Math.cos(spec.heading),
    nz = -Math.sin(spec.heading);
  return {
    ...spec,
    y: spec.y + lift,
    facing,
    yawRate,
    stride,
    lift,
    swingAngle,
    x: spec.x + nx * offset,
    z: spec.z + nz * offset,
    vx: nx * velocity,
    vz: nz * velocity,
    offset,
  };
}

/** Pure: prediction, authority, AI, and meshes can evaluate the same race clock. */
export function movingObstaclesAt(
  track: ObstacleTrack,
  clock: number,
): MovingObstaclePose[] {
  return (track.movingObstacles ?? []).map((spec) => poseAt(spec, clock));
}

/** Fitted to all articulated solid vertices; radius is the capsule flank width. */
export function movingObstacleFootprint(pose: MovingObstaclePose) {
  const animal = pose.kind === "sheep" || pose.kind === "deer";
  const halfLength = animal
    ? pose.radius * (pose.kind === "sheep" ? 0.4 : 0.5)
    : pose.radius *
      (pose.kind === "spinner"
        ? 0.8
        : pose.kind === "minecart"
          ? 0.45
          : pose.kind === "hauler"
            ? 0.3
            : 0);
  return {
    halfLength,
    radius:
      pose.radius *
      (animal
        ? pose.kind === "sheep"
          ? 0.551
          : 0.461
        : pose.kind === "spinner"
          ? 0.2
          : pose.kind === "minecart"
            ? 0.55
            : pose.kind === "hauler"
              ? 0.7
              : 1),
    x: Math.sin(pose.facing) * halfLength,
    z: Math.cos(pose.facing) * halfLength,
  };
}
function collisionShape(heading: number, pose: MovingObstaclePose) {
  const shape = movingObstacleFootprint(pose),
    base = contactOutline(heading);
  return {
    polygon:
      shape.halfLength > 0
        ? expandContactOutline(base, shape.x, shape.z)
        : base,
    radius: shape.radius,
  };
}
function surfaceVelocity(pose: MovingObstaclePose, nx: number, nz: number) {
  const shape = movingObstacleFootprint(pose),
    sign = nx * shape.x + nz * shape.z >= 0 ? 1 : -1;
  return {
    vx: pose.vx + sign * shape.z * pose.yawRate,
    vz: pose.vz - sign * shape.x * pose.yawRate,
  };
}
function turnSpeedBound(
  spec: MovingObstacleSpec,
  clock: number,
  duration: number,
) {
  if (spec.kind === "spinner") return spec.period > 0 ? TAU / spec.period : 0;
  if ((spec.kind !== "sheep" && spec.kind !== "deer") || !(spec.period > 0))
    return 0;
  const start = (((clock / spec.period + spec.phase / TAU) % 1) + 1) % 1,
    end = start + duration / spec.period;
  const bound = (Math.PI * 1.875) / (0.15 * spec.period);
  if (end - start >= 1) return bound;
  for (const k of [0, 1])
    if ((start < k + 0.15 && end > k) || (start < k + 0.65 && end > k + 0.5))
      return bound;
  return 0;
}
/** Signed actual footprint/disc clearance; normal points toward the kart. */
export function movingObstacleClearance(
  body: Pick<Body, "x" | "z"> & { heading?: number },
  pose: MovingObstaclePose,
) {
  const shape = collisionShape(body.heading ?? 0, pose);
  return discClearance(
    { x: body.x - pose.x, z: body.z - pose.z },
    shape.polygon,
    shape.radius,
  );
}
/**
 * Position-only recovery for inter-kart separation at the exact current clock.
 * Changes no velocity, timers, or collision resources. The caller still owns
 * road-boundary constraints, including after this correction. Returns whether
 * any overlap was corrected. escapeHeading selects road-parallel recovery.
 * Authored obstacles have non-overlapping envelopes;
 * bounded repeated passes also accommodate an accidental pair overlap.
 */
export function constrainMovingObstacles(
  body: Pick<Body, "x" | "z"> & { heading?: number },
  track: ObstacleTrack,
  clock: number,
  escapeHeading?: number,
): boolean {
  const poses = movingObstaclesAt(track, clock);
  let changed = false;
  for (let pass = 0; pass < 8; pass++) {
    let overlap = false;
    for (const pose of poses) {
      const contact = movingObstacleClearance(body, pose);
      if (contact.distance >= -CONTACT_EPSILON) continue;
      if (escapeHeading !== undefined) {
        // A road clamp can prevent lateral recovery. Find the nearest clear
        // point along the road, maintaining the kart's lateral position.
        const nx = Math.sin(escapeHeading),
          nz = Math.cos(escapeHeading);
        let best = Infinity;
        for (const sign of [-1, 1]) {
          let low = 0,
            high = 2 * (MOVING_OBSTACLE_KART_RADIUS + pose.radius) + SEPARATION;
          for (let n = 0; n < 40; n++) {
            const middle = (low + high) / 2;
            const probe = {
              ...body,
              x: body.x + sign * nx * middle,
              z: body.z + sign * nz * middle,
            };
            if (movingObstacleClearance(probe, pose).distance < SEPARATION)
              low = middle;
            else high = middle;
          }
          if (high < Math.abs(best)) best = sign * high;
        }
        body.x += nx * best;
        body.z += nz * best;
      } else {
        body.x += contact.nx * (-contact.distance + SEPARATION);
        body.z += contact.nz * (-contact.distance + SEPARATION);
      }
      overlap = changed = true;
    }
    if (!overlap) break;
  }
  return changed;
}

interface Contact {
  time: number;
  pose: MovingObstaclePose;
}

/**
 * Bound sine/quintic deviation from each relative-motion chord by a*h²/8.
 * Discard intervals whose whole bound misses the rounded kart polygon, then subdivide
 * potential hits in time order. Leaf sweeps have at most one micrometre of
 * curve error. Kart speed does not set a sampling interval, so a fast kart
 * cannot pass between samples. Work is bounded even for malformed long steps.
 */
function firstContact(
  spec: MovingObstacleSpec,
  x: number,
  z: number,
  vx: number,
  vz: number,
  clock: number,
  duration: number,
  heading: number,
): Contact | null {
  const radius = spec.radius + MOVING_OBSTACLE_KART_RADIUS;
  const acceleration =
    spec.period > 0 && spec.kind !== "spinner"
      ? Math.abs(spec.amplitude) *
        (spec.kind === "sheep" || spec.kind === "deer"
          ? 12 / (0.35 * spec.period) ** 2
          : spec.kind === "minecart" || spec.kind === "hauler"
            ? 12 / ((spec.kind === "minecart" ? 0.38 : 0.3) * spec.period) ** 2
            : (TAU / spec.period) ** 2)
      : 0;
  const forwardX = Math.sin(spec.heading),
    forwardZ = Math.cos(spec.heading);
  let budget = 2048;
  const relative = (time: number) => {
    const pose = poseAt(spec, clock + time);
    return { x: x + vx * time - pose.x, z: z + vz * time - pose.z, pose };
  };
  type Relative = ReturnType<typeof relative>;
  function visit(
    a: number,
    b: number,
    p: Relative,
    q: Relative,
    depth: number,
  ): Contact | null {
    if (--budget < 0) return null;
    const midpointPose = poseAt(spec, clock + (a + b) / 2);
    const { polygon, radius: discRadius } = collisionShape(
      heading,
      midpointPose,
    );
    const rotationError =
      (movingObstacleFootprint(midpointPose).halfLength *
        turnSpeedBound(spec, clock + a, b - a) *
        (b - a)) /
      2;
    // The obstacle never moves along the road. This exact linear bound also
    // excludes grazing a swept circle, without inflating a tangent into damage.
    const alongA = p.x * forwardX + p.z * forwardZ;
    const alongB = q.x * forwardX + q.z * forwardZ;
    const support = polygon.map((p) => p.x * forwardX + p.z * forwardZ);
    if (
      Math.min(alongA, alongB) >=
        Math.max(...support) + discRadius + rotationError - 1e-10 ||
      Math.max(alongA, alongB) <=
        Math.min(...support) - discRadius - rotationError + 1e-10
    )
      return null;
    const dx = q.x - p.x,
      dz = q.z - p.z;
    const travel2 = dx * dx + dz * dz;
    const f =
      travel2 > 0
        ? Math.max(0, Math.min(1, -(p.x * dx + p.z * dz) / travel2))
        : 0;
    const error =
      Math.min(
        2 * Math.abs(spec.amplitude),
        (acceleration * (b - a) ** 2) / 8,
      ) + rotationError;
    const minimum = Math.hypot(p.x + dx * f, p.z + dz * f);
    if (minimum >= radius + error) return null;
    const startShape = collisionShape(heading, p.pose);
    const clearance = discClearance(p, startShape.polygon, startShape.radius);
    const startVelocity = surfaceVelocity(p.pose, clearance.nx, clearance.nz);
    const inward =
      clearance.nx * (vx - startVelocity.vx) +
      clearance.nz * (vz - startVelocity.vz);
    if (
      clearance.distance < -CONTACT_EPSILON ||
      (clearance.distance <= CONTACT_EPSILON && inward < -CONTACT_EPSILON)
    )
      return { time: a, pose: p.pose };
    const fraction = sweepRoundedPolygon(p, q, polygon, discRadius + error);
    if (fraction === null) return null;
    if (error <= CONTACT_EPSILON || depth >= 20) {
      const time = a + fraction * (b - a),
        hit = relative(time);
      const hitShape = collisionShape(heading, hit.pose);
      const contact = discClearance(hit, hitShape.polygon, hitShape.radius);
      const hitVelocity = surfaceVelocity(hit.pose, contact.nx, contact.nz);
      const closing =
        contact.nx * (vx - hitVelocity.vx) + contact.nz * (vz - hitVelocity.vz);
      return contact.distance <= 2 * CONTACT_EPSILON &&
        closing < -CONTACT_EPSILON
        ? { time, pose: hit.pose }
        : null;
    }
    const middle = (a + b) / 2,
      m = relative(middle);
    return (
      visit(a, middle, p, m, depth + 1) ?? visit(middle, b, m, q, depth + 1)
    );
  }
  return visit(0, duration, relative(0), relative(duration), 0);
}

/**
 * Call after normal kart integration, with its pre-integration position.
 * Continue the remaining step using contact-relative velocity. A moving solid
 * therefore also contacts a parked kart. The caller applies road constraints
 * afterwards and owns collision cooldowns, drift penalties, and event history.
 */
export function resolveMovingObstacles(
  body: Body,
  track: ObstacleTrack,
  startClock: number,
  dt: number,
  previousX: number,
  previousZ: number,
): number[] {
  const specs = track.movingObstacles;
  if (!specs?.length || !(dt > 0) || !Number.isFinite(dt)) return [];
  let x = previousX,
    z = previousZ;
  let vx = (body.x - previousX) / dt,
    vz = (body.z - previousZ) / dt;
  let elapsed = 0;
  let touched = false;
  const impacts = new Map<string, number>();
  const contactSides = new Map<string, { nx: number; nz: number }>();
  for (let event = 0; event < 12 && elapsed < dt; event++) {
    let next: Contact | null = null;
    for (const spec of specs) {
      const contact = firstContact(
        spec,
        x,
        z,
        vx,
        vz,
        startClock + elapsed,
        dt - elapsed,
        body.heading,
      );
      if (contact && (!next || contact.time < next.time)) next = contact;
    }
    if (!next) {
      x += vx * (dt - elapsed);
      z += vz * (dt - elapsed);
      elapsed = dt;
      break;
    }
    touched = true;
    x += vx * next.time;
    z += vz * next.time;
    elapsed += next.time;
    const obstacle = next.pose;
    const contact = movingObstacleClearance(
      { x, z, heading: body.heading },
      obstacle,
    );
    const { nx, nz } = contact;
    x += nx * Math.max(0, -contact.distance + SEPARATION);
    z += nz * Math.max(0, -contact.distance + SEPARATION);
    contactSides.set(obstacle.id, { nx, nz });
    const obstacleVelocity = surfaceVelocity(obstacle, nx, nz);
    const closing =
      (body.vx - obstacleVelocity.vx) * nx +
      (body.vz - obstacleVelocity.vz) * nz;
    if (closing < -CONTACT_EPSILON) {
      body.vx -= closing * nx;
      body.vz -= closing * nz;
      impacts.set(
        obstacle.id,
        Math.max(impacts.get(obstacle.id) ?? 0, Math.min(1, -closing / 32)),
      );
    }
    vx = body.vx;
    vz = body.vz;
  }
  if (touched && elapsed < dt) {
    // An accelerating barrier can maintain contact continuously and exhaust
    // discrete impulses. Finish the step on the same side of that solid;
    // stopping time here would let the barrier pass through a stationary kart.
    x += vx * (dt - elapsed);
    z += vz * (dt - elapsed);
    for (const spec of specs) {
      const side = contactSides.get(spec.id);
      if (!side) continue;
      const pose = poseAt(spec, startClock + dt);
      const { polygon, radius: discRadius } = collisionShape(
        body.heading,
        pose,
      );
      // Keep the original contact side using the exact rounded polygon ray
      // exit, even when an accelerating obstacle exhausts the impulse budget.
      const relative = { x: x - pose.x, z: z - pose.z };
      const reach =
        2 * (spec.radius + MOVING_OBSTACLE_KART_RADIUS) +
        Math.hypot(relative.x, relative.z);
      const far = {
        x: relative.x + side.nx * reach,
        z: relative.z + side.nz * reach,
      };
      const entry = sweepRoundedPolygon(
        far,
        relative,
        polygon,
        discRadius + SEPARATION,
      );
      if (entry === null) continue;
      const correction = reach * (1 - entry);
      x += side.nx * correction;
      z += side.nz * correction;
      const velocity = surfaceVelocity(pose, side.nx, side.nz);
      const closing =
        (body.vx - velocity.vx) * side.nx + (body.vz - velocity.vz) * side.nz;
      if (closing < 0) {
        body.vx -= closing * side.nx;
        body.vz -= closing * side.nz;
      }
    }
  }
  if (touched) {
    const recovered = { x, z, heading: body.heading };
    constrainMovingObstacles(recovered, track, startClock + dt);
    body.x = recovered.x;
    body.z = recovered.z;
    body.speed = Math.max(
      -63,
      Math.min(
        63,
        body.vx * Math.sin(body.heading) + body.vz * Math.cos(body.heading),
      ),
    );
  }
  return [...impacts.values()];
}
