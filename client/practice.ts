import { spawnCar, type Car } from "../shared/race.ts";
import { trackPoint, angleDiff, type Track } from "../shared/track.ts";

export function practiceCorners(track: Track): number[] {
  const candidates = Array.from({ length: 80 }, (_, i) => {
    const t = (i + 0.5) / 80,
      a = trackPoint(t - 0.018, track),
      b = trackPoint(t + 0.018, track);
    return { t, turn: Math.abs(angleDiff(b.heading, a.heading)) };
  }).sort((a, b) => b.turn - a.turn);
  const selected: number[] = [];
  for (const { t } of candidates) {
    if (
      selected.every(
        (x) => Math.min(Math.abs(t - x), 1 - Math.abs(t - x)) > 0.12,
      )
    )
      selected.push(t);
    if (selected.length === 5) break;
  }
  return selected.sort((a, b) => a - b);
}
export class CornerPractice {
  readonly startProgress: number;
  readonly endProgress: number;
  readonly corner: number;
  attempts = 0;
  constructor(
    readonly track: Track,
    index: number,
  ) {
    const corners = practiceCorners(track);
    this.corner = Math.max(
      0,
      Math.min(corners.length - 1, Math.floor(index) || 0),
    );
    this.startProgress = corners[this.corner] - 0.055;
    this.endProgress = corners[this.corner] + 0.075;
  }
  restart(): Car {
    this.attempts++;
    const c = spawnCar(0, "local", this.track),
      p = trackPoint(this.startProgress, this.track);
    Object.assign(c, {
      x: p.x,
      z: p.z,
      heading: p.heading,
      lastT: p.t,
      progress: this.startProgress,
      spawnProgress: this.startProgress,
      resetProgress: this.startProgress,
      checkpoint: Math.floor(this.startProgress * 12),
      lap: Math.max(0, Math.floor(this.startProgress)),
      lastX: p.x,
      lastZ: p.z,
    });
    return c;
  }
  complete(c: Car) {
    return c.progress >= this.endProgress;
  }
}
