export type RaceMode = "lobby" | "solo" | "multi";

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
