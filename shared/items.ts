import type { Car, Input } from "./race.ts";
import { DEFAULT_TRACK, trackPoint, type Track } from "./track.ts";
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
  notice: string;
  noticeTime: number;
}
export interface ItemWorld {
  time: number;
  seed: number;
  players: Record<string, ItemState>;
  boxes: { x: number; z: number; y: number; band: number; readyAt: number }[];
  traps: { x: number; z: number; owner: string; ttl: number }[];
  missiles: {
    x: number;
    z: number;
    owner: string;
    target: string;
    ttl: number;
  }[];
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
      notice: "",
      noticeTime: 0,
    };
  const boxes = [];
  for (let i = 0; i < 8; i++)
    for (const side of [-4, 0, 4]) {
      const p = trackPoint(0.06 + i * 0.12, track);
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
  const notice = (p: ItemState, s: string) => {
    p.notice = s;
    p.noticeTime = 2;
  };
  const hit = (c: Car, owner: string) => {
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
      notice(p, "护盾抵挡了攻击");
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
    if (w.players[owner]) w.players[owner].hits++;
  };
  for (const c of cars) {
    const p = w.players[c.id];
    if (!p) continue;
    p.shield = Math.max(0, p.shield - dt);
    p.slow = Math.max(0, p.slow - dt);
    p.hitProtection = Math.max(0, p.hitProtection - dt);
    p.noticeTime = Math.max(0, p.noticeTime - dt);
    if (p.slow > 0 && c.speed > 20) {
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
    if (c.finished || c.resetTime > 0) {
      p.pressed = pressed;
      continue;
    }
    if (pressed && !p.pressed && p.held) {
      const item = p.held;
      p.held = null;
      p.uses++;
      notice(p, ITEM_NAMES[item] + " 已使用");
      if (item === "boost") c.boostTime = Math.max(c.boostTime, 2.3);
      if (item === "shield") p.shield = 5;
      if (item === "trap" && w.traps.length < 16)
        w.traps.push({
          x: c.x - Math.sin(c.heading) * 4,
          z: c.z - Math.cos(c.heading) * 4,
          owner: c.id,
          ttl: 15,
        });
      if (item === "missile") {
        const target = cars
          .filter(
            (o) =>
              o.id !== c.id &&
              !o.finished &&
              o.resetTime <= 0 &&
              o.ghostTime <= 0 &&
              o.progress > c.progress &&
              Math.abs(
                trackPoint(o.lastT, track).y - trackPoint(c.lastT, track).y,
              ) < 5 &&
              Math.hypot(o.x - c.x, o.z - c.z) < 160,
          )
          .sort((a, b) => a.progress - b.progress)[0];
        if (target)
          w.missiles.push({
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
          Math.abs(trackPoint(c.lastT, track).y - b.y) < 3 &&
          Math.hypot(c.x - b.x, c.z - b.z) < 2.5
        ) {
          p.pickedLaps[b.band] = Math.floor(c.progress);
          w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0;
          p.held = (["boost", "shield", "missile", "trap"] as Item[])[
            (w.seed >>> 16) % 4
          ];
          b.readyAt = w.time + 3;
          notice(p, "获得 " + ITEM_NAMES[p.held]);
          break;
        }
  }
  for (const m of w.missiles) {
    m.ttl -= dt;
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
    if (d < 4 + 65 * dt) {
      hit(target, m.owner);
      m.ttl = 0;
    } else {
      m.x += (dx / d) * 65 * dt;
      m.z += (dz / d) * 65 * dt;
    }
  }
  w.missiles = w.missiles.filter((m) => m.ttl > 0);
  for (const t of w.traps) {
    t.ttl -= dt;
    if (t.ttl > 14.3) continue;
    const victim = cars.find(
      (c) =>
        !c.finished &&
        c.resetTime <= 0 &&
        c.ghostTime <= 0 &&
        Math.hypot(c.x - t.x, c.z - t.z) < 2.5,
    );
    if (victim) {
      hit(victim, t.owner);
      t.ttl = 0;
    }
  }
  w.traps = w.traps.filter((t) => t.ttl > 0);
}
