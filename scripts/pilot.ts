import {
  nearestTrack,
  trackPoint,
  angleDiff,
  TRACK_LENGTH,
} from "../shared/track.ts";
import type { Car, Input } from "../shared/race.ts";
// A test driver only: uses the same inputs a player sends, never writes position or progress.
export function pilot(c: Car): Input {
  const p = nearestTrack(c.x, c.z),
    look = trackPoint(p.t + (9 + Math.abs(c.speed) * 0.3) / TRACK_LENGTH);
  const target = Math.atan2(look.x - c.x, look.z - c.z),
    error = angleDiff(target, c.heading);
  const curvature = Math.abs(angleDiff(look.heading, p.heading));
  const speed = curvature > 0.38 ? 22 : curvature > 0.2 ? 30 : 40;
  return {
    throttle: c.speed < speed ? 1 : -0.4,
    steer: Math.max(-1, Math.min(1, error * 2.1)),
    drift: false,
    boost: c.energy >= 100 && Math.abs(error) < 0.05,
    reset: false,
  };
}
