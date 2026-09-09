import { KART_FOOTPRINT } from "./kart-contact.ts";
export type Point = { x: number; z: number };
/** Reflected kart outline: obstacle disc expanded by the actual kart footprint. */
export function contactOutline(heading: number): Point[] {
  const c = Math.cos(heading),
    s = Math.sin(heading);
  return KART_FOOTPRINT.map(([x, z]) => ({
    x: -x * c - z * s,
    z: x * s - z * c,
  }));
}
/** Signed separation and outward normal of a point from a rounded convex polygon. */
export function discClearance(p: Point, polygon: Point[], radius: number) {
  let inside = true,
    closest = Infinity,
    nx = 0,
    nz = -1;
  let face = -Infinity,
    faceX = 0,
    faceZ = -1;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      len = Math.hypot(dx, dz);
    const ox = dz / len,
      oz = -dx / len;
    const d = (p.x - a.x) * ox + (p.z - a.z) * oz;
    if (d > 0) inside = false;
    if (d > face) {
      face = d;
      faceX = ox;
      faceZ = oz;
    }
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len)),
    );
    const rx = p.x - a.x - t * dx,
      rz = p.z - a.z - t * dz,
      dist = Math.hypot(rx, rz);
    if (dist < closest) {
      closest = dist;
      nx = dist > 1e-12 ? rx / dist : ox;
      nz = dist > 1e-12 ? rz / dist : oz;
    }
  }
  return inside
    ? { distance: face - radius, nx: faceX, nz: faceZ }
    : { distance: closest - radius, nx, nz };
}
/** Exact continuous segment entry against all straight edges and round corners. */
export function sweepRoundedPolygon(
  p: Point,
  q: Point,
  polygon: Point[],
  radius: number,
): number | null {
  if (discClearance(p, polygon, radius).distance < 0) return 0;
  const dx = q.x - p.x,
    dz = q.z - p.z,
    travel = dx * dx + dz * dz;
  if (travel < 1e-24) return null;
  const candidates: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x,
      ez = b.z - a.z,
      len = Math.hypot(ex, ez),
      nx = ez / len,
      nz = -ex / len;
    const v = dx * nx + dz * nz;
    if (v < -1e-12)
      candidates.push((radius - (p.x - a.x) * nx - (p.z - a.z) * nz) / v);
    const rx = p.x - a.x,
      rz = p.z - a.z,
      dot = rx * dx + rz * dz;
    const discriminant =
      dot * dot - travel * (rx * rx + rz * rz - radius * radius);
    if (discriminant > 1e-12)
      candidates.push((-dot - Math.sqrt(discriminant)) / travel);
  }
  candidates.sort((a, b) => a - b);
  for (const t of candidates) {
    if (t < -1e-9 || t > 1) continue;
    const hit = discClearance(
      { x: p.x + dx * t, z: p.z + dz * t },
      polygon,
      radius,
    );
    if (Math.abs(hit.distance) < 1e-7 && dx * hit.nx + dz * hit.nz < -1e-10)
      return Math.max(0, t);
  }
  return null;
}

/** Minkowski expansion by a centered line segment, preserving CCW winding. */
export function expandContactOutline(
  polygon: Point[],
  x: number,
  z: number,
): Point[] {
  const points = polygon
    .flatMap((p) => [
      { x: p.x - x, z: p.z - z },
      { x: p.x + x, z: p.z + z },
    ])
    .sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const p of points) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12
    )
      lower.pop();
    lower.push(p);
  }
  for (const p of [...points].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12
    )
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
