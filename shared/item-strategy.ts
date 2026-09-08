import type { Item } from "./items.ts";
import type { Car } from "./race.ts";
import { DEFAULT_TRACK, type Track } from "./track.ts";

const ITEMS: readonly Item[] = ["boost", "shield", "missile", "trap"];

function active(car: Readonly<Car>) {
  return (
    !car.finished && car.resetTime <= 0 && car.ghostTime <= 0 && car.speed >= 0
  );
}

/** Signed, unwrapped race metres. Shortcut progress is mapped onto the main lap
 * by physics, so this stays comparable across branches and never wraps a lapped
 * car into a nearby rival. It intentionally is not a Euclidean shortcut chord. */
export function itemRaceGap(
  car: Readonly<Car>,
  rival: Readonly<Car>,
  track: Track,
): number {
  return (rival.progress - car.progress) * track.length;
}

/** Selects one of the four items from rank and front/back race gaps. */
export function chooseItem(
  seed: number,
  car: Car,
  cars: readonly Car[],
  track: Track = DEFAULT_TRACK,
): { item: Item; seed: number } {
  const field = cars
    .filter(active)
    .sort(
      (a, b) =>
        b.progress - a.progress || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const rank = Math.max(
    0,
    field.findIndex((candidate) => candidate.id === car.id),
  );
  const rankCatchup = field.length > 1 ? rank / (field.length - 1) : 0;
  const gaps = field
    .filter((candidate) => candidate.id !== car.id)
    .map((candidate) => itemRaceGap(car, candidate, track));
  const gap = Math.min(...gaps.filter((gap) => gap > 0));
  const behind = Math.min(...gaps.filter((gap) => gap < 0).map((gap) => -gap));
  const gapCatchup = Number.isFinite(gap)
    ? Math.max(0, Math.min(1, (gap - 12) / 100))
    : 0;
  const catchup = Math.max(
    0,
    Math.min(1, rankCatchup * 0.55 + gapCatchup * 0.45),
  );
  const pressure = Math.max(0, Math.min(1, (50 - behind) / 50));
  const weights = [
    18 + 22 * catchup,
    38 - 18 * catchup + 10 * pressure,
    14 + 20 * catchup,
    30 - 14 * catchup + 8 * pressure,
  ];
  const nextSeed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  let roll =
    (nextSeed / 0x100000000) * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < ITEMS.length; index++) {
    roll -= weights[index];
    if (roll < 0) return { item: ITEMS[index], seed: nextSeed };
  }
  return { item: "trap", seed: nextSeed };
}
