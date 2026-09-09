import { test } from "node:test";
import assert from "node:assert/strict";
import * as tracks from "../shared/track.ts";
test("three match-specific circuits are distinct, closed and longer than legacy", () => {
  assert.equal(typeof tracks.getTrack, "function");
  for (const id of ["coast", "city", "mountain"]) {
    const t = tracks.getTrack(id);
    assert.ok(t.length > 2400 && t.length < 3200);
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
test("nineteen selectable routes have distinct layouts with progressively narrower expert roads", () => {
  assert.equal(tracks.TRACKS.length, 19);
  const fingerprints = new Set(
    tracks.TRACKS.map((t) =>
      JSON.stringify(t.points.map((p) => [Math.round(p.x), Math.round(p.z)])),
    ),
  );
  assert.equal(fingerprints.size, 19);
  assert.ok(
    tracks.getTrack("mountain-summit").width < tracks.getTrack("coast").width,
  );
});

test("AC13 neighbouring and elevated road segments cannot steal a continuous projection", () => {
  const base = tracks.DEFAULT_TRACK,
    p = tracks.trackPoint(0.02, base);
  const points = base.points.map((q) => ({ ...q }));
  points[360] = { ...p, t: 0.5, y: 20, x: p.x + 0.1 };
  points[361] = { ...p, t: 361 / 720, y: 20, x: p.x + 0.1, z: p.z + 1 };
  const track = { ...base, points };
  const n = tracks.continuousTrack(p.x + 0.1, p.z, 0.02, track);
  assert.ok(Math.abs(n.t - 0.02) < 0.001);
  assert.equal(n.y, 0);
});
