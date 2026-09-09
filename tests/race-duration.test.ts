import { test } from "node:test";
import assert from "node:assert/strict";
import { raceDeadline, raceHardLimit } from "../shared/rules.ts";
import { spawnCar } from "../shared/race.ts";
import { getTrack } from "../shared/track.ts";

test("race duration scales with actual route and laps, with headroom for a five-minute finish", () => {
  assert.equal(raceHardLimit("coast", 3), 270);
  assert.equal(raceHardLimit("coast-breakwater", 3), 450);
  assert.equal(raceHardLimit("coast-breakwater", 1), 150);
  assert.equal(raceHardLimit("tide-coast-v1", 1), 300);
  const c = spawnCar(0, "duration", getTrack("coast-breakwater"));
  assert.equal(raceDeadline([c], true, "coast-breakwater", 3), 450);
  c.finished = true;
  c.time = 305;
  assert.equal(raceDeadline([c], true, "coast-breakwater", 3), 325);
  assert.equal(raceDeadline([c], false, "coast-breakwater", 3), 450);
});
