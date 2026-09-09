import { DRIVING_CONFIG as CFG } from "./driving-config.ts";
import { sanitizeKartId, type KartId } from "./karts.ts";
import { sanitizeDriverAppearance, type DriverAppearance, type DriverOutfitId, type DriverColorId } from './drivers.ts';
import { driftEfficiency } from "./driving-skills.ts";
import { drivingZoneAt } from "./levels.ts";
import { resolveKartContacts } from "./kart-contact.ts";
import {
  resolveMovingObstacles,
  constrainMovingObstacles,
} from "./moving-obstacles.ts";
import {
  trackPoint,
  nearestTrack,
  continuousTrack,
  junctionContains,
  shortcutWidthAt,
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
  kartId?: KartId;
  driverOutfit?: DriverOutfitId;
  driverColor?: DriverColorId;
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
  collisionCooldown: number;
  lastCollisionStrength: number;
  lastCollisionKind: "wall" | "obstacle" | "kart";
  energyLockTime: number;
  lastEnergyLoss: number;
  lastLapTime: number;
  sectorTimes: number[];
  driftDuration: number;
  cleanDrifts: number;
  driftChains: number;
  driftAttempts: number;
  miniOpportunities: number;
  missedMini: number;
  lastDriftGain: number;
  lastDriftKind: "short" | "long" | "chain" | "none";
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
export function spawnCar(slot = 0, id = "local", track = DEFAULT_TRACK, kartId: KartId = 'club', driver?: DriverAppearance): Car {
  const p = trackPoint(0, track),
    side = slot % 2 === 0 ? -2.4 : 2.4,
    back = Math.floor(slot / 2) * 5,
    x = p.x + Math.cos(p.heading) * side - Math.sin(p.heading) * back,
    z = p.z - Math.sin(p.heading) * side - Math.cos(p.heading) * back,
    startT = continuousTrack(x, z, 0, track).t,
    startProgress = startT > 0.5 ? startT - 1 : startT;
  return {
    id,
    kartId: sanitizeKartId(kartId),
    ...(driver ? {driverOutfit:sanitizeDriverAppearance(driver).outfitId, driverColor:sanitizeDriverAppearance(driver).colorId} : {}),
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
    collisionCooldown: 0,
    lastCollisionStrength: 0,
    lastCollisionKind: "wall",
    energyLockTime: 0,
    lastEnergyLoss: 0,
    lastLapTime: 0,
    sectorTimes: [],
    driftDuration: 0,
    cleanDrifts: 0,
    driftChains: 0,
    driftAttempts: 0,
    miniOpportunities: 0,
    missedMini: 0,
    lastDriftGain: 0,
    lastDriftKind: "none",
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
}
function signedDelta(t: number, previous: number) {
  let d = t - previous;
  if (d > 0.5) d--;
  if (d < -0.5) d++;
  return d;
}
export function stepCar(
  c: Car,
  raw: Input,
  dt: number,
  track = DEFAULT_TRACK,
  startClock = c.time,
) {
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
  c.collisionCooldown = Math.max(0, c.collisionCooldown - dt);
  c.energyLockTime = Math.max(0, c.energyLockTime - dt);
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
    if (c.driftDuration > 0) {
      c.lastDriftGain = 0;
      c.lastDriftKind = "none";
    }
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
  const previousMiniWindow = c.miniWindow;
  c.boostTime = Math.max(0, previousBoost - dt);
  c.miniTime = Math.max(0, c.miniTime - dt);
  c.miniWindow = Math.max(0, c.miniWindow - dt);
  if (previousMiniWindow > 0 && c.miniWindow <= 0) c.missedMini++;
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
  const surface = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch);
  const zone = drivingZoneAt(
    track.id,
    surface.t,
    surface.lateral,
    c.routeBranch,
  );
  const trackBoost = zone?.kind === "boost" && input.throttle > 0;
  const maxSpeed =
    CFG.vehicle.maxSpeed *
    Math.max(boost?.maxSpeed ?? 1, trackBoost ? 1.15 : 1);
  const wasOverspeed = c.speed > maxSpeed;
  if (c.speed <= maxSpeed)
    c.speed +=
      input.throttle *
      CFG.vehicle.acceleration *
      Math.max(boost?.acceleration ?? 1, trackBoost ? 1.55 : 1) *
      dt;
  c.speed *= Math.exp(-(input.throttle === 0 ? 1.25 : 0.22) * dt);
  if (zone?.kind === "sand") c.speed *= Math.exp(-0.7 * dt);
  if (c.speed > maxSpeed)
    c.speed = wasOverspeed
      ? maxSpeed + (c.speed - maxSpeed) * Math.exp(-3 * dt)
      : maxSpeed;
  c.speed = Math.max(-CFG.vehicle.reverseSpeed, c.speed);
  const requestedDrift =
    input.drift && Math.abs(input.steer) > 0.15 && c.speed > 10;
  // Contact checks must see this tick's input before physics can cancel a drift.
  c.drifting = requestedDrift;
  c.heading +=
    input.steer *
    (requestedDrift ? CFG.vehicle.driftTurnRate : CFG.vehicle.turnRate) *
    Math.min(1, Math.abs(c.speed) / 10) *
    Math.sign(c.speed) *
    dt;
  const grip =
    1 -
    Math.exp(
      -(requestedDrift ? CFG.vehicle.driftGrip : CFG.vehicle.grip) *
        (zone?.kind === "ice" ? 0.62 : 1) *
        dt,
    );
  c.vx += (Math.sin(c.heading) * c.speed - c.vx) * grip;
  c.vz += (Math.cos(c.heading) * c.speed - c.vz) * grip;
  const previousX = c.x,
    previousZ = c.z;
  if (track.shortcut.length > 1) {
    const entry = track.shortcut[0],
      exit = track.shortcut.at(-1)!;
    if (
      c.routeBranch === "main" &&
      signedDelta(c.lastT, entry.t) * track.length > -3 &&
      signedDelta(c.lastT, entry.t) < (exit.t - entry.t) / 2 &&
      Math.hypot(c.x - c.lastX, c.z - c.lastZ) <= 2.2
    ) {
      const main = continuousTrack(c.x, c.z, c.lastT, track, "main");
      const branch = continuousTrack(c.x, c.z, c.lastT, track, "shortcut");
      const direction = Math.atan2(c.vx, c.vz);
      if (
        main.distance <= main.roadWidth / 2 + 0.5 &&
        Math.abs(main.y - branch.y) < 2 &&
        c.vx * Math.sin(branch.heading) + c.vz * Math.cos(branch.heading) > 1 &&
        branch.distance < shortcutWidthAt(branch.t, track) / 2 - CAR_RADIUS &&
        ((branch.distance + 0.12 < main.distance &&
          Math.abs(angleDiff(direction, branch.heading)) + 0.015 <
            Math.abs(angleDiff(direction, main.heading))) ||
          (Math.abs(signedDelta(c.lastT, entry.t)) * track.length < 5 &&
            Math.abs(angleDiff(direction, entry.heading)) + 0.15 <
              Math.abs(angleDiff(direction, main.heading))))
      ) {
        c.routeBranch = "shortcut";
        // The overlapping junction has two metre-to-progress mappings. Rebase
        // only on a physically reached entry, before the ordinary travel audit.
        // Mid-route projections and teleports cannot select a different branch.
        c.progress += signedDelta(branch.t, c.lastT);
        c.lastT = branch.t;
        c.progressTravel = 0;
      }
    } else if (
      c.routeBranch === "shortcut" &&
      c.lastT > (entry.t + exit.t) / 2 &&
      Math.hypot(c.x - c.lastX, c.z - c.lastZ) <= 2.2
    ) {
      const main = continuousTrack(c.x, c.z, c.lastT, track, "main");
      const branch = continuousTrack(c.x, c.z, c.lastT, track, "shortcut");
      const direction = Math.atan2(c.vx, c.vz);
      const onMain =
        main.distance <= main.roadWidth / 2 - CAR_RADIUS &&
        Math.abs(main.y - branch.y) < 2;
      const followsMain =
        c.vx * Math.sin(main.heading) + c.vz * Math.cos(main.heading) > 1 &&
        (Math.abs(angleDiff(direction, main.heading)) + 0.015 <
          Math.abs(angleDiff(direction, branch.heading)) ||
          branch.distance > branch.roadWidth / 2 - CAR_RADIUS);
      if (c.lastT >= exit.t - 1e-8 || (onMain && followsMain)) {
        c.routeBranch = "main";
        // Side-by-side exit lines can already project ahead of the branch's
        // endpoint. Anchor progress to this physically reached main-road point
        // now, otherwise the next travel audit can remain stuck at exit.t.
        c.progress += signedDelta(main.t, c.lastT);
        c.lastT = main.t;
        c.progressTravel = 0;
      }
    }
  }
  const before = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch);
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  const driftContact = driftingAtContact(c);
  const impacts = resolveMovingObstacles(
    c,
    track,
    startClock,
    dt,
    previousX,
    previousZ,
  );
  for (const strength of impacts)
    registerCollision(c, strength, "obstacle", driftContact);
  const collision =
    constrainEnvironment(c, track, previousX, previousZ) || impacts.length > 0;
  clearMovingPinch(c, track, startClock + dt);
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
  const efficiency = driftEfficiency(c.speed, c.slipAngle, c.driftDuration);
  const valid =
    requestedDrift &&
    !collision &&
    c.energyLockTime <= 0 &&
    c.impact < CFG.collision.severeImpact &&
    velocity >= CFG.vehicle.maxSpeed * CFG.drift.minSpeedRatio &&
    forward > 1e-6 &&
    efficiency > 0 &&
    c.speed > 0;
  c.drifting = requestedDrift;
  if (c.impact >= CFG.collision.severeImpact) cancelEligibility(c);
  else if (valid) {
    if (c.driftDuration <= 0) {
      c.driftAttempts++;
      c.lastDriftGain = 0;
      const chained = c.miniWindow > 0;
      c.lastDriftKind = chained ? "chain" : "none";
      if (chained) c.miniWindow = 0;
    }
    c.driftState = "drifting";
    c.driftDuration += dt;
    const gain =
      CFG.energy.perSecond *
      dt *
      driftEfficiency(c.speed, c.slipAngle, c.driftDuration) *
      Math.min(1, forward / (CFG.vehicle.maxSpeed * dt));
    const accepted = Math.min(CFG.energy.capacity - c.energy, gain);
    c.energy += accepted;
    c.driftTotal += accepted;
    c.lastDriftGain += accepted;
  } else if (angle <= CFG.drift.recoverAngle) {
    if (c.driftDuration + 1e-9 >= CFG.drift.eligibility) {
      const chained = c.lastDriftKind === "chain";
      c.cleanDrifts++;
      c.miniOpportunities++;
      if (chained) c.driftChains++;
      c.lastDriftKind = chained
        ? "chain"
        : c.driftDuration >= CFG.drift.longDuration
          ? "long"
          : "short";
      c.miniWindow = CFG.mini.window;
    } else if (c.driftDuration > 0) {
      c.lastDriftGain = 0;
      c.lastDriftKind = "none";
    }
    c.driftDuration = 0;
    c.driftState = "grip";
  } else c.driftState = requestedDrift ? "entering" : "recovering";
  // Collect a full gauge by releasing/straightening the drift. Holding a drift
  // at capacity cannot continually manufacture bottles or career charge score.
  if (!requestedDrift && !collision && c.energyLockTime <= 0) {
    convertEnergy(c);
    if (boostPress && previousBoost <= 0 && c.boostTime <= 0) startNitro(c);
  }
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

// Capture before the collision impulse changes velocity/side-slip. Released
// drifts remain vulnerable only until their real lateral slide has recovered.
function driftingAtContact(c: Car) {
  const velocity = Math.hypot(c.vx, c.vz);
  if (c.speed <= 0 || velocity <= 10 || (!c.drifting && c.driftDuration <= 0))
    return false;
  const slip = Math.abs(angleDiff(c.heading, Math.atan2(c.vx, c.vz)));
  return slip > (c.drifting ? CFG.drift.angleMin : CFG.drift.recoverAngle);
}

function registerCollision(
  c: Car,
  strength: number,
  kind: Car["lastCollisionKind"],
  driftContact: boolean,
) {
  c.impact = Math.max(c.impact, strength);
  if (strength < CFG.collision.minImpact) return;
  if (driftContact) {
    c.lastDriftGain = 0;
    c.lastDriftKind = "none";
  }
  cancelEligibility(c);
  if (driftContact)
    c.energyLockTime = Math.max(c.energyLockTime, CFG.collision.chargeLock);
  if (c.collisionCooldown > 0) return;
  c.collisionCooldown = CFG.collision.cooldown;
  c.collisionCount++;
  c.lastCollisionStrength = strength;
  c.lastCollisionKind = kind;
  c.lastEnergyLoss = 0;
  if (!driftContact) return;
  const severity = Math.min(
    1,
    Math.max(
      0,
      (strength - CFG.collision.minImpact) / (1 - CFG.collision.minImpact),
    ),
  );
  const loss =
    CFG.collision.energyLossMin +
    (CFG.collision.energyLossMax - CFG.collision.energyLossMin) * severity;
  c.lastEnergyLoss = Math.min(c.energy, loss);
  c.energy -= c.lastEnergyLoss;
}

function surfaceVelocity(
  c: Car,
  nx: number,
  nz: number,
  kind: Car["lastCollisionKind"],
) {
  const inward = c.vx * nx + c.vz * nz;
  if (inward >= 0) return;
  const driftContact = driftingAtContact(c);
  c.vx -= inward * nx;
  c.vz -= inward * nz;
  registerCollision(c, Math.min(1, -inward / 32), kind, driftContact);
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
    surfaceVelocity(c, nx, nz, "obstacle");
    collision = true;
  }
  const p = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch);
  const limit = Math.max(0, p.roadWidth / 2 - CAR_RADIUS);
  if (p.distance > limit) {
    if (junctionContains(c.x, c.z, c.lastT, track, c.routeBranch, CAR_RADIUS))
      return collision;
    const norm = Math.hypot(c.x - p.x, c.z - p.z) || 1;
    const nx = (c.x - p.x) / norm,
      nz = (c.z - p.z) / norm;
    c.x = p.x + nx * limit;
    c.z = p.z + nz * limit;
    surfaceVelocity(c, -nx, -nz, "wall");
    collision = true;
  }
  return collision;
}

/** A crossing animal can meet a kart already against the curb. Recover along
 * the road after the curb clamp, so neither constraint undoes the other. */
function clearMovingPinch(c: Car, track: Track, clock: number) {
  if (!track.movingObstacles?.length) return;
  for (let pass = 0; pass < 3; pass++) {
    const road = continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch);
    if (!constrainMovingObstacles(c, track, clock, road.heading)) break;
    constrainEnvironment(c, track);
  }
}

export function separateCars(
  cars: Car[],
  track = DEFAULT_TRACK,
  clock = Math.max(0, ...cars.map((c) => c.time)),
) {
  const active = cars.filter(
    (c) => !c.finished && !(c.ghostTime > 0) && !(c.resetTime > 0),
  );
  // The same oriented silhouette is used by solo and the authoritative server.
  // Preserve the existing velocity response and reproject after each correction.
  resolveKartContacts(
    active,
    (c) => {
      constrainMovingObstacles(c, track, clock);
      constrainEnvironment(c, track);
      clearMovingPinch(c, track, clock);
    },
    (a, b, { nx, nz }) => {
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (closing < 0) {
        const driftA = driftingAtContact(a),
          driftB = driftingAtContact(b);
        const impulse = Math.min(24, -closing * 0.52);
        a.vx += nx * impulse;
        a.vz += nz * impulse;
        b.vx -= nx * impulse;
        b.vz -= nz * impulse;
        syncSpeed(a);
        syncSpeed(b);
        const impact = Math.min(1, -closing / 32);
        registerCollision(a, impact, "kart", driftA);
        registerCollision(b, impact, "kart", driftB);
      }
    },
    (c) => continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch).heading,
  );
}
