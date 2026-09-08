import { test } from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES, starsFor } from "../shared/gameplay.ts";
import {
  ChallengeRun,
  challengeGrade,
  type ChallengeMetrics,
} from "../shared/challenge-events.ts";
import { spawnCar } from "../shared/race.ts";

const result: ChallengeMetrics = {
  finished: true,
  time: 90,
  rank: 2,
  collisions: 0,
  cleanDrifts: 0,
  miniUses: 0,
  driftChains: 0,
  usefulHits: 0,
  blocks: 0,
  failed: false,
};
test("qualifying for a normal race does not require farming drift or item uses", () => {
  const q = CHALLENGES[0];
  assert.ok(starsFor(q, q.gold * 1.5, q.rank, 0, 0, true) >= 1);
  assert.equal(challengeGrade(q, { ...result, finished: false }), 0);
});
test("optional pace and skill medals are independent", () => {
  const q = CHALLENGES[0];
  assert.equal(
    challengeGrade(q, { ...result, time: q.gold * 1.5, collisions: 99 }),
    1,
  );
  assert.equal(
    challengeGrade(q, { ...result, time: q.gold * 0.9, collisions: 99 }),
    2,
  );
  assert.equal(
    challengeGrade(q, { ...result, time: q.gold * 1.5, collisions: 0 }),
    2,
  );
  assert.equal(
    challengeGrade(q, { ...result, time: q.gold * 0.9, collisions: 0 }),
    3,
  );
});
test("technique event checks real clean drifts and mini boosts, attack checks useful hits", () => {
  assert.equal(challengeGrade(CHALLENGES[4], result), 0);
  assert.ok(
    challengeGrade(CHALLENGES[4], {
      ...result,
      cleanDrifts: 4,
      miniUses: 2,
      techniqueCorners: 2,
    }) >= 1,
  );
  assert.equal(challengeGrade(CHALLENGES[2], result), 0);
  assert.ok(challengeGrade(CHALLENGES[2], { ...result, usefulHits: 1 }) >= 1);
});
test("sector deadlines use crossing time and reversing does not restart the allowance", () => {
  const q = CHALLENGES[1],
    run = new ChallengeRun(q);
  const budget = q.sectorSeconds![0];
  run.update(0, 0.34, budget * 0.9);
  assert.equal(run.gate, 2);
  run.update(0.34, 0.2, budget);
  assert.equal(run.gate, 2);
  run.update(0.2, 0.2, budget + q.sectorSeconds![1] + 1);
  assert.equal(run.failed, true);
  assert.equal(challengeGrade(q, { ...result, failed: run.failed }), 0);
});
test("late crossing cannot erase an expired sector deadline", () => {
  const q = CHALLENGES[1],
    run = new ChallengeRun(q);
  run.update(0, 0, q.sectorSeconds![0] - 1);
  run.update(0, 0.34, q.sectorSeconds![0] + 5);
  assert.equal(run.failed, true);
});
test("pursuit head start is fixed and independent of opponent gap", () => {
  const run = new ChallengeRun(CHALLENGES[3]);
  assert.ok(run.releaseRemaining(0) > 0);
  assert.equal(run.releaseRemaining(100), 0);
  assert.equal(new ChallengeRun(CHALLENGES[0]).releaseRemaining(0), 0);
});

test("technique qualification requires distinct designated bends, not repeated drift farming", () => {
  const q = CHALLENGES[4],
    run = new ChallengeRun(q),
    car = spawnCar();
  assert.equal(q.techniqueCorners?.length, 2);
  assert.equal(
    challengeGrade(q, { ...result, cleanDrifts: 20, miniUses: 12 }),
    0,
  );
  for (let n = 1; n <= 6; n++) {
    car.progress = q.techniqueCorners![0];
    car.cleanDrifts = n;
    run.observeTechnique(car);
  }
  assert.equal(run.completedCorners.length, 1);
  car.progress = q.techniqueCorners![1];
  run.observeTechnique(car);
  assert.equal(
    run.completedCorners.length,
    1,
    "driving through without a new clean drift earns nothing",
  );
  car.cleanDrifts++;
  run.observeTechnique(car);
  assert.equal(run.completedCorners.length, 2);
  assert.ok(
    challengeGrade(q, {
      ...result,
      cleanDrifts: 7,
      miniUses: 2,
      techniqueCorners: 2,
    }) >= 1,
  );
});
