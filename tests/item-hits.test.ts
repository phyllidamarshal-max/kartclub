import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar, EMPTY_INPUT } from "../shared/race.ts";
import { DEFAULT_TRACK } from "../shared/track.ts";
import { createItems, stepItems } from "../shared/items.ts";

function fixture(speed = 40) {
  const owner = spawnCar(0, "owner"),
    victim = spawnCar(1, "victim");
  Object.assign(victim, {
    speed,
    vx: speed,
    vz: 0,
    x: owner.x + 20,
    progress: 0.1,
  });
  const w = createItems([owner.id, victim.id]);
  const missile = () =>
    w.missiles.push({
      x: victim.x,
      z: victim.z,
      owner: owner.id,
      target: victim.id,
      ttl: 4,
    });
  const step = () => stepItems(w, [owner, victim], {}, 1 / 60, DEFAULT_TRACK);
  return { owner, victim, w, missile, step };
}
test("a missile and trap burst applies one slowdown with one second of protection after recovery", () => {
  const { victim, w, missile, step } = fixture();
  missile();
  missile();
  missile();
  w.traps.push({ x: victim.x, z: victim.z, owner: "owner", ttl: 10 });
  step();
  assert.equal(victim.speed, 18);
  assert.equal(victim.vx, 18);
  assert.equal(w.players.owner.hits, 1);
  for (let i = 0; i < 120; i++) step();
  assert.equal(w.players.victim.slow, 0);
  missile();
  step();
  assert.equal(
    victim.speed,
    18,
    "recovery has ended but its extra protection remains",
  );
  assert.equal(w.players.owner.hits, 1);
  for (let i = 0; i < 60; i++) step();
  missile();
  step();
  assert.equal(w.players.owner.hits, 2, "protection eventually expires");
  assert.equal(
    victim.speed,
    12,
    "later hits respect the moving-car slowdown floor",
  );
});
test("shield consumption protects the same burst and never counts a damaging hit", () => {
  const { victim, w, missile, step } = fixture();
  w.players.victim.shield = 5;
  missile();
  missile();
  w.traps.push({ x: victim.x, z: victim.z, owner: "owner", ttl: 10 });
  step();
  assert.equal(w.players.victim.shield, 0);
  assert.equal(w.players.victim.slow, 0);
  assert.equal(victim.speed, 40);
  assert.equal(w.players.owner.hits, 0);
  for (let i = 0; i < 30; i++) step();
  missile();
  step();
  assert.equal(
    victim.speed,
    18,
    "the consumed shield's burst protection expires",
  );
  assert.equal(w.players.owner.hits, 1);
});
for (const protectedState of ["resetTime", "ghostTime"] as const) {
  test(`${protectedState} excludes targeting and preserves shields under pre-existing attacks`, () => {
    const { owner, victim, w, missile } = fixture();
    victim[protectedState] = 1;
    w.players.victim.shield = 5;
    w.players.owner.held = "missile";
    stepItems(
      w,
      [owner, victim],
      { owner: { ...EMPTY_INPUT, item: true } },
      1 / 60,
      DEFAULT_TRACK,
    );
    assert.equal(w.missiles.length, 0, "protected cars cannot be locked");
    missile();
    stepItems(w, [owner, victim], {}, 1 / 60, DEFAULT_TRACK);
    assert.ok(w.players.victim.shield > 4.9);
    assert.equal(victim.speed, 40);
    assert.equal(w.players.owner.hits, 0);
  });
}
test("slowdown never accelerates an already slow car", () => {
  const { victim, missile, step } = fixture(5);
  missile();
  step();
  assert.ok(victim.speed <= 5 && victim.vx <= 5);
});
