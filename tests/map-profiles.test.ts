import { test } from "node:test";
import assert from "node:assert/strict";
import { mapProfile } from "../shared/map-profiles.ts";
import { TRACKS, trackWidthRange } from "../shared/track.ts";
test("each playable circuit has a stable driving rating independent of rival settings", () => {
  assert.equal(TRACKS.length, 19);
  for (const track of TRACKS) {
    const p = mapProfile(track.id);
    assert.ok([1, 2, 3, 4].includes(p.rating));
    assert.ok(Object.isFrozen(p));
    assert.ok(trackWidthRange(track).min >= p.minWidth - 0.01, track.id);
  }
  assert.equal(mapProfile("forest-orchard").rating, 1);
  assert.equal(mapProfile("harbor-dual").layout, "ab");
  assert.equal(mapProfile("factory-shift").rating, 4);
});
