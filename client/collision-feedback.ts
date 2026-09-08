import type { Car } from "../shared/race.ts";
type CollisionCar = Pick<
  Car,
  "collisionCount" | "lastCollisionStrength" | "lastCollisionKind"
>;

export class CollisionSoundEvents {
  private heard = 0;
  reset(count = 0) {
    this.heard = count;
  }
  take(
    local: CollisionCar,
    authoritative: CollisionCar | null,
    multiplayer: boolean,
    active: boolean,
  ) {
    // Online prediction can roll back. Only confirmed snapshots own online cues.
    const car = multiplayer ? authoritative : local;
    if (!car) return null;
    const changed = car.collisionCount > this.heard;
    this.heard = car.collisionCount;
    return active && changed
      ? { strength: car.lastCollisionStrength, kind: car.lastCollisionKind }
      : null;
  }
}
