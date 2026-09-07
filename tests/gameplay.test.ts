import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHALLENGES,
  starsFor,
  isUnlocked,
  validateMatch,
} from "../shared/gameplay.ts";
import { spawnCar, EMPTY_INPUT } from "../shared/race.ts";
import { getTrack } from "../shared/track.ts";
import { createItems, stepItems } from "../shared/items.ts";
import { ghostAt, validGhost } from "../shared/ghost.ts";
test("nine challenges unlock sequentially and only valid finishes award stars", () => {
  assert.equal(CHALLENGES.length, 9);
  assert.ok(isUnlocked(0, {}));
  assert.ok(!isUnlocked(1, {}));
  assert.ok(isUnlocked(1, { [CHALLENGES[0].id]: { stars: 1 } }));
  assert.equal(starsFor(CHALLENGES[0], 999, 1, 0, 0, false), 0);
  assert.ok(starsFor(CHALLENGES[0], 60, 1, 500, 3, true) > 0);
  assert.throws(() => validateMatch({ trackId: "fake" }));
  assert.throws(() => validateMatch({ laps: 100 }));
});
test("shield blocks tracking hit, item press is edge-triggered, finished cars cannot collect", () => {
  const track = getTrack("coast"),
    a = spawnCar(0, "a"),
    b = spawnCar(1, "b"),
    w = createItems(["a", "b"]);
  w.players.a.held = "missile";
  w.players.b.shield = 4;
  b.progress = 0.1;
  b.x = a.x + 5;
  stepItems(w, [a, b], { a: { ...EMPTY_INPUT, item: true } }, 0.016, track);
  for (let i = 0; i < 20; i++)
    stepItems(w, [a, b], { a: { ...EMPTY_INPUT, item: true } }, 0.016, track);
  assert.equal(w.players.b.slow, 0);
  assert.equal(w.players.b.shield, 0);
  assert.equal(w.players.a.uses, 1);
  w.players.a.held = "boost";
  stepItems(w, [a, b], { a: { ...EMPTY_INPUT, item: true } }, 0.016, track);
  assert.equal(w.players.a.held, "boost");
  a.finished = true;
  w.players.a.held = "trap";
  stepItems(w, [a, b], { a: { ...EMPTY_INPUT, item: false } }, 0.016, track);
  stepItems(w, [a, b], { a: { ...EMPTY_INPUT, item: true } }, 0.016, track);
  assert.equal(w.traps.length, 0);
});
test("ghost interpolation follows stored pose and malformed recordings are rejected", () => {
  const g = {
    version: 2,
    trackId: "coast",
    time: 1,
    frames: [
      [0, 0, 0, 0],
      [1, 10, 4, 0],
    ],
  };
  assert.ok(validGhost(g, "coast"));
  assert.equal(ghostAt(g, 0.5)?.x, 5);
  assert.ok(!validGhost({ ...g, frames: [[0, NaN, 0, 0]] }, "coast"));
});
