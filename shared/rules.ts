import { EMPTY_INPUT, sanitizeInput, type Car, type Input } from "./race.ts";
import { COURSE_DESIGNS } from "./route-course.ts";
export const VERSIONS = Object.freeze({
  trackVersion: "routes-0.9.0",
  rulesVersion: "kart-rules-0.8.0",
  performanceClass: "standard-v1",
  assistClass: "manual-v1",
});
export interface RecordContext {
  trackVersion: string;
  rulesVersion: string;
  performanceClass: string;
  assistClass: string;
}
export const RACE_RULES = Object.freeze({
  hardLimit: 300,
  finishWindow: 20,
  readyTimeout: 30,
  friendRoomTimeout: 600,
  reconnectSeconds: 10,
  timeResolution: 0.0001,
});
export function recordKey(
  trackId: string,
  overrides: Partial<RecordContext> = {},
) {
  const v = { ...VERSIONS, ...overrides };
  return [
    trackId,
    v.trackVersion,
    v.rulesVersion,
    v.performanceClass,
    v.assistClass,
  ].join(":");
}
// Finished times are immutable, so subsequent finishers cannot extend the window.
// Noncompetitive timed races keep a hard cap without the first-finisher window.
// Unbounded local practice/tutorial sessions are handled by the client lifecycle.
export function raceHardLimit(trackId = "tide-coast-v1", laps = 3) {
  const course = COURSE_DESIGNS[trackId];
  if (!course) return RACE_RULES.hardLimit;
  const count = Number.isFinite(laps)
    ? Math.max(1, Math.min(4, Math.floor(laps)))
    : 3;
  return ((course.minutes * 60 * count) / 3) * 1.5;
}
export function raceDeadline(
  cars: readonly Car[],
  competitive = true,
  trackId?: string,
  laps = 3,
) {
  const hardLimit = raceHardLimit(trackId, laps);
  return competitive
    ? Math.min(
        hardLimit,
        ...cars
          .filter((c) => c.finished)
          .map((c) => c.time + RACE_RULES.finishWindow),
      )
    : hardLimit;
}
export function classify(
  cars: readonly Car[],
  progressAt: Readonly<Record<string, number>> = {},
) {
  const bucket = (c: Car) => Math.round(c.time / RACE_RULES.timeResolution);
  const sorted = [...cars].sort((a, b) =>
    a.finished !== b.finished
      ? a.finished
        ? -1
        : 1
      : a.finished
        ? bucket(a) - bucket(b) || a.id.localeCompare(b.id)
        : b.progress - a.progress ||
          (progressAt[a.id] ?? a.time) - (progressAt[b.id] ?? b.time) ||
          a.id.localeCompare(b.id),
  );
  let rank = 0,
    prior = -Infinity;
  return sorted.map((car, i) => {
    if (car.finished && bucket(car) !== prior) {
      rank = i + 1;
      prior = bucket(car);
    }
    return { car, rank: car.finished ? rank : 0 };
  });
}
export function acceptSnapshot(
  roomId: string,
  lastTick: number,
  s: { roomId: string; serverTick: number },
) {
  return (
    s.roomId === roomId &&
    Number.isSafeInteger(s.serverTick) &&
    s.serverTick > lastTick
  );
}
// Keep physical input continuous while retaining short action edges between ticks.
export class InputInbox {
  seq = 0;
  lastAt = -Infinity;
  private input: Input = { ...EMPTY_INPUT };
  private pending = { boost: 0, reset: 0, item: 0 };
  private output = { boost: false, reset: false, item: false };
  private throttleEdges = 0;
  private throttleOutput = false;
  push(packet: Record<string, unknown>, serverTick: number, now: number) {
    if (
      !Number.isSafeInteger(packet.seq) ||
      Number(packet.seq) <= this.seq ||
      Number(packet.seq) > this.seq + 600
    )
      return false;
    if (
      packet.clientTick !== undefined &&
      (!Number.isSafeInteger(packet.clientTick) ||
        Number(packet.clientTick) < serverTick - 120 ||
        Number(packet.clientTick) > serverTick + 12)
    )
      return false;
    const next = sanitizeInput(packet);
    for (const k of ["boost", "reset", "item"] as const)
      if (next[k] && !this.input[k])
        this.pending[k] = Math.min(2, this.pending[k] + 1);
    if (next.throttle > 0 && this.input.throttle <= 0)
      this.throttleEdges = Math.min(2, this.throttleEdges + 1);
    this.input = next;
    this.seq = Number(packet.seq);
    this.lastAt = now;
    return true;
  }
  take(now: number): Input {
    if (now - this.lastAt > 250) {
      this.clear();
      return { ...EMPTY_INPUT };
    }
    const result = { ...this.input };
    for (const k of ["boost", "reset", "item"] as const) {
      if (this.pending[k] > 0) {
        if (this.output[k]) result[k] = false;
        else {
          result[k] = true;
          this.pending[k]--;
        }
      }
      this.output[k] = !!result[k];
    }
    if (this.throttleEdges > 0) {
      if (this.throttleOutput) result.throttle = 0;
      else {
        result.throttle = Math.max(0.01, result.throttle);
        this.throttleEdges--;
      }
    }
    this.throttleOutput = result.throttle > 0;
    return result;
  }
  clear() {
    this.input = { ...EMPTY_INPUT };
    this.pending = { boost: 0, reset: 0, item: 0 };
    this.output = { boost: false, reset: false, item: false };
    this.lastAt = -Infinity;
    this.throttleEdges = 0;
    this.throttleOutput = false;
  }
}
