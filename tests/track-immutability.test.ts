import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TRACK,
  TRACKS,
  TRACK_POINTS,
  getTrack,
  nearestTrack,
} from "../shared/track.ts";

test("finished track definitions reject mutations at every nested level", () => {
  for (const track of [DEFAULT_TRACK, ...TRACKS]) {
    const point = track.points[17];
    const before = nearestTrack(point.x, point.z, track);
    assert.equal(Reflect.set(track, "width", 1), false);
    assert.equal(Reflect.set(point, "x", 999999), false);
    assert.equal(Reflect.set(track.points, "0", point), false);
    assert.equal(Reflect.set(track.shortcut, "length", 0), false);
    assert.equal(Reflect.set(track.obstacles, "length", 0), false);
    for (const p of track.shortcut)
      assert.equal(Reflect.set(p, "z", 999999), false);
    for (const p of track.obstacles)
      assert.equal(Reflect.set(p, "radius", 0), false);
    assert.deepEqual(nearestTrack(point.x, point.z, track), before);
  }
  assert.equal(Reflect.set(TRACKS, "length", 0), false);
  assert.equal(TRACK_POINTS, DEFAULT_TRACK.points);
  assert.equal(getTrack(DEFAULT_TRACK.id), DEFAULT_TRACK);
});

test("explicitly cloned custom tracks retain their independent geometry and query support", () => {
  const original = getTrack("mountain");
  const clone = structuredClone(original);
  assert.equal(Reflect.set(clone, "width", 12), true);
  const points = clone.points.map((p) => ({ ...p, x: p.x + 1000 }));
  const custom = { ...clone, points, shortcut: [], obstacles: [] };
  const p = points[42];
  assert.equal(nearestTrack(p.x, p.z, custom).distance, 0);
  assert.equal(nearestTrack(p.x, p.z, custom).roadWidth, 12);
  assert.notEqual(original.points[42].x, p.x);
});
