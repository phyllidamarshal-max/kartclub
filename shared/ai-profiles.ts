import type { Difficulty } from "./gameplay.ts";

export type AiPersonality = "stable" | "technical" | "attacking";
export type AiTier = "novice" | "intermediate" | "expert";
export interface AiProfile {
  readonly name: AiPersonality;
  readonly tier: AiTier;
  /** Requested cruising pace; this never changes the vehicle's legal speed limit. */
  readonly pace: number;
  readonly cornerRate: number;
  readonly overtakeOffset: number;
  readonly trafficHorizon: number;
  readonly boostCurve: number;
  readonly driftMinSpeed: number;
  readonly chooseShortcut: boolean;
}
const names: readonly AiPersonality[] = ["stable", "technical", "attacking"];
function tierProfiles(difficulty: Difficulty): readonly AiProfile[] {
  return names.map((name) =>
    Object.freeze({
      name,
      tier:
        difficulty === "easy"
          ? "novice"
          : difficulty === "normal"
            ? "intermediate"
            : "expert",
      pace: difficulty === "easy" ? 0.92 : difficulty === "normal" ? 0.99 : 1,
      cornerRate:
        difficulty === "easy" ? 1.1 : difficulty === "normal" ? 1.4 : 1.55,
      overtakeOffset: name === "stable" ? 3.5 : name === "attacking" ? 2.8 : 3,
      trafficHorizon: name === "stable" ? 28 : name === "attacking" ? 22 : 24,
      boostCurve: name === "stable" ? 0.019 : 0.021,
      driftMinSpeed: difficulty === "hard" ? 21 : 24,
      chooseShortcut: name === "attacking" && difficulty !== "easy",
    } satisfies AiProfile),
  );
}
const profiles: Record<Difficulty, readonly AiProfile[]> = {
  easy: tierProfiles("easy"),
  normal: tierProfiles("normal"),
  hard: tierProfiles("hard"),
};

/** Slot and the pre-race tier are the only inputs; never consult player rank/gap. */
export function aiProfile(slot: number, difficulty: Difficulty): AiProfile {
  const index = Number.isFinite(slot) ? ((Math.trunc(slot) % 3) + 3) % 3 : 0;
  return profiles[difficulty][index];
}

