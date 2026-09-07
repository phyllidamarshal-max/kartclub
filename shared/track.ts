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
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly theme: "coast" | "city" | "mountain";
  readonly width: number;
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
  const raw = Array.from({ length: 2401 }, (_, i) => spline(i / 2400)),
    ds = [0];
  for (let i = 1; i < raw.length; i++)
    ds.push(
      ds[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z),
    );
  const length = ds.at(-1)!,
    points: { -readonly [K in keyof Point]: Point[K] }[] = [];
  let j = 0;
  for (let i = 0; i < 720; i++) {
    const d = (i / 720) * length;
    while (ds[j + 1] < d) j++;
    const f = (d - ds[j]) / (ds[j + 1] - ds[j]),
      t = i / 720;
    points.push({
      x: raw[j].x + (raw[j + 1].x - raw[j].x) * f,
      z: raw[j].z + (raw[j + 1].z - raw[j].z) * f,
      y: theme === "mountain" ? 10 * (1 - Math.cos(t * Math.PI * 4)) : 0,
      t,
      heading: 0,
    });
  }
  for (let i = 0; i < 720; i++) {
    const a = points[(i + 719) % 720],
      b = points[(i + 1) % 720];
    points[i].heading = Math.atan2(b.x - a.x, b.z - a.z);
  }
  return {
    id,
    name,
    subtitle,
    theme,
    width,
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
export const TRACKS: readonly Track[] = assembledTracks;
export function getTrack(id: string): Track {
  const t = id === TRACK_ID ? DEFAULT_TRACK : TRACKS.find((t) => t.id === id);
  if (!t) throw Error("未知赛道");
  return t;
}
export function trackPoint(t: number, track: Track = DEFAULT_TRACK): Point {
  const u = (((t % 1) + 1) % 1) * 720,
    i = Math.floor(u),
    f = u - i,
    a = track.points[i],
    b = track.points[(i + 1) % 720];
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f,
    heading: a.heading + angleDiff(b.heading, a.heading) * f,
    t: ((t % 1) + 1) % 1,
  };
}
const mountain = assembledTracks[2],
  start = trackPoint(0.49, mountain),
  end = trackPoint(0.62, mountain);
for (let i = 0; i <= 80; i++) {
  const f = i / 80;
  mountain.shortcut.push({
    x: start.x + (end.x - start.x) * f,
    y: start.y + (end.y - start.y) * f,
    z: start.z + (end.z - start.z) * f,
    t: 0.49 + 0.13 * f,
    heading: Math.atan2(end.x - start.x, end.z - start.z),
  });
}
for (const [t, side] of [
  [0.24, 3],
  [0.72, -3],
] as const) {
  const p = trackPoint(t, mountain);
  mountain.obstacles.push({
    x: p.x + Math.cos(p.heading) * side,
    z: p.z - Math.sin(p.heading) * side,
    radius: 1.5,
  });
}
// Freeze only after all branches and obstacles are assembled, before indexing.
// Callers may still construct independent custom tracks using clones/spreads.
for (const track of [DEFAULT_TRACK, ...TRACKS]) {
  for (const collection of [track.points, track.shortcut, track.obstacles]) {
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
    p = track.points[0],
    roadWidth = track.width;
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
      roadWidth = 7;
    }
  }
  return {
    ...p,
    distance: Math.sqrt(best),
    lateral: (x - p.x) * Math.cos(p.heading) - (z - p.z) * Math.sin(p.heading),
    roadWidth,
  };
}
export const TRACK_LENGTH = DEFAULT_TRACK.length;
export const TRACK_POINTS = DEFAULT_TRACK.points;
