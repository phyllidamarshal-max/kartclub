import type { Car } from "../../shared/race.ts";
import { driftEfficiency } from "../../shared/driving-skills.ts";
import { DRIVING_CONFIG as CFG } from "../../shared/driving-config.ts";

export function driftSparkColor(car: Car): number | null {
  if (
    car.driftState !== "drifting" ||
    car.energyLockTime > 0 ||
    car.energy >= CFG.energy.capacity ||
    car.driftDuration < CFG.drift.eligibility ||
    driftEfficiency(car.speed, car.slipAngle, car.driftDuration) <= 0
  )
    return null;
  return car.driftDuration >= CFG.drift.longDuration ? 0xffc862 : 0x72deff;
}

/** Fractional emissions survive ordinary frames, never a suspended tab. */
export class EmissionClock {
  private remainder = 0;
  take(rate: number, dt: number) {
    if (!(dt > 0)) return 0;
    if (dt > 0.25) {
      this.clear();
      return 0;
    }
    this.remainder += rate * dt;
    const count = Math.floor(this.remainder + 1e-9);
    this.remainder = Math.max(0, this.remainder - count);
    return count;
  }
  clear() {
    this.remainder = 0;
  }
}

export function kartAnchor(
  car: Pick<Car, "x" | "z" | "heading">,
  side: number,
  rear: number,
) {
  return {
    x: car.x + Math.cos(car.heading) * side + Math.sin(car.heading) * rear,
    z: car.z - Math.sin(car.heading) * side + Math.cos(car.heading) * rear,
  };
}

/** Call with confirmed snapshots online, never with predicted counters. */
export class DrivingCues {
  private counts = new Map<string, [number, number]>();
  take(car: Pick<Car, "id" | "nitroUses" | "miniUses">, active: boolean) {
    const prior = this.counts.get(car.id);
    const nitro = car.nitroUses,
      mini = car.miniUses;
    if (!prior) {
      this.counts.set(car.id, [nitro, mini]);
      return 0;
    }
    const cue = (nitro > prior[0] ? 1 : 0) | (mini > prior[1] ? 2 : 0);
    prior[0] = Math.max(prior[0], nitro);
    prior[1] = Math.max(prior[1], mini);
    return active ? cue : 0;
  }
  prune(ids: ReadonlySet<string>) {
    for (const id of this.counts.keys())
      if (!ids.has(id)) this.counts.delete(id);
  }
  clear() {
    this.counts.clear();
  }
}

/** Fixed storage; a full pool drops decorative particles instead of allocating. */
export class ParticlePool {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  readonly angle: Float32Array;
  readonly color: Uint32Array;
  count = 0;
  private cursor = 0;
  limit: number;
  constructor(readonly capacity: number) {
    this.limit = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.angle = new Float32Array(capacity);
    this.color = new Uint32Array(capacity);
  }
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    color: number,
    angle = 0,
    replaceOldest = false,
  ) {
    if (this.count >= this.limit && !replaceOldest) return false;
    for (let n = 0; n < this.limit; n++) {
      const i = this.cursor++ % this.limit;
      if (this.life[i] > 0 && !replaceOldest) continue;
      const replacing = this.life[i] > 0;
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      this.life[i] = life;
      this.age[i] = 0;
      this.size[i] = size;
      this.color[i] = color;
      this.angle[i] = angle;
      if (!replacing) this.count++;
      return true;
    }
    return false;
  }
  tick(dt: number) {
    this.count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (i >= this.limit) this.life[i] = 0;
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        continue;
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      this.count++;
    }
  }
  clear() {
    this.life.fill(0);
    this.count = 0;
    this.cursor = 0;
  }
}
