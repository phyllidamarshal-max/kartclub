import type { Car } from "../shared/race.ts";

export function sectorDuration(splits: readonly number[]): number | null {
  if (!splits.length) return null;
  for (let i = 0; i < splits.length; i++) {
    if (
      !Number.isFinite(splits[i]) ||
      splits[i] <= 0 ||
      (i > 0 && splits[i] <= splits[i - 1])
    )
      return null;
  }
  return splits.at(-1)! - (splits.at(-2) ?? 0);
}
export function sectorComparison(
  current: readonly number[],
  reference: readonly number[],
): number | null {
  const index = current.length - 1;
  if (index < 0 || reference[index] === undefined) return null;
  const currentDuration = sectorDuration(current),
    referenceDuration = sectorDuration(reference.slice(0, current.length));
  return currentDuration === null || referenceDuration === null
    ? null
    : currentDuration - referenceDuration;
}
export function drivingAdvice(c: Car): string {
  if (c.collisionCount >= 3) return "先减速入弯，减少碰撞";
  if (c.missedMini > c.miniUses) return "拉正后及时松按油门，抓住小喷窗口";
  if (c.driftAttempts > c.cleanDrifts * 2)
    return "减少过度转向，完成漂移后拉正";
  if (c.storedNitro > 0) return "出弯后使用已储存的氮气";
  return "保持干净走线，挑战更快的分段成绩";
}
