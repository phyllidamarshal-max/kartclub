import type { Car } from "../shared/race.ts";
import { angleDiff } from "../shared/track.ts";

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
