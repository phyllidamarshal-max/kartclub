import type { Difficulty } from "../../shared/gameplay.ts";
import type { ItemWorld } from "../../shared/items.ts";
import type { Car } from "../../shared/race.ts";
import { angleDiff, trackPoint, type Track } from "../../shared/track.ts";

const distance = (a: Pick<Car, "x" | "z">, b: Pick<Car, "x" | "z">) =>
  Math.hypot(a.x - b.x, a.z - b.z);

function canRace(car: Readonly<Car>) {
  return !car.finished && car.resetTime <= 0 && car.ghostTime <= 0;
}

function validMissileTarget(
  car: Readonly<Car>,
  rival: Readonly<Car>,
  track: Track,
) {
  return (
    rival.id !== car.id &&
    canRace(rival) &&
    rival.progress > car.progress &&
    distance(car, rival) < 160 &&
    Math.abs(
      trackPoint(rival.lastT, track).y - trackPoint(car.lastT, track).y,
    ) < 5
  );
}

function hasTrapThreat(car: Readonly<Car>, world: ItemWorld) {
  return world.traps.some(
    (trap) =>
      trap.owner !== car.id &&
      trap.ttl > 0 &&
      Math.hypot(trap.x - car.x, trap.z - car.z) < 12,
  );
}

function approachingUsableBox(
  car: Readonly<Car>,
  track: Track,
  world: ItemWorld,
) {
  const state = world.players[car.id];
  const roadY = trackPoint(car.lastT, track).y;
  return world.boxes.some((box) => {
    const dx = box.x - car.x;
    const dz = box.z - car.z;
    const forward = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const side = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    return (
      forward > 2.5 &&
      Math.hypot(dx, dz) <= 38 &&
      Math.abs(side) <= track.width / 2 + 2 &&
      Math.abs(box.y - roadY) < 3 &&
      box.readyAt <= world.time &&
      state.pickedLaps[box.band] < Math.floor(car.progress)
    );
  });
}

function hasPursuer(car: Readonly<Car>, rivals: readonly Car[]) {
  return rivals.some(
    (rival) =>
      rival.id !== car.id &&
      canRace(rival) &&
      rival.progress < car.progress &&
      car.progress - rival.progress < 0.08 &&
      distance(car, rival) < 45,
  );
}

function atChokePoint(
  car: Readonly<Car>,
  track: Track,
  difficulty: Difficulty,
) {
  if (difficulty === "easy" || track.width > 12) return false;
  const here = trackPoint(car.lastT, track);
  const ahead = trackPoint(car.lastT + 18 / track.length, track);
  return Math.abs(angleDiff(ahead.heading, here.heading)) > 0.28;
}

/**
 * Chooses an item button state without consuming items or changing race state.
 * A held engine-side button always receives a release frame before another use.
 */
export function aiItemInput(
  c: Readonly<Car>,
  track: Track,
  difficulty: Difficulty,
  rivals: readonly Car[],
  world: ItemWorld | null | undefined,
  safeBoost: boolean,
): boolean {
  if (!world || !canRace(c)) return false;
  const state = world.players[c.id];
  if (!state || state.pressed || !state.held) return false;

  switch (state.held) {
    case "missile":
      return rivals.some((rival) => validMissileTarget(c, rival, track));
    case "shield":
      return (
        state.shield <= 0 &&
        (world.missiles.some(
          (missile) => missile.target === c.id && missile.ttl > 0,
        ) ||
          hasTrapThreat(c, world) ||
          approachingUsableBox(c, track, world))
      );
    case "boost":
      return safeBoost && c.boostTime <= 0;
    case "trap":
      return hasPursuer(c, rivals) || atChokePoint(c, track, difficulty);
  }
}

