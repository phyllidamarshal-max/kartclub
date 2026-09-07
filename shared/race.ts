import { trackPoint, nearestTrack, ROAD_WIDTH, angleDiff } from "./track.ts";
export interface Input {
  throttle: number;
  steer: number;
  drift: boolean;
  boost: boolean;
  reset: boolean;
}
export const EMPTY_INPUT: Input = {
  throttle: 0,
  steer: 0,
  drift: false,
  boost: false,
  reset: false,
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
  finished: boolean;
  time: number;
  ack: number;
}
export function spawnCar(slot = 0, id = "local"): Car {
  const p = trackPoint(0),
    side = slot % 2 === 0 ? -2.4 : 2.4,
    back = Math.floor(slot / 2) * 5;
  return {
    id,
    slot,
    x: p.x + Math.cos(p.heading) * side - Math.sin(p.heading) * back,
    z: p.z - Math.sin(p.heading) * side - Math.cos(p.heading) * back,
    heading: p.heading,
    vx: 0,
    vz: 0,
    speed: 0,
    energy: 0,
    boostTime: 0,
    drifting: false,
    driftTotal: 0,
    progress: 0,
    lap: 0,
    lastT: 0,
    checkpoint: 0,
    boostHeld: false,
    resetHeld: false,
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
  };
}
export function advanceProgress(c: Car, t: number) {
  let d = t - c.lastT;
  if (d < -0.5) d++;
  if (d > 0.5) d--;
  if (Math.abs(d) > 0.04) return;
  c.lastT = t;
  c.progress = Math.max(0, c.progress + d);
  c.lap = Math.floor(c.progress + 1e-6);
  const cp = Math.floor(c.progress * 12);
  if (cp > c.checkpoint) c.checkpoint = cp;
}
export function stepCar(c: Car, raw: Input, dt: number) {
  if (c.finished) return;
  const input = sanitizeInput(raw);
  dt = Math.max(0, Math.min(dt, 1 / 30));
  c.time += dt;
  if (input.reset && !c.resetHeld) {
    const p = trackPoint(c.checkpoint / 12);
    c.x = p.x;
    c.z = p.z;
    c.heading = p.heading;
    c.speed = 0;
    c.vx = 0;
    c.vz = 0;
    c.lastT = p.t;
    c.progress = c.checkpoint / 12;
    c.boostTime = 0;
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
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  const p = nearestTrack(c.x, c.z);
  let collision = false;
  if (p.distance > ROAD_WIDTH / 2 - 1) {
    const norm = Math.hypot(c.x - p.x, c.z - p.z) || 1;
    c.x = p.x + ((c.x - p.x) / norm) * (ROAD_WIDTH / 2 - 1);
    c.z = p.z + ((c.z - p.z) / norm) * (ROAD_WIDTH / 2 - 1);
    c.speed *= Math.exp(-3.6 * dt);
    c.vx *= 0.8;
    c.vz *= 0.8;
    collision = true;
  }
  if (c.drifting && !collision) {
    const amount = Math.min(24, c.speed * 0.62) * dt;
    c.energy = Math.min(200, c.energy + amount);
    c.driftTotal += amount;
    c.speed *= Math.exp(-0.13 * dt);
  }
  if (Math.abs(angleDiff(c.heading, p.heading)) < Math.PI * 0.7)
    advanceProgress(c, p.t);
}
export function separateCars(cars: Car[]) {
  for (let i = 0; i < cars.length; i++)
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i],
        b = cars[j],
        dx = a.x - b.x,
        dz = a.z - b.z,
        d = Math.hypot(dx, dz);
      if (d > 0 && d < 2.1 && !a.finished && !b.finished) {
        const push = (2.1 - d) * 0.5;
        a.x += (dx / d) * push;
        a.z += (dz / d) * push;
        b.x -= (dx / d) * push;
        b.z -= (dz / d) * push;
        a.speed *= 0.99;
        b.speed *= 0.99;
      }
    }
}
