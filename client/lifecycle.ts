export type RaceMode = "lobby" | "solo" | "multi";

export function canOpenPause(mode: RaceMode, soloDone: boolean, modal: string) {
  return mode !== "lobby" && !modal && (mode !== "solo" || !soloDone);
}
