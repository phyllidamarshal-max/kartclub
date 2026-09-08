import { DRIVING_CONFIG as CFG } from "./driving-config.ts";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Live drift quality from 0 (invalid) to 1 (ideal). */
export function driftEfficiency(
  speed: number,
  slipAngle: number,
  duration: number,
): number {
  if (
    ![speed, slipAngle, duration].every(Number.isFinite) ||
    speed < CFG.vehicle.maxSpeed * CFG.drift.minSpeedRatio ||
    duration < 0
  )
    return 0;
  const angle = Math.abs(slipAngle);
  if (angle <= CFG.drift.angleMin || angle >= CFG.drift.angleMax) return 0;
  const angleQuality = Math.min(
    (angle - CFG.drift.angleMin) /
      (CFG.drift.anglePeak - CFG.drift.angleMin),
    (CFG.drift.angleMax - angle) /
      (CFG.drift.angleMax - CFG.drift.anglePeak),
  );
  const stability =
    CFG.energy.initialEfficiency +
    (1 - CFG.energy.initialEfficiency) *
      clamp01(duration / CFG.energy.settleTime);
  return clamp01(angleQuality * stability * clamp01(speed / CFG.vehicle.maxSpeed));
}
