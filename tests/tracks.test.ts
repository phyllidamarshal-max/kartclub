import { test } from "node:test";
import assert from "node:assert/strict";
import * as tracks from "../shared/track.ts";
test("three match-specific circuits are distinct, closed and longer than legacy", () => {
  assert.equal(typeof tracks.getTrack, "function");
  for (const id of ["coast", "city", "mountain"]) {
    const t = tracks.getTrack(id);
    assert.ok(t.length > 1100 && t.length < 2000);
    assert.deepEqual(tracks.trackPoint(0, t), tracks.trackPoint(1, t));
    const p = tracks.trackPoint(0.37, t);
    assert.ok(tracks.nearestTrack(p.x, p.z, t).distance < 2);
  }
  assert.notEqual(
    tracks.getTrack("city").points,
    tracks.getTrack("coast").points,
  );
  assert.throws(() => tracks.getTrack("fake"));
});
test("mountain has elevation, obstacles and a driveable shortcut preserving canonical progress", () => {
  assert.equal(typeof tracks.getTrack, "function");
  const t = tracks.getTrack("mountain");
  assert.ok(Math.max(...t.points.map((p) => p.y)) > 12);
  assert.ok(t.obstacles.length > 0);
  assert.ok(t.shortcut.length > 5);
  const p = t.shortcut[Math.floor(t.shortcut.length / 2)];
  const n = tracks.nearestTrack(p.x, p.z, t);
  assert.ok(n.distance < 1);
  assert.ok(Math.abs(n.t - p.t) < 0.005);
});
