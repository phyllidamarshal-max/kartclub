import type { Challenge } from "./gameplay.ts";
import type { Car } from "./race.ts";

export const CAREER_EVENT_VERSION = "events-v3";
export type EventKind =
  | "race"
  | "sectors"
  | "attack"
  | "pursuit"
  | "technique"
  | "defense"
  | "clean"
  | "endurance"
  | "final";
export interface ChallengeMetrics {
  finished: boolean;
  time: number;
  rank: number;
  collisions: number;
  cleanDrifts: number;
  miniUses: number;
  driftChains: number;
  usefulHits: number;
  blocks: number;
  failed: boolean;
  techniqueCorners?: number;
}
export function challengeGrade(q: Challenge, m: ChallengeMetrics): number {
  if (
    !m.finished ||
    m.failed ||
    !Number.isFinite(m.time) ||
    m.time < 0 ||
    (q.limit > 0 && m.time > q.limit) ||
    (q.rank > 0 && (m.rank < 1 || m.rank > q.rank))
  )
    return 0;
  if (
    q.event === "technique" &&
    ((m.techniqueCorners ?? 0) < (q.techniqueCorners?.length ?? 2) ||
      m.miniUses < 2)
  )
    return 0;
  if (q.event === "attack" && m.usefulHits < 1) return 0;
  if (q.event === "clean" && m.collisions > 8) return 0;
  const skill =
    q.event === "attack"
      ? m.usefulHits >= 3
      : q.event === "defense"
        ? m.blocks >= 1
        : q.event === "technique" || q.event === "endurance"
          ? m.driftChains >= 1
          : q.event === "final"
            ? m.usefulHits >= 2 || m.blocks >= 2
            : m.collisions <= 2;
  return 1 + Number(m.time <= q.gold) + Number(skill);
}

/** A career-only clock. Reversing/resetting never restores elapsed gate time. */
export class ChallengeRun {
  gate = 1;
  failed = false;
  private gateStarted = 0;
  private previousTime = 0;
  readonly completedCorners: number[] = [];
  private observedDrifts = 0;
  constructor(readonly challenge: Challenge) {}
  observeTechnique(car: Pick<Car, "progress" | "cleanDrifts">) {
    const gained = car.cleanDrifts > this.observedDrifts;
    this.observedDrifts = car.cleanDrifts;
    if (!gained || this.failed) return;
    const t = ((car.progress % 1) + 1) % 1;
    this.challenge.techniqueCorners?.forEach((corner, index) => {
      // A clean recovery may occur just past the bend. Each distinct target counts once.
      const offset = ((t - corner + 1.5) % 1) - 0.5;
      const range = this.challenge.techniqueRanges?.[index];
      const inRange = range
        ? (t - range.start + 1) % 1 <= range.end - range.start
        : offset >= -0.035 && offset <= 0.085;
      if (inRange && !this.completedCorners.includes(index))
        this.completedCorners.push(index);
    });
  }
  releaseRemaining(elapsed: number) {
    return Math.max(0, (this.challenge.startDelay ?? 0) - elapsed);
  }
  remaining(elapsed: number) {
    const budget = this.challenge.sectorSeconds?.[this.gate - 1];
    return budget === undefined
      ? null
      : Math.max(0, this.gateStarted + budget - elapsed);
  }
  update(before: number, progress: number, elapsed: number) {
    if (this.failed) return;
    const budgets = this.challenge.sectorSeconds;
    if (!budgets) {
      this.previousTime = elapsed;
      return;
    }
    while (
      this.gate <= budgets.length &&
      progress >= this.gate / 3 &&
      progress > before
    ) {
      const fraction = Math.max(
        0,
        Math.min(1, (this.gate / 3 - before) / (progress - before)),
      );
      const crossed =
        this.previousTime + (elapsed - this.previousTime) * fraction;
      if (crossed > this.gateStarted + budgets[this.gate - 1] + 1e-6) {
        this.failed = true;
        return;
      }
      this.gateStarted = crossed;
      this.gate++;
    }
    if (
      this.gate <= budgets.length &&
      elapsed > this.gateStarted + budgets[this.gate - 1] + 1e-6
    )
      this.failed = true;
    this.previousTime = elapsed;
  }
}
