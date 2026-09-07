export type RaceMode = "lobby" | "solo" | "multi";

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
