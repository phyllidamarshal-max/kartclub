import {
  trackPoint,
  nearestTrack,
  DEFAULT_TRACK,
  angleDiff,
  type Track,
} from "./track.ts";
export interface Input {
  throttle: number;
  steer: number;
  drift: boolean;
  boost: boolean;
  reset: boolean;
  item?: boolean;
}
export const EMPTY_INPUT: Input = {
  throttle: 0,
  steer: 0,
  drift: false,
  boost: false,
  reset: false,
  item: false,
};
export interface Car {
  id: string;
  slot: number;
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  speed: number;
  energy: number;
  boostTime: number;
  drifting: boolean;
  driftTotal: number;
  progress: number;
  lap: number;
  lastT: number;
  checkpoint: number;
  boostHeld: boolean;
  resetHeld: boolean;
  ghostTime: number;
  impact: number;
  finished: boolean;
  time: number;
  ack: number;
}
export function spawnCar(slot = 0, id = "local", track = DEFAULT_TRACK): Car {
  const p = trackPoint(0, track),
    side = slot % 2 === 0 ? -2.4 : 2.4,
    back = Math.floor(slot / 2) * 5,
    x = p.x + Math.cos(p.heading) * side - Math.sin(p.heading) * back,
    z = p.z - Math.sin(p.heading) * side - Math.cos(p.heading) * back,
    startT = nearestTrack(x, z, track).t,
    startProgress = startT > 0.5 ? startT - 1 : startT;
  return {
    id,
    slot,
    x,
    z,
    heading: p.heading,
    vx: 0,
    vz: 0,
    speed: 0,
    energy: 0,
    boostTime: 0,
    drifting: false,
    driftTotal: 0,
    progress: startProgress,
    lap: 0,
    lastT: startT,
    checkpoint: 0,
    boostHeld: false,
    resetHeld: false,
    ghostTime: 0,
    impact: 0,
    finished: false,
    time: 0,
    ack: 0,
  };
}
export function sanitizeInput(v: unknown): Input {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Input>;
  const axis = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n)
      ? Math.max(-1, Math.min(1, n))
      : 0;
  return {
    throttle: axis(o.throttle),
    steer: axis(o.steer),
    drift: o.drift === true,
    boost: o.boost === true,
    reset: o.reset === true,
    item: o.item === true,
  };
}
export function advanceProgress(c: Car, t: number) {
  let d = t - c.lastT;
  if (d < -0.5) d++;
  if (d > 0.5) d--;
  if (Math.abs(d) > 0.04) return;
  c.lastT = t;
  c.progress += d;
  c.lap = Math.max(0, Math.floor(c.progress + 1e-6));
  const cp = Math.floor(c.progress * 12);
  if (cp > c.checkpoint) c.checkpoint = cp;
}
export function stepCar(c: Car, raw: Input, dt: number, track = DEFAULT_TRACK) {
  if (c.finished) return;
  const input = sanitizeInput(raw);
  dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 1 / 30)) : 0;
  c.time += dt;
  c.ghostTime = Math.max(0, (c.ghostTime || 0) - dt);
  c.impact = Math.max(0, (c.impact || 0) - dt * 2.5);
  if (input.reset && !c.resetHeld) {
    const p = trackPoint(c.checkpoint / 12, track);
    c.x = p.x;
    c.z = p.z;
    c.heading = p.heading;
    c.speed = 0;
    c.vx = 0;
    c.vz = 0;
    c.lastT = p.t;
    c.progress = c.checkpoint / 12;
    c.boostTime = 0;
    c.ghostTime = 2;
    c.impact = 0;
  }
  c.resetHeld = input.reset;
  if (input.boost && !c.boostHeld && c.energy >= 100) {
    c.energy -= 100;
    c.boostTime = 2.3;
  }
  c.boostHeld = input.boost;
  c.boostTime = Math.max(0, c.boostTime - dt);
  const boosting = c.boostTime > 0;
  c.speed += input.throttle * (boosting ? 29 : 22) * dt;
  c.speed *= Math.exp(-(input.throttle === 0 ? 1.25 : 0.22) * dt);
  c.speed = Math.max(-10, Math.min(boosting ? 63 : 43, c.speed));
  c.drifting = input.drift && Math.abs(input.steer) > 0.15 && c.speed > 10;
  c.heading +=
    input.steer *
    (c.drifting ? 1.8 : 1.2) *
    Math.min(1, Math.abs(c.speed) / 10) *
    Math.sign(c.speed) *
    dt;
  const grip = 1 - Math.exp(-(c.drifting ? 2.8 : 10) * dt);
  c.vx += (Math.sin(c.heading) * c.speed - c.vx) * grip;
  c.vz += (Math.cos(c.heading) * c.speed - c.vz) * grip;
  const previousX = c.x,
    previousZ = c.z;
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  const collision = constrainEnvironment(c, track, previousX, previousZ);
  const p = nearestTrack(c.x, c.z, track);
  if (c.drifting && !collision) {
    const amount = Math.min(24, c.speed * 0.62) * dt;
    c.energy = Math.min(200, c.energy + amount);
    c.driftTotal += amount;
    c.speed *= Math.exp(-0.13 * dt);
  }
  if (Math.abs(angleDiff(c.heading, p.heading)) < Math.PI * 0.7)
    advanceProgress(c, p.t);
}
const CAR_RADIUS = 1.05;

function syncSpeed(c: Car) {
  c.speed = Math.max(
    -63,
    Math.min(63, c.vx * Math.sin(c.heading) + c.vz * Math.cos(c.heading)),
  );
}

// Remove only the velocity pointing into a solid surface; retain sliding motion.
function surfaceVelocity(c: Car, nx: number, nz: number) {
  const inward = c.vx * nx + c.vz * nz;
  if (inward >= 0) return;
  c.vx -= inward * nx;
  c.vz -= inward * nz;
  c.impact = Math.max(c.impact || 0, Math.min(1, -inward / 32));
  syncSpeed(c);
}

function constrainEnvironment(
  c: Car,
  track: Track,
  previousX = c.x,
  previousZ = c.z,
) {
  let collision = false;
  for (const obstacle of track.obstacles) {
    const radius = obstacle.radius + CAR_RADIUS;
    const ox = previousX - obstacle.x,
      oz = previousZ - obstacle.z;
    const dx = c.x - previousX,
      dz = c.z - previousZ;
    const travel2 = dx * dx + dz * dz;
    const startDistance = Math.hypot(ox, oz);
    const b = ox * dx + oz * dz;
    let hitX = c.x - obstacle.x,
      hitZ = c.z - obstacle.z;
    let hit = Math.hypot(hitX, hitZ) < radius;
    // A projected contact can round a few ulps inside the circle. Treat that
    // as boundary contact so tangent/outward travel is not pulled back.
    // Inward travel from that same boundary shell is an immediate impact;
    // its mathematical entry root can be slightly negative after rounding.
    if (
      startDistance < radius - 1e-7 ||
      (startDistance <= radius + 1e-7 && b < -1e-9)
    ) {
      hit = true;
      hitX = ox;
      hitZ = oz;
    } else if (travel2 > 0) {
      const discriminant =
        b * b - travel2 * (ox * ox + oz * oz - radius * radius);
      // Sweep only into the circle. A tangent root at t=0 is not an impact.
      if (b < -1e-9 && discriminant > 0) {
        const time = (-b - Math.sqrt(discriminant)) / travel2;
        if (time >= 0 && time <= 1) {
          hit = true;
          hitX = ox + dx * time;
          hitZ = oz + dz * time;
        }
      }
    }
    if (!hit) continue;
    let norm = Math.hypot(hitX, hitZ);
    if (norm < 1e-9) {
      hitX = -Math.sin(c.heading);
      hitZ = -Math.cos(c.heading);
      norm = 1;
    }
    const nx = hitX / norm,
      nz = hitZ / norm;
    c.x = obstacle.x + nx * radius;
    c.z = obstacle.z + nz * radius;
    surfaceVelocity(c, nx, nz);
    collision = true;
  }
  const p = nearestTrack(c.x, c.z, track);
  const limit = Math.max(0, p.roadWidth / 2 - CAR_RADIUS);
  if (p.distance > limit) {
    const norm = Math.hypot(c.x - p.x, c.z - p.z) || 1;
    const nx = (c.x - p.x) / norm,
      nz = (c.z - p.z) / norm;
    c.x = p.x + nx * limit;
    c.z = p.z + nz * limit;
    surfaceVelocity(c, -nx, -nz);
    collision = true;
  }
  return collision;
}

export function separateCars(cars: Car[], track = DEFAULT_TRACK) {
  const active = cars.filter((c) => !c.finished && !(c.ghostTime > 0));
  // Reproject after every pair so a contact cannot leave a kart through a wall.
  // Repeated bounded corrections converge for queues and side-by-side contacts.
  for (let pass = 0; pass < 48; pass++) {
    let overlap = false;
    for (let i = 0; i < active.length; i++)
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i],
          b = active[j];
        const dx = a.x - b.x,
          dz = a.z - b.z,
          d = Math.hypot(dx, dz);
        if (d >= CAR_RADIUS * 2 - 1e-7) continue;
        overlap = true;
        // A road tangent also separates coincident stationary cars near a wall.
        const heading = nearestTrack(a.x, a.z, track).heading;
        const nx = d > 1e-9 ? dx / d : Math.sin(heading);
        const nz = d > 1e-9 ? dz / d : Math.cos(heading);
        const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (closing < 0) {
          const impulse = Math.min(24, -closing * 0.52);
          a.vx += nx * impulse;
          a.vz += nz * impulse;
          b.vx -= nx * impulse;
          b.vz -= nz * impulse;
          syncSpeed(a);
          syncSpeed(b);
          const impact = Math.min(1, -closing / 32);
          a.impact = Math.max(a.impact || 0, impact);
          b.impact = Math.max(b.impact || 0, impact);
        }
        const push = (CAR_RADIUS * 2 - d) * 0.5;
        a.x += nx * push;
        a.z += nz * push;
        b.x -= nx * push;
        b.z -= nz * push;
        constrainEnvironment(a, track);
        constrainEnvironment(b, track);
      }
    if (!overlap) break;
  }
}
