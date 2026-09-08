import { test } from "node:test";
import assert from "node:assert/strict";
import { getTrack } from "../shared/track.ts";
import { practiceCorners, CornerPractice } from "../client/practice.ts";
import {
  sectorComparison,
  sectorDuration,
  drivingAdvice,
} from "../client/race-feedback.ts";
import { spawnCar } from "../shared/race.ts";
test("corner practice starts before an actual bend and retry resets all resources and motion", () => {
  const track = getTrack("coast"),
    corners = practiceCorners(track);
  assert.ok(corners.length >= 2);
  const practice = new CornerPractice(track, 0),
    first = practice.restart();
  first.speed = 40;
  first.energy = 100;
  first.storedNitro = 2;
  first.collisionCount = 9;
  const next = practice.restart();
  assert.equal(next.speed, 0);
  assert.equal(next.energy, 0);
  assert.equal(next.storedNitro, 0);
  assert.equal(next.collisionCount, 0);
  assert.equal(next.x, first.x);
  assert.equal(next.progress, next.spawnProgress);
  assert.equal(next.lastX, next.x);
  assert.equal(next.lastZ, next.z);
  assert.equal(practice.complete(next), false);
  next.progress = practice.endProgress;
  assert.equal(practice.complete(next), true);
});
test("latest sector duration converts cumulative lap crossings into an interval", () => {
  assert.equal(sectorDuration([20]), 20);
  assert.equal(sectorDuration([20, 38]), 18);
  assert.equal(sectorDuration([20, 38, 61]), 23);
  assert.equal(sectorDuration([]), null);
  assert.equal(sectorDuration([20, 20]), null);
  assert.equal(sectorDuration([20, Number.NaN]), null);
});
test("sector delta compares the matching individual sector and rejects invalid context", () => {
  assert.equal(sectorComparison([20], [19, 40, 62]), 1);
  assert.equal(sectorComparison([], [19, 40, 62]), null);
  assert.equal(sectorComparison([20, 38], [19]), null);
  assert.equal(sectorComparison([20, 38], [19, 40, 62]), -3);
  assert.equal(sectorComparison([20, 19], [19, 40, 62]), null);
  assert.equal(sectorComparison([20, 38], [19, 18, 62]), null);
  assert.equal(
    sectorComparison([18], [19, 40, 62]),
    -1,
    "a reset current-lap split compares against reference sector one",
  );
});
test("feedback distinguishes collision loss from missed mini windows", () => {
  const car = spawnCar();
  car.collisionCount = 6;
  assert.equal(drivingAdvice(car), "先减速入弯，减少碰撞");
  car.collisionCount = 0;
  car.missedMini = 4;
  assert.equal(drivingAdvice(car), "拉正后及时松按油门，抓住小喷窗口");
});
