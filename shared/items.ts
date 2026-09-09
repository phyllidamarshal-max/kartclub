import type { Car, Input } from "./race.ts";
import {
  DEFAULT_TRACK,
  continuousTrack,
  trackPoint,
  trackWidth,
  type Track,
} from "./track.ts";
import { chooseItem, itemRaceGap } from "./item-strategy.ts";
import { recordVfx, pruneVfx, type VfxJournal } from "./vfx-events.ts";
export type Item = "boost" | "shield" | "missile" | "trap";
const HIT_EFFECT = Object.freeze({
  slow: 1.5,
  recoveryProtection: 1,
  shieldProtection: 0.35,
  minimumSpeed: 12,
  speedFactor: 0.45,
});
export const ITEM_NAMES: Record<Item, string> = {
  boost: "极速推进",
  shield: "能量护盾",
  missile: "追踪飞弹",
  trap: "电磁陷阱",
};
export const ITEM_ICONS: Record<Item, string> = {
  boost: "»",
  shield: "◇",
  missile: "⌖",
  trap: "△",
};
export interface ItemState {
  lastProgress: number | null;
  pickedLaps: number[];
  held: Item | null;
  shield: number;
  slow: number;
  hitProtection: number;
  pressed: boolean;
  uses: number;
  hits: number;
  usefulHits: number;
  blocks: number;
  notice: string;
  noticeTime: number;
}
export interface ItemWorld {
  vfx?: VfxJournal;
  time: number;
  seed: number;
  players: Record<string, ItemState>;
  boxes: { x: number; z: number; y: number; band: number; readyAt: number }[];
  traps: { x: number; z: number; y?: number; owner: string; ttl: number; visualId?: number }[];
  missiles: {
    visualId?: number;
    x: number;
    z: number;
    owner: string;
    target: string;
    ttl: number;
  }[];
}
const MISSILE_SPEED = 65;
const MISSILE_RADIUS = 4;

/** Impact estimate for the current target pose, using the same swept radius and
 * lifetime as stepItems. It is recomputed as the driver moves and changes line. */
export function missileImpactTime(
  missile: { x: number; z: number; ttl: number },
  car: Pick<Car, "x" | "z">,
): number | null {
  if (missile.ttl <= 0) return null;
  const arrival = Math.max(
    0,
    (Math.hypot(missile.x - car.x, missile.z - car.z) - MISSILE_RADIUS) /
      MISSILE_SPEED,
  );
  return arrival < missile.ttl ? arrival : null;
}
export function selectMissileTarget(
  car: Readonly<Car>,
  cars: readonly Car[],
  track: Track,
): Car | undefined {
  if (car.finished || car.resetTime > 0 || car.ghostTime > 0) return undefined;
  const height = (c: Readonly<Car>) =>
    continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch).y;
  const y = height(car);
  return cars
    .filter(
      (rival) =>
        rival.id !== car.id &&
        !rival.finished &&
        rival.resetTime <= 0 &&
        rival.ghostTime <= 0 &&
        itemRaceGap(car, rival, track) > 0 &&
        itemRaceGap(car, rival, track) < 160 &&
        Math.hypot(rival.x - car.x, rival.z - car.z) < 160 &&
        Math.abs(height(rival) - y) < 5,
    )
    .sort(
      (a, b) =>
        a.progress - b.progress || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )[0];
}
export function createItems(
  ids: string[],
  track: Track = DEFAULT_TRACK,
  seed = 537,
): ItemWorld {
  const players: Record<string, ItemState> = {};
  for (const id of ids)
    players[id] = {
      lastProgress: null,
      pickedLaps: Array(8).fill(-1),
      held: null,
      shield: 0,
      slow: 0,
      hitProtection: 0,
      pressed: false,
      uses: 0,
      hits: 0,
      usefulHits: 0,
      blocks: 0,
      notice: "",
      noticeTime: 0,
    };
  const boxes = [];
  for (let i = 0; i < 8; i++)
    for (const lane of [-1, 0, 1]) {
      const p = trackPoint(0.06 + i * 0.12, track);
      const side = lane * Math.min(4, trackWidth(p.t, track) / 2 - 1.6);
      boxes.push({
        x: p.x + Math.cos(p.heading) * side,
        z: p.z - Math.sin(p.heading) * side,
        readyAt: 0,
        y: p.y,
        band: i,
      });
    }
  return { time: 0, seed: seed >>> 0, players, boxes, traps: [], missiles: [] };
}
export function stepItems(
  w: ItemWorld,
  cars: Car[],
  inputs: Record<string, Input>,
  dt: number,
  track: Track,
) {
  w.time += dt;
  pruneVfx(w);
  // Advance defensive timers to each chronological impact, then to frame end.
  // Decrementing a whole frame up front would erase a shield that was still
  // active when an early swept missile actually arrived.
  const advanced = new Map<string, number>();
  const advance = (id: string, time: number) => {
    const p = w.players[id];
    if (!p) return;
    const elapsed = time - (advanced.get(id) ?? 0);
    p.shield = Math.max(0, p.shield - elapsed);
    p.slow = Math.max(0, p.slow - elapsed);
    p.hitProtection = Math.max(0, p.hitProtection - elapsed);
    advanced.set(id, time);
  };
  const notice = (p: ItemState, s: string) => {
    p.notice = s;
    p.noticeTime = 2;
  };
  const hit = (c: Car, owner: string, item: 'missile'|'trap', x:number, y:number, z:number, time:number) => {
    const p = w.players[c.id];
    if (
      !p ||
      c.finished ||
      c.resetTime > 0 ||
      c.ghostTime > 0 ||
      p.hitProtection > 0
    )
      return;
    if (p.shield > 0) {
      p.shield = 0;
      p.hitProtection = HIT_EFFECT.shieldProtection;
      if (owner !== c.id) p.blocks++;
      notice(p, "护盾抵挡了攻击");
      recordVfx(w,{kind:'block',item,actor:owner,target:c.id,x,y,z},time);
      return;
    }
    p.slow = HIT_EFFECT.slow;
    p.hitProtection = HIT_EFFECT.slow + HIT_EFFECT.recoveryProtection;
    const speed = Math.max(Math.abs(c.speed), Math.hypot(c.vx, c.vz));
    // Apply one bounded impulse. The floor never speeds up a slower car.
    const factor = Math.max(
      HIT_EFFECT.speedFactor,
      Math.min(1, HIT_EFFECT.minimumSpeed / (speed || 1)),
    );
    c.speed *= factor;
    c.vx *= factor;
    c.vz *= factor;
    c.impact = 1;
    notice(p, "受到攻击 · 正在恢复");
    recordVfx(w,{kind:'hit',item,actor:owner,target:c.id,x,y,z},time);
    if (owner !== c.id && w.players[owner]) {
      w.players[owner].hits++;
      w.players[owner].usefulHits++;
    }
  };
  for (const c of cars) {
    const p = w.players[c.id];
    if (!p) continue;
    p.noticeTime = Math.max(0, p.noticeTime - dt);
    if (p.slow > dt && c.speed > 20) {
      const factor = 20 / c.speed;
      c.vx *= factor;
      c.vz *= factor;
      c.speed = 20;
    }
    const pressed = inputs[c.id]?.item === true;
    const forward =
      p.lastProgress !== null &&
      c.progress > p.lastProgress &&
      c.progress - p.lastProgress < 0.01 &&
      c.speed > 0;
    p.lastProgress = c.progress;
    if (c.finished || c.resetTime > 0 || c.ghostTime > 0) {
      p.pressed = pressed;
      continue;
    }
    if (pressed && !p.pressed && p.held) {
      const item = p.held;
      p.held = null;
      p.uses++;
      notice(p, ITEM_NAMES[item] + " 已使用");
      recordVfx(w,{kind:'use',item,actor:c.id,x:c.x,y:continuousTrack(c.x,c.z,c.lastT,track,c.routeBranch).y,z:c.z});
      if (item === "boost") c.boostTime = Math.max(c.boostTime, 2.3);
      if (item === "shield") p.shield = 5;
      if (item === "trap" && w.traps.length < 16) {
        const x = c.x - Math.sin(c.heading) * 4,
          z = c.z - Math.cos(c.heading) * 4;
        w.traps.push({
          visualId: recordVfx(w,{kind:'deploy',item:'trap',actor:c.id,x,y:continuousTrack(x,z,c.lastT,track,c.routeBranch).y,z}),
          x,
          z,
          y: continuousTrack(x, z, c.lastT, track, c.routeBranch).y,
          owner: c.id,
          ttl: 15,
        });
      }
      if (item === "missile") {
        const target = selectMissileTarget(c, cars, track);
        if (target)
          w.missiles.push({
            visualId: recordVfx(w,{kind:'launch',item:'missile',actor:c.id,target:target.id,x:c.x,y:continuousTrack(c.x,c.z,c.lastT,track,c.routeBranch).y,z:c.z}),
            x: c.x,
            z: c.z,
            owner: c.id,
            target: target.id,
            ttl: 4,
          });
        else notice(p, "前方无锁定目标");
      }
    }
    p.pressed = pressed;
    if (!p.held && forward && c.ghostTime <= 0)
      for (const b of w.boxes)
        if (
          p.pickedLaps[b.band] < Math.floor(c.progress) &&
          b.readyAt <= w.time &&
          Math.abs(
            c.progress - Math.floor(c.progress) - (0.06 + b.band * 0.12),
          ) *
            track.length <
            5 &&
          Math.abs(
            continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch).y - b.y,
          ) < 3 &&
          Math.hypot(c.x - b.x, c.z - b.z) < 2.5
        ) {
          p.pickedLaps[b.band] = Math.floor(c.progress);
          const choice = chooseItem(w.seed, c, cars, track);
          w.seed = choice.seed;
          p.held = choice.item;
          b.readyAt = w.time + 3;
          notice(p, "获得 " + ITEM_NAMES[p.held]);
          recordVfx(w,{kind:'pickup',item:p.held,actor:c.id,x:b.x,y:b.y,z:b.z});
          break;
        }
  }
  const impacts: { time: number; victim: Car; owner: string; item:'missile'|'trap';x:number;y:number;z:number }[] = [];
  for (const m of w.missiles) {
    const life = m.ttl;
    if (life <= 0) continue;
    const target = cars.find(
      (c) =>
        c.id === m.target &&
        !c.finished &&
        c.resetTime <= 0 &&
        c.ghostTime <= 0,
    );
    if (!target) {
      m.ttl = 0;
      continue;
    }
    const dx = target.x - m.x,
      dz = target.z - m.z,
      d = Math.hypot(dx, dz);
    const arrival = missileImpactTime(m, target);
    if (arrival !== null && arrival <= dt) {
      impacts.push({ time: arrival, victim: target, owner: m.owner, item:'missile', x:target.x,y:continuousTrack(target.x,target.z,target.lastT,track,target.routeBranch).y,z:target.z });
      m.ttl = 0;
    } else {
      const travel = MISSILE_SPEED * Math.min(dt, life);
      if (d > 0) {
        m.x += (dx / d) * travel;
        m.z += (dz / d) * travel;
      }
      m.ttl = life - dt;
    }
  }
  w.missiles = w.missiles.filter((m) => m.ttl > 0);
  for (const t of w.traps) {
    const life = t.ttl;
    t.ttl -= dt;
    const armedAt = Math.max(0, life - 14.3);
    if (life <= 0 || armedAt > dt || armedAt >= life) continue;
    const victim = cars.find(
      (c) =>
        !c.finished &&
        c.resetTime <= 0 &&
        c.ghostTime <= 0 &&
        Math.hypot(c.x - t.x, c.z - t.z) < 2.5 &&
        (t.y === undefined ||
          Math.abs(
            continuousTrack(c.x, c.z, c.lastT, track, c.routeBranch).y - t.y,
          ) < 3),
    );
    if (victim) {
      impacts.push({ time: armedAt, victim, owner: t.owner, item:'trap',x:t.x,y:t.y??continuousTrack(victim.x,victim.z,victim.lastT,track,victim.routeBranch).y,z:t.z });
      t.ttl = 0;
    }
  }
  w.traps = w.traps.filter((t) => t.ttl > 0);
  impacts.sort((a, b) => a.time - b.time);
  for (const impact of impacts) {
    advance(impact.victim.id, impact.time);
    hit(impact.victim, impact.owner, impact.item, impact.x,impact.y,impact.z,w.time-dt+impact.time);
  }
  for (const c of cars) advance(c.id, dt);
}

/** Seconds until the earliest missile impact worth warning about. */
export function incomingThreat(
  world: ItemWorld,
  car: Readonly<Car>,
): number | null {
  if (
    car.finished ||
    car.resetTime > 0 ||
    car.ghostTime > 0 ||
    !world.players[car.id]
  )
    return null;
  const arrivals: number[] = [];
  for (const missile of world.missiles) {
    if (missile.target !== car.id || missile.ttl <= 0) continue;
    const arrival = missileImpactTime(missile, car);
    if (arrival !== null && arrival <= 2.25) arrivals.push(arrival);
  }
  const state = world.players[car.id];
  let shieldUntil = state.shield,
    protectedUntil = state.hitProtection;
  for (const arrival of arrivals.sort((a, b) => a - b)) {
    if (protectedUntil > arrival) continue;
    if (shieldUntil > arrival) {
      shieldUntil = 0;
      protectedUntil = arrival + HIT_EFFECT.shieldProtection;
      continue;
    }
    return arrival;
  }
  return null;
}
