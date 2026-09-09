import type { Car } from "../../shared/race.ts";
import type { ItemWorld } from "../../shared/items.ts";
import type { ItemVfxEvent } from "../../shared/vfx-events.ts";

export class ItemVfxReader {
  private cursor: number | null = null;
  read(world: ItemWorld | null, active: boolean): readonly ItemVfxEvent[] {
    if (!world) return [];
    const sequence = world.vfx?.sequence ?? 0;
    const previous = this.cursor;
    this.cursor = Math.max(previous ?? 0, sequence);
    if (previous === null || !active) return [];
    return (world.vfx?.events ?? []).filter(
      (e) =>
        e.seq > previous &&
        e.time <= world.time + 0.001 &&
        world.time - e.time <= 0.6,
    );
  }
  reset() {
    this.cursor = null;
  }
}
export interface CollisionCue {
  car: Car;
  kind: Car["lastCollisionKind"];
  strength: number;
  loss: number;
}
export class CollisionVfxReader {
  private counts = new Map<string, number>();
  read(cars: readonly Car[], active: boolean): CollisionCue[] {
    const cues: CollisionCue[] = [],
      ids = new Set(cars.map((c) => c.id));
    for (const id of this.counts.keys())
      if (!ids.has(id)) this.counts.delete(id);
    for (const car of cars) {
      const previous = this.counts.get(car.id);
      this.counts.set(car.id, Math.max(previous ?? 0, car.collisionCount));
      if (
        active &&
        previous !== undefined &&
        car.collisionCount > previous &&
        car.id !== "ghost"
      )
        cues.push({
          car,
          kind: car.lastCollisionKind,
          strength: car.lastCollisionStrength,
          loss: car.lastEnergyLoss,
        });
    }
    return cues;
  }
  reset() {
    this.counts.clear();
  }
}
