import type { Car } from "../shared/race.ts";
import {
  continuousTrack,
  angleDiff,
  type Point,
  type Track,
} from "../shared/track.ts";
import {
  movingObstaclesAt,
  movingObstacleClearance,
  type MovingObstacleSpec,
} from "../shared/moving-obstacles.ts";

export type ObstacleKind = MovingObstacleSpec["kind"] | "static";
export interface ObstacleWarning {
  id: string;
  kind: ObstacleKind;
  distance: number;
  direction: "left" | "right" | "rotating" | "waiting" | "fixed";
  risk: "watch" | "on-line";
}
type Projection = Point & {
  along: number;
  distance: number;
  branch: Car["routeBranch"];
};
function route(points: readonly Point[], closed: boolean) {
  let length = 0;
  const segments = points.slice(0, closed ? points.length : -1).map((a, i) => {
    const b = points[(i + 1) % points.length],
      start = length;
    const size = Math.hypot(b.x - a.x, b.z - a.z, b.y - a.y);
    length += size;
    return { a, b, start, size };
  });
  return { segments, length };
}
function project(
  x: number,
  z: number,
  path: ReturnType<typeof route>,
  branch: Car["routeBranch"],
  y?: number,
  seedT?: number,
): Projection | null {
  let best: Projection | null = null,
    score = Infinity;
  for (const { a, b, start, size } of path.segments) {
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const f = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    const px = a.x + dx * f,
      pz = a.z + dz * f,
      py = a.y + (b.y - a.y) * f;
    const t = (a.t + ((b.t - a.t + 1) % 1) * f) % 1;
    // Break exact crossing ties using continuity, preserving the occupied leg.
    const continuity =
      seedT === undefined
        ? 0
        : Math.abs(angleDiff(t * Math.PI * 2, seedT * Math.PI * 2)) * 1e-6;
    const distance = Math.hypot(x - px, z - pz),
      d = distance ** 2 + (y === undefined ? 0 : (y - py) ** 2) + continuity;
    if (d >= score) continue;
    score = d;
    best = {
      x: px,
      z: pz,
      y: py,
      t,
      heading: a.heading + angleDiff(b.heading, a.heading) * f,
      along: start + size * f,
      distance,
      branch,
    };
  }
  return best;
}
const cache = new WeakMap<Track, ReturnType<typeof indexTrack>>();
function indexTrack(track: Track) {
  const main = route(track.points, track.layout !== "ab"),
    shortcut = route(track.shortcut, false);
  const locate = (x: number, z: number, y?: number) => {
    const a = project(x, z, main, "main", y),
      b = project(x, z, shortcut, "shortcut", y);
    const score = (p: Projection) =>
      p.distance ** 2 + (y === undefined ? 0 : (p.y - y) ** 2);
    return b && (!a || score(b) + 0.01 < score(a)) ? b : a;
  };
  return {
    main,
    shortcut,
    entries: [
      ...(track.movingObstacles ?? []).map((spec) => ({
        id: spec.id,
        kind: spec.kind as ObstacleKind,
        spec,
        point: locate(spec.x, spec.z, spec.y),
        x: spec.x,
        z: spec.z,
        radius: spec.radius,
      })),
      ...track.obstacles.map((o, i) => ({
        ...o,
        id: `static-${i}`,
        kind: "static" as ObstacleKind,
        spec: undefined,
        point: locate(o.x, o.z),
      })),
    ],
  };
}

/** Advisory prediction on the present lateral line, following the occupied road. */
export function selectObstacleWarning(
  car: Car | null | undefined,
  track: Track,
  clock: number,
): ObstacleWarning | null {
  if (
    !car ||
    car.finished ||
    car.resetTime > 0 ||
    car.resetHeld ||
    !Number.isFinite(clock)
  )
    return null;
  const road = continuousTrack(car.x, car.z, car.lastT, track, car.routeBranch);
  if (
    !Number.isFinite(road.distance) ||
    Math.cos(angleDiff(car.heading, road.heading)) < 0.3
  )
    return null;
  let index = cache.get(track);
  if (!index) {
    index = indexTrack(track);
    cache.set(track, index);
  }
  const path = car.routeBranch === "shortcut" ? index.shortcut : index.main;
  // Use the continuity-selected point, never a global nearest-road snap for the kart.
  const current = project(
    road.x,
    road.z,
    path,
    car.routeBranch,
    road.y,
    road.t,
  );
  if (!current) return null;
  let best: ObstacleWarning | null = null;
  for (const item of index.entries) {
    const p = item.point;
    if (!p) continue;
    let distance = p.along - current.along;
    if (p.branch !== car.routeBranch) {
      // A shortcut rejoins the main road. Follow that exit, never its bypassed leg.
      if (car.routeBranch !== "shortcut" || p.branch !== "main") continue;
      const end = track.shortcut.at(-1)!;
      const exit = project(end.x, end.z, index.main, "main", end.y, end.t);
      if (!exit) continue;
      let afterExit = p.along - exit.along;
      if (track.layout !== "ab" && afterExit < -index.main.length / 2)
        afterExit += index.main.length;
      if (afterExit < 0) continue;
      distance = path.length - current.along + afterExit;
    } else if (
      car.routeBranch === "main" &&
      track.layout !== "ab" &&
      distance < -path.length / 2
    )
      distance += path.length;
    if (distance <= 1 || distance > 160 || (best && best.distance <= distance))
      continue;
    if (
      (p.x - car.x) * Math.sin(car.heading) +
        (p.z - car.z) * Math.cos(car.heading) <=
      0
    )
      continue;
    // Anchors must actually belong to this road, even when their sweep reaches far.
    const targetRoad = continuousTrack(p.x, p.z, p.t, track, p.branch);
    // Hills can change height considerably before arrival. Validate the obstacle
    // against its own connected road surface, not the kart's present elevation.
    if (item.spec && Math.abs(item.spec.y - targetRoad.y) > 3) continue;
    if (p.distance > targetRoad.roadWidth / 2 + item.radius) continue;
    const probe = {
      x: p.x + Math.cos(p.heading) * road.lateral,
      z: p.z - Math.sin(p.heading) * road.lateral,
      heading: p.heading,
    };
    let risk: ObstacleWarning["risk"] = "watch",
      direction: ObstacleWarning["direction"] = "fixed";
    if (item.spec) {
      const spec = item.spec,
        one = { movingObstacles: [spec] };
      const now = movingObstaclesAt(one, clock)[0];
      const lateralVelocity =
        now.vx * Math.cos(p.heading) - now.vz * Math.sin(p.heading);
      direction =
        Math.abs(now.yawRate) > 0.05
          ? "rotating"
          : Math.abs(lateralVelocity) < 0.1
            ? "waiting"
            : lateralVelocity > 0
              ? "right"
              : "left";
      const speed = Math.max(
        5,
        car.vx * Math.sin(road.heading) + car.vz * Math.cos(road.heading),
      );
      const eta = distance / speed;
      // A small arrival window covers estimation error; actual capsules include rotation.
      for (const offset of [-0.3, -0.15, 0, 0.15, 0.3]) {
        const pose = movingObstaclesAt(
          one,
          clock + Math.max(0, eta + offset),
        )[0];
        if (
          Math.abs(pose.y - p.y) < 3 &&
          movingObstacleClearance(probe, pose).distance < 0.7
        )
          risk = "on-line";
      }
    } else {
      // Static circles are only useful when intersecting the present kart line.
      const pose = movingObstaclesAt(
        {
          movingObstacles: [
            {
              id: item.id,
              kind: "shuttle",
              x: item.x,
              z: item.z,
              y: p.y,
              heading: p.heading,
              radius: item.radius,
              amplitude: 0,
              period: 0,
              phase: 0,
            },
          ],
        },
        0,
      )[0];
      if (movingObstacleClearance(probe, pose).distance >= 0.7) continue;
      risk = "on-line";
    }
    best = { id: item.id, kind: item.kind, distance, direction, risk };
  }
  return best;
}
