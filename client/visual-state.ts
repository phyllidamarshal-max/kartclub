import { DRIVING_CONFIG } from "../shared/driving-config.ts";
import type { Car } from "../shared/race.ts";
import type { Account, Snapshot } from "../shared/protocol.ts";

/** Read-only presentation. Charge, inventory and an active boost are independent resources. */
export function nitroDisplay(car: Car, paused = false) {
  const capacity = DRIVING_CONFIG.energy.capacity;
  const bottleCapacity = DRIVING_CONFIG.nitro.capacity;
  const remaining =
    car.finished || car.resetTime > 0 ? 0 : Math.max(0, car.boostTime);
  const state =
    remaining > 0
      ? "releasing"
      : car.storedNitro >= bottleCapacity
        ? "full"
        : car.energy >= capacity
          ? "collect"
          : "charging";
  return {
    state,
    energy: car.energy,
    capacity,
    bottles: car.storedNitro,
    bottleCapacity,
    remaining,
    releaseRatio: Math.min(1, remaining / DRIVING_CONFIG.nitro.duration),
    paused: paused && remaining > 0,
    interrupted: car.energyLockTime > 0 && !car.finished,
    usable:
      car.storedNitro > 0 &&
      !car.finished &&
      car.resetTime <= 0 &&
      !paused &&
      (remaining <= 0 || remaining <= DRIVING_CONFIG.nitro.buffer),
  } as const;
}

export interface ClaimConfirmation {
  id: string;
  matchId: string;
  amount: number;
}

/** Result records, allocation and wallet credit have different sources of truth. */
export function rewardDisplay(
  snapshot: Snapshot,
  playerId: string,
  account: Account | null,
  confirmation?: ClaimConfirmation,
) {
  const result = snapshot.results.find((entry) => entry.id === playerId);
  const pending = account?.pending.find(
    (entry) => entry.matchId === snapshot.raceId,
  );
  const confirmed =
    confirmation?.id === account?.id &&
    confirmation?.matchId === snapshot.raceId &&
    Number.isSafeInteger(confirmation?.amount) &&
    confirmation!.amount >= 0;
  const audit =
    snapshot.phase === "cancelled" || snapshot.free
      ? "not-applicable"
      : snapshot.phase !== "finished"
        ? "pending"
        : snapshot.resultDigest
          ? "recorded"
          : "unavailable";
  const kind =
    snapshot.phase === "cancelled"
      ? "cancelled"
      : snapshot.free
        ? "free"
        : snapshot.phase !== "finished"
          ? "pending"
          : confirmed
            ? "credited"
            : pending
              ? "claimable"
              : !result
                ? "unavailable"
                : result.award > 0
                  ? "allocated"
                  : "none";
  return {
    kind,
    audit,
    amount:
      kind === "cancelled" || kind === "free" || kind === "none"
        ? 0
        : kind === "pending" || kind === "unavailable"
          ? null
          : confirmed
            ? confirmation!.amount
            : (pending?.amount ?? result?.award ?? null),
    balance: account?.pons ?? null,
  } as const;
}
