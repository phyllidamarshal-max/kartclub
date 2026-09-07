import { DRIVING_CONFIG as CFG } from "./driving-config.ts";
import {
  trackPoint,
  nearestTrack,
  continuousTrack,
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
  storedNitro: number;
  miniTime: number;
  miniWindow: number;
  resetTime: number;
  slipAngle: number;
  driftState: "grip" | "entering" | "drifting" | "recovering";
  nitroUses: number;
  miniUses: number;
  collisionCount: number;
  lastLapTime: number;
  sectorTimes: number[];
  driftDuration: number;
  nitroBuffer: number;
  throttleHeld: boolean;
  resetProgress: number;
  spawnProgress: number;
  routeBranch: "main" | "shortcut";
  progressTravel: number;
  lastX: number;
  lastZ: number;
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
    startT = continuousTrack(x, z, 0, track).t,
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
    storedNitro: 0,
    miniTime: 0,
    miniWindow: 0,
    resetTime: 0,
    slipAngle: 0,
    driftState: "grip",
    nitroUses: 0,
    miniUses: 0,
    collisionCount: 0,
    lastLapTime: 0,
    sectorTimes: [],
    driftDuration: 0,
    nitroBuffer: 0,
    throttleHeld: false,
    resetProgress: startProgress,
    spawnProgress: startProgress,
    routeBranch: "main",
    progressTravel: 0,
    lastX: x,
    lastZ: z,
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
function cancelEligibility(c: Car) {
  c.miniWindow = 0;
  c.miniTime = 0;
  c.nitroBuffer = 0;
  c.driftDuration = 0;
  c.driftState = "grip";
  c.drifting = false;
}
function convertEnergy(c: Car) {
  if (c.energy >= CFG.energy.capacity && c.storedNitro < CFG.nitro.capacity) {
    c.energy -= CFG.energy.capacity;
    c.storedNitro++;
  }
  c.energy = Math.min(CFG.energy.capacity, c.energy);
}
function startNitro(c: Car, remainder = 0) {
  if (c.storedNitro < 1) return;
  c.storedNitro--;
  c.nitroUses++;
  c.boostTime = CFG.nitro.duration + remainder;
  c.miniTime = 0;
  c.nitroBuffer = 0;
  convertEnergy(c);
}
function signedDelta(t: number, previous: number) {
  let d = t - previous;
  if (d > 0.5) d--;
  if (d < -0.5) d++;
  return d;
}
export function stepCar(c: Car, raw: Input, dt: number, track = DEFAULT_TRACK) {
  if (c.finished) {
    c.boostTime = 0;
    cancelEligibility(c);
    return;
  }
  const input = sanitizeInput(raw);
  dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 1 / 30)) : 0;
  const boostPress = input.boost && !c.boostHeld;
  const throttlePress = input.throttle > 0 && !c.throttleHeld;
  const resetPress = input.reset && !c.resetHeld;
  c.boostHeld = input.boost;
  c.throttleHeld = input.throttle > 0;
  c.resetHeld = input.reset;
  c.time += dt;
  c.ghostTime = Math.max(0, c.ghostTime - dt);
  c.impact = Math.max(0, c.impact - dt * 2.5);
  if (resetPress && c.resetTime <= 0) {
    c.resetProgress = Math.min(
      c.checkpoint / 12,
      Math.floor(c.progress * 12) / 12,
    );
    // A grid slot behind the start remains its original safe spawn only until
    // the driver reverses behind that slot; reset never forgives reverse travel.
    if (c.progress < 0 && c.progress >= c.spawnProgress)
      c.resetProgress = c.spawnProgress;
    c.resetTime = CFG.reset.wait;
    c.boostTime = 0;
    cancelEligibility(c);
    c.speed = 0;
    c.vx = 0;
    c.vz = 0;
  }
  if (c.resetTime > 0) {
    c.resetTime = Math.max(0, c.resetTime - dt);
    if (c.resetTime < 1e-9) {
      c.resetTime = 0;
      const p = trackPoint(c.resetProgress, track);
      c.x = p.x;
      c.z = p.z;
      c.heading = p.heading;
      c.lastT = p.t;
      c.progress = c.resetProgress;
      c.routeBranch = "main";
      c.progressTravel = 0;
      c.lastX = c.x;
      c.lastZ = c.z;
      c.ghostTime = CFG.reset.protection;
      c.impact = 0;
    }
    return;
  }
  const previousBoost = c.boostTime;
  c.boostTime = Math.max(0, previousBoost - dt);
  c.miniTime = Math.max(0, c.miniTime - dt);
  c.miniWindow = Math.max(0, c.miniWindow - dt);
  convertEnergy(c);
  if (
    boostPress &&
    previousBoost > 0 &&
    previousBoost <= CFG.nitro.buffer + 1e-9
  )
    c.nitroBuffer = CFG.nitro.buffer;
  if (previousBoost > 0 && previousBoost <= dt + 1e-9 && c.nitroBuffer > 0)
    startNitro(c, Math.min(0, previousBoost - dt));
  else if (boostPress && previousBoost <= 0) startNitro(c);
  c.nitroBuffer = Math.max(0, c.nitroBuffer - dt);
  if (throttlePress && c.miniWindow > 0 && c.boostTime <= 0) {
    c.miniTime = CFG.mini.duration;
    c.miniWindow = 0;
    c.miniUses++;
  }
  const boost = c.boostTime > 0 ? CFG.nitro : c.miniTime > 0 ? CFG.mini : null;
  const maxSpeed = CFG.vehicle.maxSpeed * (boost?.maxSpeed ?? 1);
  const wasOverspeed = c.speed > maxSpeed;
  if (c.speed <= maxSpeed)
    c.speed +=
      input.throttle *
      CFG.vehicle.acceleration *
      (boost?.acceleration ?? 1) *
      dt;
  c.speed *= Math.exp(-(input.throttle === 0 ? 1.25 : 0.22) * dt);
  if (c.speed > maxSpeed)
    c.speed = wasOverspeed
      ? maxSpeed + (c.speed - maxSpeed) * Math.exp(-3 * dt)
      : maxSpeed;
  c.speed = Math.max(-CFG.vehicle.reverseSpeed, c.speed);
  const requestedDrift =
    input.drift && Math.abs(input.steer) > 0.15 && c.speed > 10;
  c.heading +=
    input.steer *
    (requestedDrift ? CFG.vehicle.driftTurnRate : CFG.vehicle.turnRate) *
    Math.min(1, Math.abs(c.speed) / 10) *
    Math.sign(c.speed) *
    dt;
  const grip =
    1 -
    Math.exp(-(requestedDrift ? CFG.vehicle.driftGrip : CFG.vehicle.grip) * dt);
  c.vx += (Math.sin(c.heading) * c.speed - c.vx) * grip;
  c.vz += (Math.cos(c.heading) * c.speed - c.vz) * grip;
  const previousX = c.x,
    previousZ = c.z;
  if (track.shortcut.length > 1) {
    const entry = track.shortcut[0],
      exit = track.shortcut.at(-1)!;
    if (
      c.routeBranch === "main" &&
      Math.abs(signedDelta(c.lastT, entry.t)) * track.length < 5
    ) {
      const main = continuousTrack(c.x, c.z, c.lastT, track, "main");
      const branch = continuousTrack(c.x, c.z, c.lastT, track, "shortcut");
      const direction = Math.atan2(c.vx, c.vz);
      if (
        branch.distance < 2.45 &&
        Math.abs(angleDiff(direction, entry.heading)) + 0.15 <
          Math.abs(angleDiff(direction, main.heading))
      )
        c.routeBranch = "shortcut";
    } else if (c.routeBranch === "shortcut" && c.lastT >= exit.t - 1e-8)
      c.routeBranch = "main";
  }
  const before = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch);
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  const collision = constrainEnvironment(c, track, previousX, previousZ);
  const p = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch);
  const travel = Math.hypot(c.x - previousX, c.z - previousZ);
  const delta = signedDelta(p.t, c.lastT);
  // Arc distance may exceed a chord on an inside racing line. The bound uses
  // this step's physical travel and the branch's explicit metric conversion.
  const scale = Math.max(1, p.progressScale, before.progressScale);
  const coherent =
    Math.abs(signedDelta(before.t, c.lastT)) * track.length <= 2.2 * scale;
  const externalTravel = Math.hypot(previousX - c.lastX, previousZ - c.lastZ);
  const budget =
    c.progressTravel + travel + (externalTravel <= 2.2 ? externalTravel : 0);
  const legal =
    coherent && Math.abs(delta) * track.length <= budget * 1.8 * scale + 1e-6;
  c.lastX = c.x;
  c.lastZ = c.z;
  c.progressTravel = legal && Math.abs(delta) > 1e-10 ? 0 : Math.min(3, budget);
  let forward = 0;
  if (legal) {
    const previous = c.progress;
    c.lastT = p.t;
    c.progress += delta;
    c.checkpoint = Math.max(c.checkpoint, Math.floor(c.progress * 12));
    const nextLap = Math.max(c.lap, Math.floor(c.progress + 1e-10));
    if (delta > 0) {
      forward = Math.min(travel, (delta * track.length) / scale);
      for (let sector = c.sectorTimes.length + 1; sector <= 2; sector++) {
        const threshold = c.lap + sector / 3;
        if (previous < threshold && c.progress >= threshold)
          c.sectorTimes.push(
            c.time - dt + (dt * (threshold - previous)) / delta - c.lastLapTime,
          );
      }
      if (nextLap > c.lap) {
        c.lastLapTime = c.time - dt + (dt * (nextLap - previous)) / delta;
        c.sectorTimes = [];
      }
    }
    c.lap = nextLap;
  }
  const velocity = Math.hypot(c.vx, c.vz);
  c.slipAngle =
    velocity > 1e-6 ? angleDiff(c.heading, Math.atan2(c.vx, c.vz)) : 0;
  const angle = Math.abs(c.slipAngle);
  const angleWeight = Math.max(
    0,
    Math.min(
      (angle - CFG.drift.angleMin) / (CFG.drift.anglePeak - CFG.drift.angleMin),
      (CFG.drift.angleMax - angle) / (CFG.drift.angleMax - CFG.drift.anglePeak),
    ),
  );
  const valid =
    requestedDrift &&
    !collision &&
    c.impact < CFG.collision.severeImpact &&
    velocity >= CFG.vehicle.maxSpeed * CFG.drift.minSpeedRatio &&
    forward > 1e-6 &&
    angleWeight > 0 &&
    c.speed > 0;
  c.drifting = requestedDrift;
  if (c.impact >= CFG.collision.severeImpact) cancelEligibility(c);
  else if (valid) {
    c.driftState = "drifting";
    c.driftDuration += dt;
    const gain =
      CFG.energy.perSecond *
      dt *
      angleWeight *
      Math.min(1, velocity / CFG.vehicle.maxSpeed) *
      Math.min(1, forward / (CFG.vehicle.maxSpeed * dt));
    c.energy = Math.min(CFG.energy.capacity, c.energy + gain);
    c.driftTotal += gain;
    convertEnergy(c);
  } else if (angle <= CFG.drift.recoverAngle) {
    if (c.driftDuration + 1e-9 >= CFG.drift.eligibility)
      c.miniWindow = CFG.mini.window;
    c.driftDuration = 0;
    c.driftState = "grip";
  } else c.driftState = requestedDrift ? "entering" : "recovering";
  if (requestedDrift)
    c.speed *= Math.exp(
      -(CFG.drift.drag + Math.max(0, angle - CFG.drift.anglePeak)) * dt,
    );
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
  if (-inward > 2 && c.impact <= 0.01) c.collisionCount++;
  c.impact = Math.max(c.impact || 0, Math.min(1, -inward / 32));
  if (c.impact >= CFG.collision.severeImpact) cancelEligibility(c);
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
  const p = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch);
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
  const active = cars.filter(
    (c) => !c.finished && !(c.ghostTime > 0) && !(c.resetTime > 0),
  );
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
        const heading = continuousTrack(
          a.x,
          a.z,
          a.lastT,
          track,
          a.routeBranch,
        ).heading;
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
          if (impact > 0.06 && a.impact <= 0.01) a.collisionCount++;
          if (impact > 0.06 && b.impact <= 0.01) b.collisionCount++;
          if (impact >= CFG.collision.severeImpact) {
            cancelEligibility(a);
            cancelEligibility(b);
          }
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
