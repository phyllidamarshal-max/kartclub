import { raceDeadline } from "../shared/rules.ts";
import type { Car } from "../shared/race.ts";
import type { RaceMode as DrivingMode } from "../shared/gameplay.ts";

export type RaceMode = "lobby" | "solo" | "multi";

export function soloSessionDeadline(
  cars: readonly Car[],
  session: {
    trackId: string;
    laps: number;
    raceMode: DrivingMode;
    training?: boolean;
    limit?: number;
  },
) {
  // A driver's practice pace must not be constrained by a race benchmark.
  if (session.training || session.raceMode === "practice") return Infinity;
  return Math.min(
    session.limit || Infinity,
    raceDeadline(
      cars,
      session.raceMode === "race" || session.raceMode === "items",
      session.trackId,
      session.laps,
    ),
  );
}

export function soloRaceComplete(
  cars: readonly { id: string; finished: boolean }[],
  elapsed: number,
  deadline: number,
  competitive: boolean,
) {
  return (
    elapsed >= deadline ||
    (competitive
      ? cars.length > 0 && cars.every((car) => car.finished)
      : cars.some((car) => car.id === "local" && car.finished))
  );
}

export function canOpenPause(mode: RaceMode, soloDone: boolean, modal: string) {
  return mode !== "lobby" && !modal && (mode !== "solo" || !soloDone);
}

export function reconnectDeadline(
  current: number | null,
  now: number,
  duration = 10_000,
) {
  return current ?? now + duration;
}
