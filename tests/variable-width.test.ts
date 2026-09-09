import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRACKS,
  DEFAULT_TRACK,
  trackPoint,
  trackWidth,
  trackWidthRange,
  continuousTrack,
} from "../shared/track.ts";
import { spawnCar, stepCar, EMPTY_INPUT } from "../shared/race.ts";
import { createItems } from "../shared/items.ts";
import { mapProfile } from '../shared/map-profiles.ts';
test("all nineteen roads vary within a lap with gentler beginner tapers and smooth closed transitions", () => {
  for (const track of TRACKS) {
    const range = trackWidthRange(track);
    assert.ok(range.max - range.min >= (mapProfile(track.id).rating===1?6:7)-.05, track.id);
    assert.ok(range.min >= 7 && range.max <= 26, track.id);
    assert.equal(trackWidth(0, track), trackWidth(1, track));
    const count = track.points.length;
    for (let i = 0; i < count; i++) {
      const t = i / count,
        p = trackPoint(t, track);
      assert.ok(
        Math.abs(trackWidth((i + 1) / count, track) - trackWidth(t, track)) <
          0.75,
        track.id,
      );
      assert.ok(
        Math.abs(
          continuousTrack(p.x, p.z, t, track, "main").roadWidth -
            trackWidth(t, track),
        ) < 0.01,
      );
    }
  }
  assert.equal(trackWidth(0.5, DEFAULT_TRACK), DEFAULT_TRACK.width);
});

test("item lanes remain reachable inside every narrowed road", () => {
  for (const track of TRACKS)
    for (const box of createItems([], track).boxes) {
      const p = continuousTrack(
        box.x,
        box.z,
        0.06 + box.band * 0.12,
        track,
        "main",
      );
      assert.ok(
        p.distance + 1.5 <= p.roadWidth / 2,
        `${track.id}: band ${box.band}`,
      );
    }
});
test("narrow sections constrain cars at actual boundaries while wide sections permit passing lanes", () => {
  for (const track of TRACKS) {
    const profile = track.widthProfile!;
    const narrow = profile.reduce((a, b) => (a.width < b.width ? a : b)),
      wide = profile.reduce((a, b) => (a.width > b.width ? a : b));
    for (const [stop, outside] of [
      [narrow, true],
      [wide, false],
    ] as const) {
      const p = trackPoint(stop.t, track),
        c = spawnCar(0, "boundary", track);
      const lateral = outside ? stop.width / 2 + 1 : stop.width / 2 - 2.5;
      Object.assign(c, {
        x: p.x + Math.cos(p.heading) * lateral,
        z: p.z - Math.sin(p.heading) * lateral,
        heading: p.heading,
        lastT: p.t,
      });
      c.lastX = c.x;
      c.lastZ = c.z;
      stepCar(c, EMPTY_INPUT, 1 / 60, track);
      const projection = continuousTrack(c.x, c.z, c.lastT, track, "main");
      assert.ok(
        Math.abs(projection.lateral) <= projection.roadWidth / 2,
        track.id,
      );
      if (!outside)
        assert.ok(Math.abs(projection.lateral - lateral) < 0.05, track.id);
    }
  }
});
