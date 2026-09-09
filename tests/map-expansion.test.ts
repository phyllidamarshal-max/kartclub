import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRACKS,
  trackPoint,
  trackWidth,
  nearestTrack,
  angleDiff,
} from "../shared/track.ts";
import { mapProfile } from "../shared/map-profiles.ts";
import {
  movingObstaclesAt,
  MOVING_OBSTACLE_KART_RADIUS,
} from "../shared/moving-obstacles.ts";
import {
  shortcutMetrics,
  shortcutTrial,
} from "../scripts/measure-shortcut-risk.ts";

test("ten original additions preserve the nine original map ids and ordering", () => {
  assert.deepEqual(
    TRACKS.slice(0, 9).map((t) => t.id),
    [
      "coast",
      "coast-harbor",
      "coast-breakwater",
      "city",
      "city-factory",
      "city-nightshift",
      "mountain",
      "mountain-pass",
      "mountain-summit",
    ],
  );
  assert.equal(TRACKS.filter((t) => mapProfile(t.id).isNew).length, 10);
  assert.equal(
    new Set(TRACKS.map((t) => JSON.stringify(t.points.map((p) => [p.x, p.z]))))
      .size,
    19,
  );
});
for (const track of TRACKS.filter((t) => t.layout === "ab"))
  test(`${track.id}: both real route choices finish with consistent joins`, () => {
    const metrics = shortcutMetrics(track);
    assert.ok(metrics.minRadius >= 20, JSON.stringify(metrics));
    const a = shortcutTrial(track, false),
      b = shortcutTrial(track, true);
    assert.ok(a.finished && b.finished, JSON.stringify({ a, b }));
    assert.ok(!a.selected && b.selected, JSON.stringify({ a, b }));
    assert.ok(!a.reset && !b.reset);
    assert.equal(a.collisions + b.collisions, 0);
    assert.equal(b.branch, "main");
  });
test("new traffic crossings have visible room for a full kart to pass throughout each cycle", () => {
  assert.equal(TRACKS.filter((t) => t.movingObstacles?.length).length, 7);
  for (const track of TRACKS)
    for (const spec of track.movingObstacles ?? []) {
      assert.ok(
        Object.isFrozen(track.movingObstacles) && Object.isFrozen(spec),
      );
      const centre = nearestTrack(spec.x, spec.z, track);
      assert.ok(centre.t * track.length > 100);
      for (let i = 0; i < 48; i++) {
        const pose = movingObstaclesAt(
          { movingObstacles: [spec] },
          (spec.period * i) / 48,
        )[0];
        const p = nearestTrack(pose.x, pose.z, track);
        const half = trackWidth(p.t, track) / 2;
        if (spec.kind !== 'sheep' && spec.kind !== 'deer') assert.ok(
          Math.abs(p.lateral) + spec.radius < half,
          `${spec.id} stays on marked road`,
        );
        assert.ok(
          half + Math.abs(p.lateral) - spec.radius >
            2 * MOVING_OBSTACLE_KART_RADIUS + 0.5,
          `${spec.id} never seals road`,
        );
      }
      const a = trackPoint(centre.t - 35 / track.length, track),
        b = trackPoint(centre.t + 35 / track.length, track);
      assert.ok(
        Math.abs(angleDiff(a.heading, b.heading)) < 0.09,
        `${spec.id} crossing must be visible on a straight`,
      );
    }
});
