import type { WidthStop } from "./road-design.ts";
import { NEW_MAPS } from "./map-expansion.ts";
import { mapProfile } from "./map-profiles.ts";

export interface TrackBend {
  readonly id: string;
  readonly kind: "V" | "S" | "U" | "corner";
  readonly start: number;
  readonly apex: number;
  readonly end: number;
}
// Existing route silhouettes are retained. Different exterior edges receive the
// return leg; length and bend radius are independent of vehicle performance.
export const COURSE_DESIGNS: Readonly<
  Record<
    string,
    {
      minutes: 3 | 5;
      expansion: number;
      returnEdge: number;
      returnDepth: number;
    }
  >
> = {
  ...Object.fromEntries(NEW_MAPS.map((map) => [map.id, map.course])),
  coast: { minutes: 3, expansion: 1.78, returnEdge: 0, returnDepth: 145 },
  "coast-harbor": {
    minutes: 3,
    expansion: 1.8,
    returnEdge: 8,
    returnDepth: 130,
  },
  "coast-breakwater": {
    minutes: 5,
    expansion: 3.1,
    returnEdge: 6,
    returnDepth: 190,
  },
  city: { minutes: 3, expansion: 1.55, returnEdge: 11, returnDepth: 135 },
  "city-factory": {
    minutes: 5,
    expansion: 2.2,
    returnEdge: 11,
    returnDepth: 190,
  },
  "city-nightshift": {
    minutes: 5,
    expansion: 2.2,
    returnEdge: 5,
    returnDepth: 210,
  },
  mountain: { minutes: 3, expansion: 1.5, returnEdge: 5, returnDepth: 130 },
  "mountain-pass": {
    minutes: 3,
    expansion: 1.7,
    returnEdge: 0,
    returnDepth: 120,
  },
  "mountain-summit": {
    minutes: 5,
    expansion: 2.5,
    returnEdge: 9,
    returnDepth: 180,
  },
};
type Vec = { x: number; z: number; key: string; u?: boolean };
const hypot = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (t: number) => ((t % 1) + 1) % 1;

/** Tangent-continuous circular fillets replace Catmull-Rom curvature spikes. */
export function authorCourse(id: string, original: number[][], scale: number) {
  const design = COURSE_DESIGNS[id];
  const rating = mapProfile(id);
  if (id === "coast")
    original = original.map((p, i) => (i === 7 ? [-4, 5] : p));
  const anchors: Vec[] = original.map(([x, z], i) => ({
    x: x * scale * design.expansion,
    z: z * scale * design.expansion,
    key: `turn-${i}`,
  }));
  const edge = design.returnEdge,
    a = anchors[edge],
    b = anchors[(edge + 1) % anchors.length];
  const length = hypot(a, b),
    ux = (b.x - a.x) / length,
    uz = (b.z - a.z) / length;
  const r = 42,
    depth = design.returnDepth;
  const local = (u: number, v: number, key: string, bend = false): Vec => ({
    x: a.x + ux * u + uz * v,
    z: a.z + uz * u - ux * v,
    key,
    u: bend,
  });
  const added = [local(length / 2 - r, 0, "return-entry")];
  for (let i = 0; i <= 4; i++) {
    const angle = Math.PI - (i * Math.PI) / 4;
    added.push(
      local(
        length / 2 + Math.cos(angle) * r,
        depth + Math.sin(angle) * r,
        `u-${i}`,
        true,
      ),
    );
  }
  added.push(local(length / 2 + r, 0, "return-exit"));
  anchors.splice(edge + 1, 0, ...added);
  const corners = anchors.map((p, i) => {
    const prev = anchors[(i + anchors.length - 1) % anchors.length],
      next = anchors[(i + 1) % anchors.length];
    const d0 = hypot(prev, p),
      d1 = hypot(p, next);
    const u = { x: (p.x - prev.x) / d0, z: (p.z - prev.z) / d0 };
    const v = { x: (next.x - p.x) / d1, z: (next.z - p.z) / d1 };
    const turn = Math.atan2(u.x * v.z - u.z * v.x, u.x * v.x + u.z * v.z);
    const desired = p.u
      ? 42
      : id === "mountain-pass" || id === "ice-lagoon"
        ? 34
        : Math.abs(turn) > 1.8
          ? rating.tightRadius
          : rating.bendRadius;
    const tangent = Math.tan(Math.abs(turn) / 2);
    const cut = Math.min(desired * tangent, d0 * 0.42, d1 * 0.42);
    const radius = tangent > 1e-8 ? cut / tangent : desired;
    const entry = { ...p, x: p.x - u.x * cut, z: p.z - u.z * cut };
    const exit = { ...p, x: p.x + v.x * cut, z: p.z + v.z * cut };
    const sign = Math.sign(turn);
    const centre = {
      x: entry.x - u.z * radius * sign,
      z: entry.z + u.x * radius * sign,
    };
    return { ...p, entry, exit, centre, turn, radius, start: 0, end: 0 };
  });
  const raw: { x: number; z: number }[] = [];
  let travelled = 0;
  const push = (p: { x: number; z: number }) => {
    if (raw.length)
      travelled += Math.hypot(p.x - raw.at(-1)!.x, p.z - raw.at(-1)!.z);
    raw.push({ x: p.x, z: p.z });
  };
  push(corners[0].exit);
  for (let j = 1; j <= corners.length; j++) {
    const c = corners[j % corners.length];
    const from = raw.at(-1)!;
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(from.x - c.entry.x, from.z - c.entry.z) / 0.8),
    );
    for (let i = 1; i <= steps; i++)
      push({
        x: from.x + ((c.entry.x - from.x) * i) / steps,
        z: from.z + ((c.entry.z - from.z) * i) / steps,
      });
    c.start = travelled;
    if (Math.abs(c.turn) < 1e-8) {
      push(c.exit);
      c.end = travelled;
      continue;
    }
    const angle = Math.atan2(c.entry.z - c.centre.z, c.entry.x - c.centre.x);
    const count = Math.max(1, Math.ceil((Math.abs(c.turn) * c.radius) / 0.6));
    for (let i = 1; i <= count; i++)
      push({
        x: c.centre.x + Math.cos(angle + (c.turn * i) / count) * c.radius,
        z: c.centre.z + Math.sin(angle + (c.turn * i) / count) * c.radius,
      });
    c.end = travelled;
  }
  const ordered = [...corners].sort((a, b) => a.start - b.start);
  const asBend = (
    key: string,
    kind: TrackBend["kind"],
    start: number,
    end: number,
  ): TrackBend => ({
    id: `${id}/${key}`,
    kind,
    start: start / travelled,
    apex: (start + end) / 2 / travelled,
    end: end / travelled,
  });
  const u = ordered.filter((c) => c.u);
  const v = ordered
    .filter((c) => !c.u && c.key.startsWith("turn-"))
    .sort((a, b) => Math.abs(b.turn) - Math.abs(a.turn))[0];
  const pairs = ordered
    .slice(0, -1)
    .map((a, i) => ({ a, b: ordered[i + 1] }))
    .filter(
      ({ a, b }) =>
        !a.u &&
        !b.u &&
        a !== v &&
        b !== v &&
        a.key.startsWith("turn-") &&
        b.key.startsWith("turn-") &&
        a.turn * b.turn < 0 &&
        Math.min(Math.abs(a.turn), Math.abs(b.turn)) > 0.5,
    )
    .sort(
      (a, b) =>
        Math.min(Math.abs(b.a.turn), Math.abs(b.b.turn)) -
        Math.min(Math.abs(a.a.turn), Math.abs(a.b.turn)),
    );
  if (!pairs.length) throw Error(`No authored S pair on ${id}`);
  const s = pairs[0];
  const bends = [
    asBend("v", "V", v.start, v.end),
    asBend("s", "S", s.a.start, s.b.end),
    asBend("u", "U", u[0].start, u.at(-1)!.end),
  ];
  for (const c of ordered
    .filter((c) => Math.abs(c.turn) > 0.65)
    .sort((a, b) => Math.abs(b.turn) - Math.abs(a.turn))) {
    if (
      bends.some(
        (b) => c.start / travelled <= b.end && c.end / travelled >= b.start,
      )
    )
      continue;
    bends.push(asBend(c.key, "corner", c.start, c.end));
    if (bends.length === 5) break;
  }
  return {
    raw,
    bends: bends.sort((a, b) => a.apex - b.apex),
    corners,
    length: travelled,
    minutes: design.minutes,
  };
}

/** Hold exit width until the kart has room to recover; narrow straights remain. */
export function courseWidths(
  base: readonly WidthStop[],
  course: ReturnType<typeof authorCourse>,
  icy: boolean,
): WidthStop[] {
  const count = Math.ceil(course.length / 8);
  const valueAt = (t: number) => {
    const next = base.findIndex((p) => p.t > t),
      a = base[Math.max(0, next - 1)],
      b = base[next < 0 ? base.length - 1 : next];
    const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)));
    let width = Math.max(
      9.5,
      a.width + (b.width - a.width) * f * f * (3 - 2 * f),
    );
    const gridDistance = Math.min(t, 1 - t) * course.length;
    width = Math.max(width, 20 - Math.min(10, gridDistance / 6));
    for (const c of course.corners) {
      if (Math.abs(c.turn) < 0.2) continue;
      const middle = (c.start + c.end) / 2 / course.length;
      const distance = (wrap(t - middle + 0.5) - 0.5) * course.length;
      const half = (c.end - c.start) / 2;
      const outside = Math.max(-half - 20 - distance, distance - half - 55, 0);
      const fade = Math.max(0, 1 - outside / 60);
      const required = c.u ? 18 : icy ? 17 : 15;
      width = Math.max(
        width,
        9.5 + (required - 9.5) * fade * fade * (3 - 2 * fade),
      );
    }
    return width;
  };
  return Array.from({ length: count + 1 }, (_, i) => ({
    t: i / count,
    width: valueAt(i === count ? 0 : i / count),
  }));
}
