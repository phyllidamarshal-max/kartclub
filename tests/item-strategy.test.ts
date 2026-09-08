import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseItem } from "../shared/item-strategy.ts";
import {
  createItems,
  incomingThreat,
  stepItems,
  type Item,
} from "../shared/items.ts";
import { spawnCar, EMPTY_INPUT } from "../shared/race.ts";
import { DEFAULT_TRACK, trackPoint } from "../shared/track.ts";

function car(id: string, progress: number, x: number) {
  const result = spawnCar(0, id);
  Object.assign(result, { progress, x, z: 0, speed: 30 });
  return result;
}

function draws(
  subject: ReturnType<typeof car>,
  cars: ReturnType<typeof car>[],
) {
  const counts: Record<Item, number> = {
    boost: 0,
    shield: 0,
    missile: 0,
    trap: 0,
  };
  for (let seed = 1; seed <= 2000; seed++)
    counts[chooseItem(seed, subject, cars).item]++;
  return counts;
}

test("seeded item choice is deterministic and keeps every item possible", () => {
  const cars = [car("leader", 0.8, 0), car("trailer", 0.2, 90)];
  const first = chooseItem(12345, cars[1], cars);
  assert.deepEqual(chooseItem(12345, cars[1], cars), first);
  assert.equal(first.seed, (Math.imul(12345, 1664525) + 1013904223) >>> 0);
  assert.deepEqual(chooseItem(12345, cars[1], [...cars].reverse()), first);
  const counts = draws(cars[1], cars);
  for (const count of Object.values(counts)) assert.ok(count > 100);
});

test("rank and canonical race gap bias defense for leaders and catchup for trailers", () => {
  const leader = car("leader", 0.8, 0);
  const nearTrailer = car("near", 0.7, 8);
  const farTrailer = car("far", 0.2, 100);
  const leadCounts = draws(leader, [leader, nearTrailer, farTrailer]);
  const nearCounts = draws(nearTrailer, [leader, nearTrailer, farTrailer]);
  const farCounts = draws(farTrailer, [leader, nearTrailer, farTrailer]);
  assert.ok(
    leadCounts.shield + leadCounts.trap > leadCounts.boost + leadCounts.missile,
  );
  assert.ok(
    farCounts.boost + farCounts.missile > nearCounts.boost + nearCounts.missile,
  );
  assert.ok(
    farCounts.shield > 0 && farCounts.trap > 0,
    "sandbagging never guarantees catchup items",
  );
});

test("reset and ghost rivals do not improve rank or gap weighting", () => {
  const subject = car("subject", 0.5, 0);
  const active = car("active", 0.6, 15);
  const reset = car("reset", 9, 500);
  reset.resetTime = 1;
  const ghost = car("ghost", 8, 400);
  ghost.ghostTime = 1;
  assert.deepEqual(
    chooseItem(77, subject, [subject, active, reset, ghost]),
    chooseItem(77, subject, [subject, active]),
  );
});

test("incoming threat reports only the earliest real imminent missile", () => {
  const target = car("target", 0.2, 0);
  const world = createItems([target.id]);
  world.missiles.push(
    { x: 65, z: 0, owner: "a", target: target.id, ttl: 2 },
    { x: 20, z: 0, owner: "b", target: target.id, ttl: 2 },
    { x: 1, z: 0, owner: "c", target: "someone-else", ttl: 2 },
    { x: 100, z: 0, owner: "d", target: target.id, ttl: 0.5 },
  );
  assert.ok(Math.abs(incomingThreat(world, target)! - 16 / 65) < 1e-9);
  target.resetTime = 1;
  assert.equal(incomingThreat(world, target), null);
  target.resetTime = 0;
  target.finished = true;
  assert.equal(incomingThreat(world, target), null);
});

test("loot weights use race distance even when a distant road passes beside us", () => {
  const subject = car("subject", 0.4, 0),
    near = car("ahead", 0.41, 8),
    parallel = car("ahead", 0.7, 2);
  const nearCounts = draws(subject, [subject, near]),
    farCounts = draws(subject, [subject, parallel]);
  assert.ok(
    farCounts.boost + farCounts.missile > nearCounts.boost + nearCounts.missile,
    "an adjacent distant course section must not be treated as a close opponent",
  );
  const relocated = { ...parallel, x: 800, z: 500 };
  assert.deepEqual(
    draws(subject, [subject, relocated]),
    farCounts,
    "lateral geometry does not change race-gap weights",
  );
});

test("a close pursuer increases the leader defensive choices without guaranteeing them", () => {
  const subject = car("subject", 0.5, 0),
    close = car("behind", 0.49, 8),
    far = car("behind", 0.3, 8);
  const pressured = draws(subject, [subject, close]),
    clear = draws(subject, [subject, far]);
  assert.ok(pressured.shield + pressured.trap > clear.shield + clear.trap);
  assert.ok(pressured.boost > 0 && pressured.missile > 0);
});

test("reversing and finished rivals cannot bias active race loot", () => {
  const subject = car("subject", 0.5, 0),
    ahead = car("ahead", 0.6, 20),
    reverse = car("reverse", 2, 3),
    finished = car("finished", 3, 2);
  reverse.speed = -12;
  finished.finished = true;
  assert.deepEqual(
    draws(subject, [subject, ahead, reverse, finished]),
    draws(subject, [subject, ahead]),
  );
});

test("respawn ghost cannot use an item and holding through recovery needs a fresh press", () => {
  const subject = car("subject", 0.1, 0),
    world = createItems([subject.id]);
  subject.ghostTime = 1;
  world.players.subject.held = "boost";
  const press = { subject: { ...EMPTY_INPUT, item: true } };
  stepItems(world, [subject], press, 1 / 60, DEFAULT_TRACK);
  assert.equal(world.players.subject.held, "boost");
  assert.equal(world.players.subject.uses, 0);
  subject.ghostTime = 0;
  stepItems(world, [subject], press, 1 / 60, DEFAULT_TRACK);
  assert.equal(world.players.subject.held, "boost");
  stepItems(world, [subject], {}, 1 / 60, DEFAULT_TRACK);
  stepItems(world, [subject], press, 1 / 60, DEFAULT_TRACK);
  assert.equal(world.players.subject.uses, 1);
});

test("invalid pickup motion never consumes a deterministic draw", () => {
  const subject = car("subject", 0.06, 0),
    world = createItems([subject.id]);
  const point = trackPoint(0.06);
  Object.assign(subject, { x: point.x, z: point.z, lastT: point.t });
  const initial = world.seed;
  for (const [previous, progress, speed] of [
    [0.061, 0.06, 20],
    [0.059, 0.06, -12],
    [0.01, 0.06, 20],
  ]) {
    world.players.subject.lastProgress = previous;
    Object.assign(subject, { progress, speed });
    stepItems(world, [subject], {}, 1 / 60, DEFAULT_TRACK);
    assert.equal(world.players.subject.held, null);
    assert.equal(world.seed, initial);
  }
});

test("expired missiles and traps cannot damage or score on their last simulation step", () => {
  for (const item of ["missile", "trap"] as const) {
    const owner = car("owner", 0.1, 0),
      victim = car("victim", 0.2, 20),
      world = createItems(["owner", "victim"]);
    if (item === "missile")
      world.missiles.push({
        x: 28,
        z: 0,
        owner: owner.id,
        target: victim.id,
        ttl: 0.01,
      });
    else
      world.traps.push({ x: victim.x, z: victim.z, owner: owner.id, ttl: 0 });
    stepItems(world, [owner, victim], {}, 0.1, DEFAULT_TRACK);
    assert.equal(victim.speed, 30, `${item} outlived its lifetime`);
    assert.equal(world.players.owner.usefulHits, 0);
  }
});

test("shield and burst protection are evaluated at impact time in chronological order", () => {
  const owner = car("owner", 0.1, 0),
    victim = car("victim", 0.2, 20),
    world = createItems(["owner", "victim"]);
  world.players.victim.shield = 0.03;
  // Later shot deliberately appears first in the array.
  world.missiles.push(
    { x: 20 + 4 + 65 * 0.5, z: 0, owner: owner.id, target: victim.id, ttl: 2 },
    { x: 20 + 4 + 65 * 0.02, z: 0, owner: owner.id, target: victim.id, ttl: 2 },
  );
  stepItems(world, [owner, victim], {}, 0.6, DEFAULT_TRACK);
  assert.equal(
    world.players.victim.blocks,
    1,
    "early impact must use the still-live shield",
  );
  assert.equal(
    world.players.owner.usefulHits,
    1,
    "later impact lands after burst protection ends",
  );
});

test("self-inflicted traps cannot farm attack or defense career counters", () => {
  for (const shield of [0, 3]) {
    const subject = car("subject", 0.2, 0),
      world = createItems([subject.id]);
    world.players.subject.shield = shield;
    world.traps.push({
      x: subject.x,
      z: subject.z,
      owner: subject.id,
      ttl: 10,
    });
    stepItems(world, [subject], {}, 1 / 60, DEFAULT_TRACK);
    assert.equal(world.players.subject.hits, 0);
    assert.equal(world.players.subject.usefulHits, 0);
    assert.equal(world.players.subject.blocks, 0);
  }
});

test("incoming warning accounts for impact radius, expiring defense, and shield consumption", () => {
  const victim = car("victim", 0.2, 0),
    world = createItems([victim.id]);
  world.missiles.push({
    x: 4 + 65 * 0.2,
    z: 0,
    owner: "opponent",
    target: victim.id,
    ttl: 2,
  });
  world.players.victim.shield = 0.25;
  assert.equal(
    incomingThreat(world, victim),
    null,
    "live shield covers the first shot",
  );
  world.players.victim.shield = 0.15;
  assert.ok(Math.abs(incomingThreat(world, victim)! - 0.2) < 1e-9);
  world.players.victim.shield = 5;
  world.missiles.push({
    x: 4 + 65 * 0.7,
    z: 0,
    owner: "second",
    target: victim.id,
    ttl: 2,
  });
  assert.ok(
    Math.abs(incomingThreat(world, victim)! - 0.7) < 1e-9,
    "second shot arrives after the consumed shield burst",
  );
});

test("career counters record actual useful hits and shield blocks only", () => {
  const owner = car("owner", 0.1, 0);
  const victim = car("victim", 0.2, 20);
  const world = createItems([owner.id, victim.id]);
  assert.equal(world.players.owner.usefulHits, 0);
  assert.equal(world.players.victim.blocks, 0);
  world.players.victim.shield = 5;
  world.missiles.push({
    x: victim.x,
    z: victim.z,
    owner: owner.id,
    target: victim.id,
    ttl: 2,
  });
  stepItems(world, [owner, victim], {}, 1 / 60, DEFAULT_TRACK);
  assert.equal(world.players.victim.blocks, 1);
  assert.equal(world.players.owner.usefulHits, 0);
  world.players.victim.hitProtection = 0;
  world.missiles.push({
    x: victim.x,
    z: victim.z,
    owner: owner.id,
    target: victim.id,
    ttl: 2,
  });
  stepItems(world, [owner, victim], {}, 1 / 60, DEFAULT_TRACK);
  assert.equal(world.players.owner.usefulHits, 1);
  world.missiles.push({
    x: victim.x,
    z: victim.z,
    owner: owner.id,
    target: victim.id,
    ttl: 2,
  });
  stepItems(world, [owner, victim], {}, 1 / 60, DEFAULT_TRACK);
  assert.equal(
    world.players.owner.usefulHits,
    1,
    "protected bursts are not useful hits",
  );
});

test("a box on an adjacent race segment cannot be collected through proximity alone", () => {
  const subject = car("subject", 0.5, 0),
    world = createItems([subject.id]),
    point = trackPoint(0.06);
  Object.assign(subject, { x: point.x, z: point.z, lastT: 0.5 });
  world.players.subject.lastProgress = 0.499;
  stepItems(world, [subject], {}, 1 / 60, DEFAULT_TRACK);
  assert.equal(world.players.subject.held, null);
  assert.equal(world.seed, 537);
});

test("a trap on a separated road height cannot hit or consume a shield", () => {
  const owner = car("owner", 0.1, 0),
    victim = car("victim", 0.2, 20),
    world = createItems(["owner", "victim"]);
  world.players.victim.shield = 3;
  world.traps.push({
    ...{ x: victim.x, z: victim.z, owner: owner.id, ttl: 10 },
    y: 12,
  });
  stepItems(world, [owner, victim], {}, 1 / 60, DEFAULT_TRACK);
  assert.equal(world.players.victim.blocks, 0);
  assert.ok(world.players.victim.shield > 2.9);
  assert.equal(world.traps.length, 1);
});

test("impact protection and counters agree across simulation step sizes", () => {
  const simulate = (steps: number[]) => {
    const owner = car("owner", 0.1, 0),
      victim = car("victim", 0.2, 20),
      world = createItems(["owner", "victim"]);
    world.players.victim.shield = 0.03;
    for (const arrival of [0.5, 0.02])
      world.missiles.push({
        x: 24 + 65 * arrival,
        z: 0,
        owner: owner.id,
        target: victim.id,
        ttl: 2,
      });
    for (const dt of steps)
      stepItems(world, [owner, victim], {}, dt, DEFAULT_TRACK);
    return {
      state: world.players.victim,
      hits: world.players.owner.usefulHits,
      speed: victim.speed,
    };
  };
  const coarse = simulate([0.6]),
    fine = simulate(Array(36).fill(1 / 60));
  assert.equal(coarse.state.blocks, 1);
  assert.equal(coarse.hits, 1);
  assert.equal(fine.state.blocks, coarse.state.blocks);
  assert.equal(fine.hits, coarse.hits);
  assert.ok(
    Math.abs(coarse.state.hitProtection - fine.state.hitProtection) < 1e-9,
  );
  assert.ok(Math.abs(coarse.state.slow - fine.state.slow) < 1e-9);
  assert.equal(coarse.speed, fine.speed);
});
