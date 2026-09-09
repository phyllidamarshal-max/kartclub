import { EXTRA_ROUTES } from "./route-data.ts";
import { NEW_MAPS } from "./map-expansion.ts";
import { mapProfile } from "./map-profiles.ts";
import type { MovingObstacleSpec } from "./moving-obstacles.ts";
import { getLevel } from "./levels.ts";
import { ROAD_PROFILES, type WidthStop } from "./road-design.ts";
import { authorCourse, courseWidths, type TrackBend } from "./route-course.ts";
import {
  SHORTCUT_DESIGNS,
  shortcutOffset,
  type ShortcutDesign,
} from "./shortcut-design.ts";
export const ROAD_WIDTH = 16;
export const TRACK_ID = "tide-coast-v1";
export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly t: number;
}
export interface Track {
  readonly layout?: "circuit" | "ab";
  readonly movingObstacles?: readonly MovingObstacleSpec[];
  readonly bends?: readonly TrackBend[];
  readonly raceMinutes?: 3 | 5;
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly theme: "coast" | "city" | "mountain";
  readonly width: number;
  readonly widthProfile?: readonly WidthStop[];
  readonly shortcutWidth?: number;
  readonly shortcutDesign?: ShortcutDesign;
  readonly length: number;
  readonly points: readonly Point[];
  readonly obstacles: readonly {
    readonly x: number;
    readonly z: number;
    readonly radius: number;
  }[];
  readonly shortcut: readonly Point[];
  readonly radius: number;
}
const coast = [
  [0, -100],
  [65, -100],
  [112, -67],
  [100, -15],
  [128, 38],
  [97, 94],
  [37, 106],
  [-4, 53],
  [-69, 91],
  [-111, 48],
  [-106, -23],
  [-62, -83],
];
export function angleDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function create(
  id: string,
  name: string,
  subtitle: string,
  theme: Track["theme"],
  anchors: number[][],
  scale: number,
  width = 16,
) {
  function spline(t: number) {
    const n = anchors.length,
      u = (((t % 1) + 1) % 1) * n,
      i = Math.floor(u),
      f = u - i;
    const p = [-1, 0, 1, 2].map((d) => anchors[(i + d + n) % n]);
    const v = (k: number) =>
      scale *
      0.5 *
      (2 * p[1][k] +
        (-p[0][k] + p[2][k]) * f +
        (2 * p[0][k] - 5 * p[1][k] + 4 * p[2][k] - p[3][k]) * f * f +
        (-p[0][k] + 3 * p[1][k] - 3 * p[2][k] + p[3][k]) * f * f * f);
    return { x: v(0), z: v(1) };
  }
  const course = id === TRACK_ID ? null : authorCourse(id, anchors, scale);
  const raw =
      course?.raw ?? Array.from({ length: 2401 }, (_, i) => spline(i / 2400)),
    ds = [0];
  for (let i = 1; i < raw.length; i++)
    ds.push(
      ds[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z),
    );
  const length = ds.at(-1)!,
    points: { -readonly [K in keyof Point]: Point[K] }[] = [];
  const count = id === TRACK_ID ? 720 : Math.max(720, Math.ceil(length / 2));
  let j = 0;
  for (let i = 0; i < count; i++) {
    const d = (i / count) * length;
    while (ds[j + 1] < d) j++;
    const f = (d - ds[j]) / (ds[j + 1] - ds[j]),
      t = i / count;
    points.push({
      x: raw[j].x + (raw[j + 1].x - raw[j].x) * f,
      z: raw[j].z + (raw[j + 1].z - raw[j].z) * f,
      y:
        id === "mountain-pass" || id === "ice-lagoon"
          ? 16 * (1 - Math.cos(t * Math.PI * 2)) +
            3 * (1 - Math.cos(t * Math.PI * 6))
          : id === "mountain-summit" || id === "mine-transit"
            ? 9 * (1 - Math.cos(t * Math.PI * 6)) +
              4 * (1 - Math.cos(t * Math.PI * 2))
            : theme === "mountain"
              ? 10 * (1 - Math.cos(t * Math.PI * 4))
              : id === "city-nightshift" || id === "space-interchange"
                ? 5 * (1 - Math.cos(t * Math.PI * 2))
                : 0,
      t,
      heading: 0,
    });
  }
  for (let i = 0; i < count; i++) {
    const a = points[(i + count - 1) % count],
      b = points[(i + 1) % count];
    points[i].heading = Math.atan2(b.x - a.x, b.z - a.z);
  }
  return {
    id,
    layout: mapProfile(id).layout,
    movingObstacles: [] as MovingObstacleSpec[],
    name: id === TRACK_ID ? name : getLevel(id).name,
    subtitle,
    theme,
    width,
    widthProfile: course
      ? courseWidths(
          ROAD_PROFILES[id] ??
            NEW_MAPS.find((m) => m.id === id)!.widths.map(([t, width]) => ({
              t,
              width,
            })),
          course,
          id === "mountain-pass" || id === "ice-lagoon",
        ).map((stop) => ({
          ...stop,
          width: Math.max(stop.width, mapProfile(id).minWidth),
        }))
      : ROAD_PROFILES[id],
    bends: course?.bends,
    raceMinutes: course?.minutes,
    shortcutWidth: 7,
    shortcutDesign: undefined as ShortcutDesign | undefined,
    length,
    points,
    obstacles: [] as { x: number; z: number; radius: number }[],
    shortcut: [] as Point[],
    radius: Math.max(...points.map((p) => Math.hypot(p.x, p.z))) + 28,
  };
}
export const DEFAULT_TRACK: Track = create(
  TRACK_ID,
  "晴湾海岸 · 经典",
  "TIDE COAST CLASSIC",
  "coast",
  coast,
  1,
);
const assembledTracks = [
  create("coast", "晴湾环海", "TIDE COAST / TOURING", "coast", coast, 1.65, 18),
  create(
    "city",
    "霓虹街区",
    "NEON DISTRICT / TECHNICAL",
    "city",
    [
      [0, -120],
      [90, -120],
      [145, -85],
      [145, -20],
      [60, -20],
      [60, 40],
      [140, 65],
      [115, 125],
      [20, 125],
      [-15, 60],
      [-70, 125],
      [-140, 95],
      [-140, 5],
      [-60, -10],
      [-100, -90],
    ],
    1.4,
    14,
  ),
  create(
    "mountain",
    "云岭险径",
    "CLOUD RIDGE / EXPERT",
    "mountain",
    [
      [0, -120],
      [95, -130],
      [145, -60],
      [80, -10],
      [140, 60],
      [80, 135],
      [0, 105],
      [-50, 35],
      [-130, 100],
      [-160, 20],
      [-100, -35],
      [-145, -105],
      [-60, -125],
    ],
    1.6,
    12,
  ),
];
for (const r of EXTRA_ROUTES)
  assembledTracks.push(
    create(r.id, r.name, r.subtitle, r.theme, r.anchors, r.scale, r.width),
  );
for (const r of NEW_MAPS)
  assembledTracks.push(
    create(r.id, r.name, r.name.toUpperCase(), r.theme, r.anchors, 1, r.width),
  );
export const TRACKS: readonly Track[] = assembledTracks;
export function getTrack(id: string): Track {
  const t = id === TRACK_ID ? DEFAULT_TRACK : TRACKS.find((t) => t.id === id);
  if (!t) throw Error("未知赛道");
  return t;
}
export function trackWidth(t: number, track: Track = DEFAULT_TRACK): number {
  const profile = track.widthProfile;
  if (!profile?.length) return track.width;
  const u = ((t % 1) + 1) % 1;
  let lo = 0,
    hi = profile.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (profile[mid].t <= u) lo = mid + 1;
    else hi = mid;
  }
  const next = lo === profile.length ? -1 : lo;
  const a = profile[Math.max(0, next - 1)];
  const b = profile[next < 0 ? profile.length - 1 : next];
  const f = Math.max(0, Math.min(1, (u - a.t) / (b.t - a.t || 1)));
  return a.width + (b.width - a.width) * f * f * (3 - 2 * f);
}
export function trackWidthRange(track: Track): { min: number; max: number } {
  const widths = track.widthProfile?.length
    ? track.widthProfile.map((p) => p.width)
    : [track.width];
  return { min: Math.min(...widths), max: Math.max(...widths) };
}
/** The same authored ribbon is used by contact, rails, surfaces and AI. */
export function shortcutWidthAt(t: number, track: Track): number {
  const design = track.shortcutDesign;
  if (!design || track.shortcut.length < 2) return track.shortcutWidth ?? 7;
  const entry = track.shortcut[0].t,
    exit = track.shortcut.at(-1)!.t;
  const f = Math.max(0, Math.min(1, (t - entry) / (exit - entry)));
  const index = design.widths.findIndex((p) => p.f >= f);
  const b = design.widths[index < 0 ? design.widths.length - 1 : index];
  const a = design.widths[Math.max(0, index - 1)];
  const u = Math.max(0, Math.min(1, (f - a.f) / (b.f - a.f || 1)));
  return a.width + (b.width - a.width) * u * u * (3 - 2 * u);
}
/** A same-level crossing must be one surface, including its sloped edges. */
export function shortcutSurfaceHeight(
  x: number,
  z: number,
  t: number,
  y: number,
  track: Track,
): number {
  if (!track.shortcutDesign) return y;
  const main = continuousTrack(x, z, t, track, "main");
  if (Math.abs(main.y - y) > 3) return y; // Preserve genuinely separate elevations.
  const outside = main.distance - main.roadWidth / 2;
  const blend = Math.max(0, Math.min(1, 1 - outside / 12));
  return y + (main.y - y) * blend * blend * (3 - 2 * blend);
}
/** Open only those road edges occupied by the connected branch at a junction. */
export function roadBoundaryOpen(
  p: Point,
  side: -1 | 1,
  track: Track,
  branch: "main" | "shortcut",
  extra = 0,
): boolean {
  if (track.shortcut.length < 2) return false;
  const half =
    (branch === "main" ? trackWidth(p.t, track) : shortcutWidthAt(p.t, track)) /
      2 +
    extra;
  const x = p.x + Math.cos(p.heading) * half * side;
  const z = p.z - Math.sin(p.heading) * half * side;
  const points = branch === "main" ? track.shortcut : track.points;
  const count = branch === "main" ? points.length - 1 : points.length;
  for (let i = 0; i < count; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    let delta = a.t - p.t;
    if (delta > 0.5) delta--;
    if (delta < -0.5) delta++;
    if (Math.abs(delta) > Math.max(30 / track.length, 0.02)) continue;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const f = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    const t = a.t + (b.t < a.t ? b.t + 1 - a.t : b.t - a.t) * f;
    const otherHalf =
      (branch === "main" ? shortcutWidthAt(t, track) : trackWidth(t, track)) /
      2;
    if (
      Math.abs(p.y - (a.y + (b.y - a.y) * f)) < 2 &&
      Math.hypot(x - a.x - dx * f, z - a.z - dz * f) < otherHalf + 0.3
    )
      return true;
  }
  return false;
}
/** The other connected road can carry the kart through an open junction.
 * Progress remains attached to the chosen branch; this only removes an internal
 * wall inside the paved union. It never bridges unrelated neighbouring roads.
 */
export function junctionContains(
  x: number,
  z: number,
  lastT: number,
  track: Track,
  branch: "main" | "shortcut",
  margin = 0,
): boolean {
  if (track.shortcut.length < 2) return false;
  const entry = track.shortcut[0].t,
    exit = track.shortcut.at(-1)!.t;
  const window = Math.min(
    (exit - entry) / 2,
    Math.max(60 / track.length, 0.04),
  );
  const nearEntry =
    lastT >= entry - 3 / track.length && lastT <= entry + window;
  const nearExit = lastT >= exit - window && lastT <= exit + 3 / track.length;
  if (!nearEntry && !nearExit) return false;
  const current = continuousTrack(x, z, lastT, track, branch);
  const other = continuousTrack(
    x,
    z,
    lastT,
    track,
    branch === "main" ? "shortcut" : "main",
  );
  if (Math.abs(current.y - other.y) >= 2) return false;
  if (other.distance <= Math.max(0, other.roadWidth / 2 - margin)) return true;
  if (
    margin <= 0 ||
    (current.distance > current.roadWidth / 2 &&
      other.distance > other.roadWidth / 2)
  )
    return false;
  // Eroding each ribbon before joining leaves false seams: a kart may straddle
  // both roads while its whole body is safely on their union. Audit the actual
  // circular footprint against both unshrunk roads at the connected junction.
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const px = x + Math.cos(angle) * margin,
      pz = z + Math.sin(angle) * margin;
    const a = continuousTrack(px, pz, current.t, track, branch);
    if (a.distance <= a.roadWidth / 2) continue;
    const b = continuousTrack(
      px,
      pz,
      other.t,
      track,
      branch === "main" ? "shortcut" : "main",
    );
    if (b.distance > b.roadWidth / 2) return false;
  }
  return true;
}
export function trackPoint(t: number, track: Track = DEFAULT_TRACK): Point {
  const count = track.points.length;
  const u = (((t % 1) + 1) % 1) * count,
    i = Math.floor(u),
    f = u - i,
    a = track.points[i],
    b = track.points[(i + 1) % count];
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f,
    heading: a.heading + angleDiff(b.heading, a.heading) * f,
    t: ((t % 1) + 1) % 1,
  };
}
const mountain = assembledTracks[2];
// Tangent-continuous side routes exchange a shorter distance for a narrower
// racing line. They share the main circuit's progress at both junctions.
for (const [id, design] of Object.entries(SHORTCUT_DESIGNS)) {
  const track = assembledTracks.find((t) => t.id === id)!;
  const section = track.bends!.find((b) => b.kind === "S")!;
  const entryT = section.start - 40 / track.length;
  const exitT = section.end + 60 / track.length;
  const a = trackPoint(entryT, track),
    b = trackPoint(exitT, track);
  const distance = Math.hypot(b.x - a.x, b.z - a.z) * design.tangentScale;
  const normalX = (b.z - a.z) / Math.hypot(b.x - a.x, b.z - a.z);
  const normalZ = -(b.x - a.x) / Math.hypot(b.x - a.x, b.z - a.z);
  const slope = (t: number) =>
    (trackPoint(t + 1 / track.length, track).y -
      trackPoint(t - 1 / track.length, track).y) /
    2;
  const tangentA = {
    x: Math.sin(a.heading) * distance,
    z: Math.cos(a.heading) * distance,
    y: slope(entryT) * distance,
  };
  const tangentB = {
    x: Math.sin(b.heading) * distance,
    z: Math.cos(b.heading) * distance,
    y: slope(exitT) * distance,
  };
  const hermite = (f: number, key: "x" | "y" | "z") =>
    (2 * f ** 3 - 3 * f ** 2 + 1) * a[key] +
    (f ** 3 - 2 * f ** 2 + f) * tangentA[key] +
    (-2 * f ** 3 + 3 * f ** 2) * b[key] +
    (f ** 3 - f ** 2) * tangentB[key] +
    (key === "x" ? normalX : key === "z" ? normalZ : 0) *
      shortcutOffset(f, design);
  const count = Math.max(160, Math.ceil(distance / 1.5));
  for (let i = 0; i <= count; i++) {
    const f = i / count;
    const d0 = Math.max(0, f - 0.0001),
      d1 = Math.min(1, f + 0.0001);
    track.shortcut.push({
      x: hermite(f, "x"),
      y: hermite(f, "y"),
      z: hermite(f, "z"),
      heading: Math.atan2(
        hermite(d1, "x") - hermite(d0, "x"),
        hermite(d1, "z") - hermite(d0, "z"),
      ),
      t: entryT + (exitT - entryT) * f,
    });
  }
  track.shortcutDesign = design;
  track.shortcutWidth = Math.max(...design.widths.map((p) => p.width));
  track.shortcut = track.shortcut.map((p, i) =>
    i === 0 || i === track.shortcut.length - 1
      ? p
      : { ...p, y: shortcutSurfaceHeight(p.x, p.z, p.t, p.y, track) },
  );
}
function obstacleStraight(track: Track, desired: number) {
  return (
    track.points
      .filter((p) => {
        const a = trackPoint(p.t - 45 / track.length, track),
          b = trackPoint(p.t + 45 / track.length, track);
        return (
          p.t > 0.035 &&
          Math.abs(angleDiff(a.heading, b.heading)) < 0.12 &&
          trackWidth(p.t, track) >= 13 &&
          (!track.shortcut.length ||
            p.t < track.shortcut[0].t - 40 / track.length ||
            p.t > track.shortcut.at(-1)!.t + 40 / track.length)
        );
      })
      .sort((a, b) => Math.abs(a.t - desired) - Math.abs(b.t - desired))[0]
      ?.t ?? desired
  );
}
for (const [desired, side] of [
  [0.24, 3],
  [0.72, -3],
] as const) {
  const t = obstacleStraight(mountain, desired);
  const p = trackPoint(t, mountain);
  const offset = Math.sign(side) * (trackWidth(t, mountain) / 2 - 1.6);
  mountain.obstacles.push({
    x: p.x + Math.cos(p.heading) * offset,
    z: p.z - Math.sin(p.heading) * offset,
    radius: 1.5,
  });
}
for (const track of assembledTracks.filter(
  (t) => t.id === "city-factory" || t.id === "mountain-summit",
))
  for (const [desired, side] of [
    [0.22, 1],
    [0.44, -1],
    [0.76, 1],
  ]) {
    const t = obstacleStraight(track, desired);
    const p = trackPoint(t, track),
      offset = side * (trackWidth(t, track) / 2 - 1.6);
    track.obstacles.push({
      x: p.x + Math.cos(p.heading) * offset,
      z: p.z - Math.sin(p.heading) * offset,
      radius: 1.1,
    });
  }
// Crossings are authored as driving decisions with a long visible approach.
// Wildlife can rest off-road; even at mid-crossing a complete passing lane exists.
for (const [id, kinds] of [
  ["harbor-dual", ["hauler", "shuttle"]],
  ["factory-shift", ["pendulum", "pendulum", "pendulum"]],
  ["city-switchback", ["spinner", "spinner"]],
  ["space-interchange", ["shuttle", "shuttle", "spinner"]],
  ["mine-transit", ["pendulum", "pendulum", "minecart"]],
  ["forest-orchard", ["sheep"]],
  ["forest-ridge", ["deer", "deer"]],
] as const) {
  const track = assembledTracks.find((t) => t.id === id)!;
  const placed: Point[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const desired = 0.18 + i * 0.28;
    const candidates = track.points
      .filter((p) => {
        if (
          p.t * track.length < 150 ||
          p.t > 0.92 ||
          trackWidth(p.t, track) < 18
        )
          return false;
        if (placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 160))
          return false;
        if (track.shortcut.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 40))
          return false;
        if (
          track.shortcut.length &&
          p.t > track.shortcut[0].t - 70 / track.length &&
          p.t < track.shortcut.at(-1)!.t + 70 / track.length
        )
          return false;
        return (kind === 'shuttle' ? [-38, 38] : [-96, -64, -38, 38]).every(distance => {
          const q = trackPoint(p.t + distance / track.length, track);
          return Math.abs(angleDiff(q.heading, p.heading)) < (kind === 'shuttle' ? .04 : .12);
        });
      })
      .sort((a, b) => Math.abs(a.t - desired) - Math.abs(b.t - desired));
    const p = candidates[0];
    if (!p) throw new Error(`No safe traffic crossing on ${id}/${i}`);
    placed.push(p);
    const animal = kind === 'sheep' || kind === 'deer';
    const radius = kind === 'spinner' ? 3.5 : kind === 'minecart' ? 2.1
      : kind === 'hauler' ? 2.4 : kind === 'pendulum' ? 2.2
      : kind === 'deer' ? 1.8 : animal ? 1.7 : 1.65;
    const halfWidth = trackWidth(p.t, track) / 2;
    (track.movingObstacles as MovingObstacleSpec[]).push({
      id: `${id}/traffic-${i}`,
      kind,
      x: p.x,
      y: p.y,
      z: p.z,
      heading: p.heading,
      radius,
      amplitude: kind === 'spinner' ? 0 : kind === 'minecart'
        ? Math.min(4.5, halfWidth - radius - 1.2) : kind === 'hauler'
        ? Math.min(3.5, halfWidth - radius - 1.2)
        : animal ? halfWidth + radius + 1.5 : kind === 'pendulum'
        ? Math.min(3, halfWidth - radius - 1.5) : Math.min(2.6, halfWidth - 6),
      period: kind === 'sheep' ? 22 : kind === 'deer' ? 19 + i * 2
        : kind === 'pendulum' ? 6.5 + i * .8 : kind === 'minecart' ? 14
        : kind === 'hauler' ? 18 + i * 2 : kind === 'spinner' ? 11 + i : 10 + i * 1.5,
      phase: i * 2.1,
    });
  }
}
// Freeze only after all branches and obstacles are assembled, before indexing.
// Callers may still construct independent custom tracks using clones/spreads.
const tourOrder = [
  "coast",
  "coast-harbor",
  "coast-breakwater",
  "city",
  "city-factory",
  "city-nightshift",
  "mountain",
  "mountain-pass",
  "mountain-summit",
  ...NEW_MAPS.map((map) => map.id),
];
assembledTracks.sort(
  (a, b) => tourOrder.indexOf(a.id) - tourOrder.indexOf(b.id),
);
for (const track of [DEFAULT_TRACK, ...TRACKS]) {
  if (track.bends) {
    track.bends.forEach(Object.freeze);
    Object.freeze(track.bends);
  }
  if (track.widthProfile) {
    track.widthProfile.forEach(Object.freeze);
    Object.freeze(track.widthProfile);
  }
  for (const collection of [
    track.points,
    track.shortcut,
    track.obstacles,
    track.movingObstacles ?? [],
  ]) {
    for (const value of collection) Object.freeze(value);
    Object.freeze(collection);
  }
  Object.freeze(track);
}
Object.freeze(TRACKS);
// Spatial bins retain exact nearest sampled-point results; distant reset queries use a full scan.
const grids = new Map<Track, Map<string, Point[]>>();
for (const track of [DEFAULT_TRACK, ...TRACKS]) {
  const grid = new Map<string, Point[]>();
  for (const p of track.points) {
    const key = `${Math.floor(p.x / 24)},${Math.floor(p.z / 24)}`;
    const bin = grid.get(key) || [];
    bin.push(p);
    grid.set(key, bin);
  }
  grids.set(track, grid);
}
export function nearestTrack(
  x: number,
  z: number,
  track: Track = DEFAULT_TRACK,
) {
  let best = Infinity,
    p = track.points[0];
  const grid = grids.get(track),
    gx = Math.floor(x / 24),
    gz = Math.floor(z / 24);
  const consider = (q: Point) => {
    const d = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (d < best) {
      best = d;
      p = q;
    }
  };
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++)
      for (const q of grid?.get(`${gx + a},${gz + b}`) || []) consider(q);
  if (best > 24 ** 2) for (const q of track.points) consider(q);
  for (const q of track.shortcut) {
    const d = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (d < best) {
      best = d;
      p = q;
    }
  }
  return continuousTrack(x, z, p.t, track);
}
export const TRACK_LENGTH = DEFAULT_TRACK.length;
export const TRACK_POINTS = DEFAULT_TRACK.points;

// Follow the local distance minimum from the previously occupied segment.
// The search cannot cross a farther connecting bend to reach a closer parallel
// road, even inside the progress window. Shortcut t values map their connected
// branch back onto canonical race progress.
export function continuousTrack(
  x: number,
  z: number,
  lastT: number,
  track: Track = DEFAULT_TRACK,
  branch?: "main" | "shortcut",
) {
  let best = Infinity;
  let result = {
    ...trackPoint(lastT, track),
    distance: Infinity,
    lateral: 0,
    roadWidth: trackWidth(lastT, track),
    progressScale: 1,
  };
  const window = Math.max(30 / track.length, 3 / track.points.length);
  const consider = (a: Point, b: Point, shortcut: boolean) => {
    let span = b.t - a.t;
    if (span < 0) span++;
    const dx = b.x - a.x,
      dz = b.z - a.z,
      len2 = dx * dx + dz * dz;
    let f = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len2 || 1)),
    );
    const t = (a.t + span * f) % 1;
    let delta = t - lastT;
    if (delta > 0.5) delta--;
    if (delta < -0.5) delta++;
    if (Math.abs(delta) > window) return Infinity;
    const px = a.x + dx * f,
      pz = a.z + dz * f,
      d = (x - px) ** 2 + (z - pz) ** 2;
    if (d >= best) return d;
    best = d;
    const heading = a.heading + angleDiff(b.heading, a.heading) * f;
    result = {
      x: px,
      z: pz,
      y: a.y + (b.y - a.y) * f,
      t,
      heading,
      distance: Math.sqrt(d),
      lateral: (x - px) * Math.cos(heading) - (z - pz) * Math.sin(heading),
      roadWidth: shortcut ? shortcutWidthAt(t, track) : trackWidth(t, track),
      progressScale:
        (span * track.length) /
        (Math.sqrt(len2) || 1) /
        Math.max(
          0.1,
          1 -
            (Math.abs(angleDiff(b.heading, a.heading)) * Math.sqrt(d)) /
              (Math.sqrt(len2) || 1),
        ),
    };
    return d;
  };
  const follow = (
    points: readonly Point[],
    centre: number,
    shortcut: boolean,
    closed: boolean,
  ) => {
    const count = closed ? points.length : points.length - 1;
    if (count < 1) return;
    const project = (i: number) =>
      consider(points[i], points[(i + 1) % points.length], shortcut);
    const initial = project(centre);
    if (!Number.isFinite(initial)) return;
    for (const direction of [-1, 1]) {
      let previous = initial;
      for (let step = 1; step < count; step++) {
        const index = centre + direction * step;
        if (!closed && (index < 0 || index >= count)) break;
        const distance = project((index + count) % count);
        // Equal distances allow a shared endpoint to pass to its adjacent
        // segment; an increase ends this connected walk before another leg.
        if (distance > previous + 1e-9) break;
        previous = distance;
      }
    }
  };
  const normalizedT = ((lastT % 1) + 1) % 1;
  if (branch !== "shortcut")
    follow(
      track.points,
      Math.floor(normalizedT * track.points.length),
      false,
      true,
    );
  if (branch !== "main" && track.shortcut.length > 1) {
    const next = track.shortcut.findIndex((p) => p.t > normalizedT);
    const centre = next < 0 ? track.shortcut.length - 2 : Math.max(0, next - 1);
    follow(track.shortcut, centre, true, false);
  }
  return result;
}
