/** Metres in the authored kart's local +X right / +Z forward frame.
 * Covers the body, tires and their full ±0.38 rad steering sweep, with a small
 * clearance margin. Chamfered bumper corners avoid a large circular air wall.
 * Tests verify every vertex of both the authored and delivered models fits.
 */
export const KART_FOOTPRINT: readonly (readonly [number, number])[] = [
  [-1.28, -1.79],
  [1.28, -1.79],
  [1.6, -1.45],
  [1.6, 1.58],
  [1.13, 2.12],
  [-1.13, 2.12],
  [-1.6, 1.58],
  [-1.6, -1.45],
];
export interface KartPose {
  x: number;
  z: number;
  heading: number;
}
export interface KartContact {
  nx: number;
  nz: number;
  depth: number;
}
const diameter =
  Math.max(...KART_FOOTPRINT.map(([x, z]) => Math.hypot(x, z))) * 2;
const tolerance = 1e-7;

function outline(car: KartPose, origin: KartPose) {
  const cos = Math.cos(car.heading),
    sin = Math.sin(car.heading);
  return KART_FOOTPRINT.map(([x, z]) => ({
    x: car.x - origin.x + x * cos + z * sin,
    z: car.z - origin.z - x * sin + z * cos,
  }));
}
type Point = { x: number; z: number };
function interval(points: Point[], nx: number, nz: number) {
  let min = Infinity,
    max = -Infinity;
  for (const p of points) {
    const d = p.x * nx + p.z * nz;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return { min, max };
}

/** Normal points from B toward A; depth is the translation needed to separate. */
export function kartContact(a: KartPose, b: KartPose): KartContact | null {
  const dx = a.x - b.x,
    dz = a.z - b.z;
  if (dx * dx + dz * dz >= diameter * diameter) return null;
  // Use relative coordinates for stable millimetre clearance on long courses.
  const one = outline(a, a),
    two = outline(b, a);
  let best: KartContact = { nx: 0, nz: 0, depth: Infinity };
  for (const polygon of [one, two])
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(q.x - p.x, q.z - p.z);
      const nx = -(q.z - p.z) / length,
        nz = (q.x - p.x) / length;
      const aa = interval(one, nx, nz),
        bb = interval(two, nx, nz);
      const positive = bb.max - aa.min,
        negative = aa.max - bb.min;
      if (positive <= tolerance || negative <= tolerance) return null;
      const direction = positive < negative ? 1 : -1,
        depth = Math.min(positive, negative);
      if (depth < best.depth)
        best = { nx: nx * direction, nz: nz * direction, depth };
    }
  // Coincident reset/spawn recovery has no preferred lateral side. Move along
  // the kart's forward axis, so a queue beside the boundary can still unpack.
  if (dx * dx + dz * dz < 1e-16) {
    const nx = Math.sin(a.heading),
      nz = Math.cos(a.heading);
    const aa = interval(one, nx, nz),
      bb = interval(two, nx, nz);
    best = { nx, nz, depth: bb.max - aa.min };
  }
  return best;
}

/** Shared positional solver; callers decide whether contacts affect physics. */
export function resolveKartContacts<T extends KartPose>(
  cars: T[],
  constrain?: (car: T) => void,
  onContact?: (a: T, b: T, contact: KartContact) => void,
  escapeHeading?: (car: T) => number,
) {
  for (let pass = 0; pass < 48; pass++) {
    let overlap = false;
    for (let i = 0; i < cars.length; i++)
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i],
          b = cars[j];
        let contact = kartContact(a, b);
        if (!contact) continue;
        overlap = true;
        onContact?.(a, b, contact);
        // A road can fit two abreast while a squeezed pack contains three.
        // Lateral projection alone then has no solution. After bounded normal
        // iterations, unpack along the road tangent, leaving velocities alone.
        if (pass >= 24 && escapeHeading) {
          const heading = escapeHeading(a),
            nx = Math.sin(heading),
            nz = Math.cos(heading);
          if (Math.abs(contact.nx * nx + contact.nz * nz) < 0.5) {
            const aa = interval(outline(a, a), nx, nz),
              bb = interval(outline(b, a), nx, nz);
            const positive = bb.max - aa.min,
              negative = aa.max - bb.min;
            const sign = positive < negative ? 1 : -1;
            contact = {
              nx: nx * sign,
              nz: nz * sign,
              depth: Math.min(positive, negative),
            };
          }
        }
        // A tenth of a millimetre prevents successive constrained pairs from
        // cycling around the same contact due to floating-point rounding.
        const push = (contact.depth + 1e-4) * 0.5;
        a.x += contact.nx * push;
        a.z += contact.nz * push;
        b.x -= contact.nx * push;
        b.z -= contact.nz * push;
        constrain?.(a);
        constrain?.(b);
      }
    if (!overlap) break;
  }
}
