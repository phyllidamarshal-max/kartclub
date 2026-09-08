import { test } from "node:test";
import assert from "node:assert/strict";
import {
  careerBestTime,
  updateCareerProgress,
} from "../client/career-progress.ts";
test("new world rules preserve earned stars but start an independent best time", () => {
  const previous = { stars: 3, time: 82 };
  assert.equal(careerBestTime(previous, "new"), undefined);
  const next = updateCareerProgress(previous, 1, 120, "new");
  assert.equal(next.stars, 3);
  assert.equal(careerBestTime(next, "new"), 120);
  assert.equal(next.historicalTimes?.legacy, 82);
  assert.deepEqual(previous, { stars: 3, time: 82 });
  assert.equal(updateCareerProgress(next, 2, 110, "new").time, 110);
  assert.equal(updateCareerProgress(next, 2, 130, "new").time, 120);
});
test("future changes archive the last version and never compare incompatible times", () => {
  const old = updateCareerProgress(undefined, 2, 80, "v1");
  const next = updateCareerProgress(old, 1, 105, "v2");
  assert.equal(next.time, 105);
  assert.equal(next.historicalTimes?.v1, 80);
  assert.equal(careerBestTime(next, "v1"), undefined);
});
