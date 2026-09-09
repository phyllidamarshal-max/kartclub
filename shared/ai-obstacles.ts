import { movingObstaclesAt, movingObstacleClearance, type MovingObstacleSpec } from './moving-obstacles.ts';
import { nearestTrack, trackPoint, type Track } from './track.ts';

/** Sample the passage and arrival uncertainty with the actual rotating capsule. */
export function predictObstaclePassage(spec: MovingObstacleSpec, track: Track, clock: number, eta: number, speed: number) {
  const crossing = nearestTrack(spec.x, spec.z, track);
  const reach = spec.radius + 2.5;
  return [-reach, 0, reach].flatMap(along => {
    const p = trackPoint(crossing.t + along / track.length, track);
    return [-.18, 0, .18].map(uncertainty => ({
      p,
      pose: movingObstaclesAt({ movingObstacles: [spec] },
        clock + Math.max(0, eta + along / Math.max(speed, 12) + uncertainty))[0],
    }));
  });
}

export function obstaclePassageClearance(samples: ReturnType<typeof predictObstaclePassage>, lane: number) {
  return Math.min(...samples.map(({ p, pose }) => movingObstacleClearance({
    x: p.x + Math.cos(p.heading) * lane,
    z: p.z - Math.sin(p.heading) * lane,
    heading: p.heading,
  }, pose).distance));
}
