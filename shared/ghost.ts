import { angleDiff } from "./track.ts";
export interface Ghost {
  version: number;
  trackId: string;
  time: number;
  frames: number[][];
}
export function validGhost(v: unknown, trackId: string): v is Ghost {
  const g = v as Ghost;
  return (
    !!g &&
    g.version === 2 &&
    g.trackId === trackId &&
    Number.isFinite(g.time) &&
    g.time > 0 &&
    g.time < 600 &&
    Array.isArray(g.frames) &&
    g.frames.length >= 2 &&
    g.frames.length <= 6001 &&
    g.frames.every(
      (f, i) =>
        Array.isArray(f) &&
        f.length === 4 &&
        f.every(Number.isFinite) &&
        f[0] >= 0 &&
        Math.abs(f[1]) < 2000 &&
        Math.abs(f[2]) < 2000 &&
        (i === 0 || f[0] > g.frames[i - 1][0]),
    )
  );
}
export function ghostAt(g: Ghost, t: number) {
  if (t > g.time || !g.frames.length) return null;
  let lo = 0,
    hi = g.frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (g.frames[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const a = g.frames[lo],
    b = g.frames[hi],
    f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
  return {
    x: a[1] + (b[1] - a[1]) * f,
    z: a[2] + (b[2] - a[2]) * f,
    heading: a[3] + angleDiff(b[3], a[3]) * f,
  };
}
