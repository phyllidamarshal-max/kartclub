import type { Car } from "../../shared/race.ts";
import {
  incomingThreat,
  missileImpactTime,
  type Item,
  type ItemWorld,
} from "../../shared/items.ts";
import { ItemVfxReader } from "./events.ts";

export interface HudVfxFrame {
  raceId: string;
  active: boolean;
  paused: boolean;
  car: Car;
  confirmed: Car | null;
  items: ItemWorld | null;
  countdown: number;
  releaseRemaining: number;
  totalLaps: number;
  trainingStep: number | null;
  gate: number | null;
  completedCorners: number;
  failed: boolean;
  pbSerial: number;
  sectorSerial: number;
  motion: number;
  quality: "high" | "low";
}

export interface HudVfxCues {
  primary: HudPrimaryCue | null;
  countdownTick: boolean;
  start: boolean;
  release: boolean;
  speed: number;
  miniWindow: number;
  miniSuccess: boolean;
  fullCharge: boolean;
  chargeFilled: boolean;
  inventoryFull: boolean;
  nitro: { used: number; collected: number; chained: boolean };
  nitroUsedSlot: number | null;
  nitroLandedSlot: number | null;
  energyLoss: number;
  collision: {
    kind: Car["lastCollisionKind"];
    strength: number;
    severity: "light" | "medium" | "heavy";
    loss: number;
  } | null;
  shieldOpened: boolean;
  shieldActive: boolean;
  itemUsed: Item | null;
  itemPicked: Item | null;
  hitDelta: number;
  receivedHit: boolean;
  blockDelta: number;
  threatTime: number | null;
  threatAngle: number | null;
  trainingDelta: number;
  gateDelta: number;
  cornerDelta: number;
  lapDelta: number;
  finalLap: boolean;
  pb: boolean;
  sector: boolean;
  failed: boolean;
}

export type HudPrimaryCue =
  | "impact-light"
  | "impact-medium"
  | "impact-heavy"
  | "received-hit"
  | "block"
  | "hit"
  | "shield-open"
  | "nitro-use"
  | "nitro-collect"
  | "item-use"
  | "mini-success"
  | "objective"
  | "lap"
  | "final-lap"
  | "start";

const primaryPriority = (cue: HudPrimaryCue | null): number => {
  if (!cue) return 0;
  if (cue.startsWith("impact-")) return 100;
  const priorities: Partial<Record<HudPrimaryCue, number>> = {
    "received-hit": 99,
    block: 98,
    hit: 94,
    "shield-open": 82,
    "nitro-use": 70,
    "item-use": 66,
    "mini-success": 62,
    "nitro-collect": 55,
    "final-lap": 43,
    lap: 42,
    objective: 35,
    start: 20,
  };
  return priorities[cue] ?? 0;
};

interface Counters {
  nitroUses: number;
  nitroTotal: number;
  collisions: number;
  miniUses: number;
  itemUses: number;
  itemTotal: number;
  hits: number;
  blocks: number;
  lap: number;
  training: number;
  gate: number;
  corners: number;
  pb: number;
  sector: number;
}

const zeroCounters = (): Counters => ({
  nitroUses: 0,
  nitroTotal: 0,
  collisions: 0,
  miniUses: 0,
  itemUses: 0,
  itemTotal: 0,
  hits: 0,
  blocks: 0,
  lap: 0,
  training: 0,
  gate: 0,
  corners: 0,
  pb: 0,
  sector: 0,
});

function emptyCues(frame: HudVfxFrame): HudVfxCues {
  return {
    primary: null,
    countdownTick: false,
    start: false,
    release: false,
    speed: Math.min(1, Math.max(0, Math.abs(frame.car.speed) / 55)),
    miniWindow: Math.max(0, frame.car.miniWindow),
    miniSuccess: false,
    fullCharge: frame.car.energy >= 100,
    chargeFilled: false,
    inventoryFull: frame.car.storedNitro >= 2,
    nitro: { used: 0, collected: 0, chained: false },
    nitroUsedSlot: null,
    nitroLandedSlot: null,
    energyLoss: 0,
    collision: null,
    shieldOpened: false,
    shieldActive: false,
    itemUsed: null,
    itemPicked: null,
    hitDelta: 0,
    receivedHit: false,
    blockDelta: 0,
    threatTime: null,
    threatAngle: null,
    trainingDelta: 0,
    gateDelta: 0,
    cornerDelta: 0,
    lapDelta: 0,
    finalLap: frame.totalLaps > 0 && frame.car.lap + 1 >= frame.totalLaps,
    pb: false,
    sector: false,
    failed: false,
  };
}

function threat(frame: HudVfxFrame): { time: number; angle: number } | null {
  if (!frame.items || !frame.active) return null;
  const time = incomingThreat(frame.items, frame.car);
  if (time === null) return null;
  let selected: ItemWorld["missiles"][number] | null = null;
  let error = Infinity;
  for (const missile of frame.items.missiles) {
    if (missile.target !== frame.car.id || missile.ttl <= 0) continue;
    const arrival = missileImpactTime(missile, frame.car);
    if (arrival === null) continue;
    const difference = Math.abs(arrival - time);
    if (difference < error) {
      error = difference;
      selected = missile;
    }
  }
  if (!selected || error > 1e-7) return null;
  const dx = selected.x - frame.car.x;
  const dz = selected.z - frame.car.z;
  const side =
    dx * Math.cos(frame.car.heading) - dz * Math.sin(frame.car.heading);
  const forward =
    dx * Math.sin(frame.car.heading) + dz * Math.cos(frame.car.heading);
  return { time, angle: (Math.atan2(side, forward) * 180) / Math.PI };
}

/** Converts confirmed cumulative game state into one-shot HUD cues. */
export class HudVfxState {
  private readonly itemEvents = new ItemVfxReader();
  private raceId: string | null = null;
  private initialized = false;
  private itemInitialized = false;
  private high = zeroCounters();
  private countdown = 0;
  private releaseRemaining = 0;
  private boostTime = 0;
  private storedNitro = 0;
  private activePrimary: HudPrimaryCue | null = null;
  private primaryRemaining = 0;
  private fullCharge = false;
  private held: Item | null = null;
  private shield = 0;
  private failed = false;

  update(frame: HudVfxFrame, dt: number): HudVfxCues {
    const cues = emptyCues(frame);
    const warning = threat(frame);
    if (warning) {
      cues.threatTime = warning.time;
      cues.threatAngle = warning.angle;
    }

    if (this.raceId !== frame.raceId) {
      this.reset();
      this.raceId = frame.raceId;
    }
    if (!frame.confirmed) {
      this.itemEvents.read(frame.items, false);
      return cues;
    }

    const car = frame.confirmed;
    const item = frame.items?.players[car.id];
    const current: Counters = {
      nitroUses: car.nitroUses,
      nitroTotal: car.nitroUses + car.storedNitro,
      collisions: car.collisionCount,
      miniUses: car.miniUses,
      itemUses: item?.uses ?? 0,
      itemTotal: (item?.uses ?? 0) + (item?.held ? 1 : 0),
      hits: item?.usefulHits ?? 0,
      blocks: item?.blocks ?? 0,
      lap: car.lap,
      training: frame.trainingStep ?? 0,
      gate: frame.gate ?? 0,
      corners: frame.completedCorners,
      pb: frame.pbSerial,
      sector: frame.sectorSerial,
    };
    const canEmit =
      this.initialized && frame.active && !frame.paused && dt > 0 && dt <= 0.25;
    const itemCanEmit = canEmit && this.itemInitialized && Boolean(item);
    if (
      !frame.active ||
      frame.motion <= 0 ||
      (!frame.paused && (!(dt > 0) || dt > 0.25))
    ) {
      this.activePrimary = null;
      this.primaryRemaining = 0;
    }
    const itemEvents = this.itemEvents.read(frame.items, canEmit);
    const delta = (key: keyof Counters) => {
      const amount = Math.max(0, current[key] - this.high[key]);
      this.high[key] = Math.max(this.high[key], current[key]);
      return amount;
    };

    const nitroUses = delta("nitroUses");
    const nitroCollected = delta("nitroTotal");
    const collisions = delta("collisions");
    const miniUses = delta("miniUses");
    const itemUses = delta("itemUses");
    const itemCollected = delta("itemTotal");
    const hits = delta("hits");
    const blocks = delta("blocks");
    const laps = delta("lap");
    const training = delta("training");
    const gates = delta("gate");
    const corners = delta("corners");
    const pb = delta("pb");
    const sector = delta("sector");

    if (canEmit) {
      cues.nitro.used = nitroUses;
      cues.nitro.collected = nitroCollected;
      cues.nitro.chained = nitroUses > 0 && this.boostTime > 0;
      if (
        nitroUses === 1 &&
        nitroCollected === 0 &&
        this.storedNitro > car.storedNitro
      )
        cues.nitroUsedSlot = Math.max(0, this.storedNitro - 1);
      if (
        nitroCollected === 1 &&
        nitroUses === 0 &&
        car.storedNitro > this.storedNitro
      )
        cues.nitroLandedSlot = Math.max(0, car.storedNitro - 1);
      cues.energyLoss = collisions > 0 ? Math.max(0, car.lastEnergyLoss) : 0;
      cues.miniSuccess = miniUses > 0;
      if (collisions > 0) {
        const strength = Math.max(0, car.lastCollisionStrength);
        const severity =
          strength >= 7 ? "heavy" : strength >= 3 ? "medium" : "light";
        cues.collision = {
          kind: car.lastCollisionKind,
          strength,
          severity,
          loss: cues.energyLoss,
        };
      }
      cues.trainingDelta = training;
      cues.gateDelta = gates;
      cues.cornerDelta = corners;
      cues.lapDelta = laps;
      cues.pb = pb > 0;
      cues.sector = sector > 0;
      cues.failed = frame.failed && !this.failed;
      cues.chargeFilled = car.energy >= 100 && !this.fullCharge;
      const previousCount = Math.ceil(this.countdown);
      const nextCount = Math.ceil(frame.countdown);
      cues.countdownTick = nextCount > 0 && nextCount !== previousCount;
      cues.release = this.releaseRemaining > 0 && frame.releaseRemaining <= 0;
      cues.start =
        cues.release ||
        (this.countdown > 0 &&
          frame.countdown <= 0 &&
          this.releaseRemaining <= 0 &&
          frame.releaseRemaining <= 0);
    }
    if (itemCanEmit) {
      cues.itemUsed = itemUses > 0 ? this.held : null;
      cues.itemPicked = itemCollected > 0 ? (item?.held ?? null) : null;
      cues.hitDelta = hits;
      cues.blockDelta = blocks;
      cues.shieldOpened = (item?.shield ?? 0) > 0 && this.shield <= 0;
    }
    cues.receivedHit = itemEvents.some(
      (event) =>
        event.kind === "hit" &&
        event.target === car.id &&
        event.actor !== car.id,
    );
    if (
      itemEvents.some(
        (event) => event.kind === "block" && event.target === car.id,
      )
    )
      cues.blockDelta = Math.max(1, cues.blockDelta);

    cues.shieldActive = (item?.shield ?? 0) > 0;

    if (canEmit && frame.motion > 0) {
      const candidates: Array<[number, HudPrimaryCue | null]> = [
        [100, cues.collision ? `impact-${cues.collision.severity}` : null],
        [99, cues.receivedHit ? "received-hit" : null],
        [98, cues.blockDelta ? "block" : null],
        [94, cues.hitDelta ? "hit" : null],
        [82, cues.shieldOpened ? "shield-open" : null],
        [70, cues.nitro.used ? "nitro-use" : null],
        [66, cues.itemUsed ? "item-use" : null],
        [62, cues.miniSuccess ? "mini-success" : null],
        [55, cues.nitro.collected ? "nitro-collect" : null],
        [
          42,
          cues.finalLap && cues.lapDelta
            ? "final-lap"
            : cues.lapDelta
              ? "lap"
              : null,
        ],
        [
          35,
          cues.trainingDelta ||
          cues.gateDelta ||
          cues.cornerDelta ||
          cues.pb ||
          cues.sector
            ? "objective"
            : null,
        ],
        [20, cues.start ? "start" : null],
      ];
      const candidate =
        candidates.find((entry) => entry[1] !== null)?.[1] ?? null;
      this.primaryRemaining = Math.max(0, this.primaryRemaining - dt);
      if (!this.primaryRemaining) this.activePrimary = null;
      if (
        candidate &&
        cues.threatTime !== null &&
        primaryPriority(candidate) < 90
      ) {
        cues.primary = null;
      } else if (
        candidate &&
        this.activePrimary &&
        primaryPriority(candidate) <= primaryPriority(this.activePrimary)
      ) {
        cues.primary = null;
      } else if (candidate) {
        cues.primary = candidate;
        this.activePrimary = candidate;
        this.primaryRemaining = candidate.startsWith("impact-") ? 0.25 : 0.42;
      }
    }

    this.initialized = true;
    this.itemInitialized = Boolean(item);
    this.countdown = frame.countdown;
    this.releaseRemaining = frame.releaseRemaining;
    this.boostTime = car.boostTime;
    this.storedNitro = car.storedNitro;
    this.fullCharge = car.energy >= 100;
    this.held = item?.held ?? null;
    this.shield = item?.shield ?? 0;
    this.failed = frame.failed;
    return cues;
  }

  reset(): void {
    this.raceId = null;
    this.initialized = false;
    this.itemInitialized = false;
    this.high = zeroCounters();
    this.countdown = 0;
    this.releaseRemaining = 0;
    this.boostTime = 0;
    this.storedNitro = 0;
    this.activePrimary = null;
    this.primaryRemaining = 0;
    this.fullCharge = false;
    this.held = null;
    this.shield = 0;
    this.failed = false;
    this.itemEvents.reset();
  }
}

export type ResultCue = "finish" | "failure" | "stars" | "pb";

/** Small LRU used by result views which can be remounted during one race. */
export class BoundedResultGate {
  private readonly entries = new Map<string, Set<ResultCue>>();
  constructor(private readonly limit = 64) {}

  take(raceId: string, cue: ResultCue): boolean {
    const seen = this.entries.get(raceId) ?? new Set<ResultCue>();
    const fresh = !seen.has(cue);
    seen.add(cue);
    this.entries.delete(raceId);
    this.entries.set(raceId, seen);
    while (this.entries.size > Math.max(1, this.limit)) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return fresh;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
