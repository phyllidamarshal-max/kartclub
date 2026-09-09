import type { Car } from "../shared/race.ts";
import { angleDiff, type Track } from "../shared/track.ts";
import { kartContact, resolveKartContacts } from "../shared/kart-contact.ts";
import { constrainMovingObstacles } from "../shared/moving-obstacles.ts";

export type RenderPose = Pick<Car, "x" | "z" | "heading" | "resetTime">;
export function capturePose(car: Car): RenderPose {
  return { x: car.x, z: car.z, heading: car.heading, resetTime: car.resetTime };
}

/** Draw between the last two simulation ticks, without changing race state. */
export function interpolateCar(
  car: Car,
  previous: RenderPose | undefined,
  alpha: number,
): Car {
  if (
    !previous ||
    car.resetTime > 0 ||
    previous.resetTime > 0 ||
    Math.hypot(car.x - previous.x, car.z - previous.z) > 8
  )
    return car;
  const t = Math.max(0, Math.min(1, alpha));
  return {
    ...car,
    x: previous.x + (car.x - previous.x) * t,
    z: previous.z + (car.z - previous.z) * t,
    heading: previous.heading + angleDiff(car.heading, previous.heading) * t,
  };
}

/** Snapshot interpolation can overlap otherwise legal end poses. Correct only
 * rendered copies, without impulses, resource loss or extra collision events. */
export function separateRenderCars(
  cars: Car[],
  track?: Track,
  clock = 0,
): Car[] {
  const solid = (c: Car) =>
    !c.finished && c.ghostTime <= 0 && c.resetTime <= 0 && c.id !== "ghost";
  const active = cars.filter(solid);
  let overlaps = false;
  for (let i = 0; i < active.length && !overlaps; i++)
    for (let j = i + 1; j < active.length; j++)
      if (kartContact(active[i], active[j])) {
        overlaps = true;
        break;
      }
  if (!overlaps && !track?.movingObstacles?.length) return cars;
  const visible = cars.map((c) => ({ ...c }));
  const bodies = visible.filter(solid);
  const constrain = track?.movingObstacles?.length
    ? (c: Car) => {
        constrainMovingObstacles(c, track, clock);
      }
    : undefined;
  if (constrain) for (const c of bodies) constrain(c);
  resolveKartContacts(bodies, constrain);
  return visible;
}
