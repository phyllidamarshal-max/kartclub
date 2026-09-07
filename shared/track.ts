export const ROAD_WIDTH = 16;
export const TRACK_ID = "tide-coast-v1";
const anchors = [
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
export interface Point {
  x: number;
  z: number;
  heading: number;
  t: number;
}
function spline(t: number) {
  const n = anchors.length,
    u = (((t % 1) + 1) % 1) * n,
    i = Math.floor(u),
    f = u - i;
  const p = [-1, 0, 1, 2].map((d) => anchors[(i + d + n) % n]);
  const v = (k: number) =>
    0.5 *
    (2 * p[1][k] +
      (-p[0][k] + p[2][k]) * f +
      (2 * p[0][k] - 5 * p[1][k] + 4 * p[2][k] - p[3][k]) * f * f +
      (-p[0][k] + 3 * p[1][k] - 3 * p[2][k] + p[3][k]) * f * f * f);
  return { x: v(0), z: v(1) };
}
const raw = Array.from({ length: 2401 }, (_, i) => spline(i / 2400));
const distances = [0];
for (let i = 1; i < raw.length; i++)
  distances.push(
    distances[i - 1] +
      Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z),
  );
export const TRACK_LENGTH = distances.at(-1)!;
export const TRACK_POINTS: Point[] = [];
let j = 0;
for (let i = 0; i < 720; i++) {
  const d = (i / 720) * TRACK_LENGTH;
  while (distances[j + 1] < d) j++;
  const f = (d - distances[j]) / (distances[j + 1] - distances[j]);
  TRACK_POINTS.push({
    x: raw[j].x + (raw[j + 1].x - raw[j].x) * f,
    z: raw[j].z + (raw[j + 1].z - raw[j].z) * f,
    t: i / 720,
    heading: 0,
  });
}
for (let i = 0; i < 720; i++) {
  const p = TRACK_POINTS[i],
    next = TRACK_POINTS[(i + 1) % 720],
    prev = TRACK_POINTS[(i + 719) % 720];
  p.heading = Math.atan2(next.x - prev.x, next.z - prev.z);
}
export function angleDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
export function trackPoint(t: number): Point {
  const u = (((t % 1) + 1) % 1) * 720,
    i = Math.floor(u),
    f = u - i,
    a = TRACK_POINTS[i],
    b = TRACK_POINTS[(i + 1) % 720];
  return {
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    heading: a.heading + angleDiff(b.heading, a.heading) * f,
    t: ((t % 1) + 1) % 1,
  };
}
export function nearestTrack(x: number, z: number) {
  let best = Infinity,
    index = 0;
  for (let i = 0; i < 720; i++) {
    const p = TRACK_POINTS[i],
      d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) {
      best = d;
      index = i;
    }
  }
  const p = TRACK_POINTS[index];
  return {
    ...p,
    distance: Math.sqrt(best),
    lateral: (x - p.x) * Math.cos(p.heading) - (z - p.z) * Math.sin(p.heading),
  };
}
