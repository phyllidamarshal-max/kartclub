import type { Difficulty } from "./gameplay.ts";
import {
  incomingThreat,
  missileImpactTime,
  selectMissileTarget,
  type ItemWorld,
} from "./items.ts";
import { itemRaceGap } from "./item-strategy.ts";
import type { Car } from "./race.ts";
import { angleDiff, continuousTrack, trackPoint, type Track } from "./track.ts";

function canRace(car: Readonly<Car>) {
  return !car.finished && car.resetTime <= 0 && car.ghostTime <= 0;
}

function localPosition(car: Readonly<Car>, point: { x: number; z: number }) {
  const dx = point.x - car.x;
  const dz = point.z - car.z;
  return {
    forward: dx * Math.sin(car.heading) + dz * Math.cos(car.heading),
    side: dx * Math.cos(car.heading) - dz * Math.sin(car.heading),
  };
}

function hasTrapThreat(car: Readonly<Car>, world: ItemWorld, track: Track) {
  return world.traps.some((trap) => {
    if (trap.owner === car.id || trap.ttl <= 0) return false;
    const { forward, side } = localPosition(car, trap);
    const arrival = Math.max(0, forward) / Math.max(12, car.speed);
    const arming = Math.max(0, trap.ttl - 14.3);
    return (
      forward >= -1 &&
      forward <= 14 &&
      Math.abs(side) <= 3.25 &&
      arming <= arrival &&
      arrival < trap.ttl &&
      world.players[car.id].hitProtection <= arrival &&
      (trap.y === undefined ||
        Math.abs(
          continuousTrack(car.x, car.z, car.lastT, track, car.routeBranch).y -
            trap.y,
        ) < 3)
    );
  });
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
    const { forward, side } = localPosition(car, box);
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

function hasPursuer(car: Readonly<Car>, rivals: readonly Car[], track: Track) {
  return rivals.some((rival) => {
    if (
      rival.id === car.id ||
      !canRace(rival) ||
      rival.progress >= car.progress ||
      itemRaceGap(car, rival, track) <= -65
    )
      return false;
    const { forward, side } = localPosition(car, rival);
    return (
      forward < -2 &&
      forward > -45 &&
      Math.abs(side) <= Math.min(5, track.width / 2)
    );
  });
}

function shouldFireMissile(
  car: Readonly<Car>,
  rivals: readonly Car[],
  track: Track,
  world: ItemWorld,
) {
  const target = selectMissileTarget(car, rivals, track);
  if (!target) return false;
  const targetState = world.players[target.id];
  const protection = targetState
    ? Math.max(targetState.shield, targetState.hitProtection)
    : 0;
  const arrival = missileImpactTime({ x: car.x, z: car.z, ttl: 4 }, target);
  if (arrival === null) return false;
  return protection <= arrival || approachingUsableBox(car, track, world);
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
      return shouldFireMissile(c, rivals, track, world);
    case "shield":
      return (
        state.shield <= 0 &&
        (incomingThreat(world, c) !== null ||
          hasTrapThreat(c, world, track) ||
          approachingUsableBox(c, track, world))
      );
    case "boost":
      return safeBoost && c.boostTime <= 0;
    case "trap":
      return hasPursuer(c, rivals, track) || atChokePoint(c, track, difficulty);
  }
}
