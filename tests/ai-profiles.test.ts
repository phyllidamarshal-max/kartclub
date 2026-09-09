import { test } from "node:test";
import assert from "node:assert/strict";
import * as ai from "../shared/ai.ts";
import { getTrack, trackPoint } from "./fixtures/tracks-before-route-mastery.ts";
import { spawnCar, stepCar } from "../shared/race.ts";

test("fixed tiers expose immutable deterministic personalities for the HUD", () => {
  assert.equal(
    typeof ai.aiProfile,
    "function",
    "AI profile contract is missing",
  );
  const names = new Set(
    [0, 1, 2].map((slot) => ai.aiProfile(slot, "hard").name),
  );
  assert.deepEqual(names, new Set(["stable", "technical", "attacking"]));
  for (const [difficulty, tier] of [
    ["easy", "novice"],
    ["normal", "intermediate"],
    ["hard", "expert"],
  ] as const) {
    const profile = ai.aiProfile(1, difficulty);
    assert.equal(profile.tier, tier);
    assert.deepEqual(profile, ai.aiProfile(1, difficulty));
    assert.ok(Object.isFrozen(profile));
  }
});

test("distant player progress never changes inputs and decisions cannot grant physics/resources", () => {
  const track = getTrack("coast"),
    car = spawnCar(1, "ai", track),
    rival = spawnCar(0, "human", track);
  rival.x += 300;
  const original = structuredClone(car);
  const ahead = ai.aiInput(car, track, "hard", 10, [
    { ...rival, progress: 2.9 },
  ]);
  assert.deepEqual(
    ahead,
    ai.aiInput(car, track, "hard", 10, [{ ...rival, progress: -2 }]),
  );
  assert.deepEqual(car, original);
  assert.deepEqual(Object.keys(ahead).sort(), [
    "boost",
    "drift",
    "item",
    "reset",
    "steer",
    "throttle",
  ]);
});

test("personalities choose different legal overtake lanes while braking for close traffic", () => {
  const track = getTrack("coast"),
    p = trackPoint(0.025, track);
  const inputs = [0, 1, 2].map((slot) => {
    const car = spawnCar(slot, "ai", track);
    Object.assign(car, {
      x: p.x,
      z: p.z,
      lastT: p.t,
      heading: p.heading,
      speed: 30,
      vx: Math.sin(p.heading) * 30,
      vz: Math.cos(p.heading) * 30,
    });
    const rival = {
      ...car,
      id: "front",
      speed: 15,
      x: car.x + Math.sin(p.heading) * 4,
      z: car.z + Math.cos(p.heading) * 4,
    };
    const input = ai.aiInput(car, track, "hard", 10, [rival]);
    assert.ok(input.throttle < 0);
    return input.steer;
  });
  assert.equal(new Set(inputs).size, 3);
});

test("attacking expert selects and legally finishes a smooth shortcut without a reset", () => {
  const track = getTrack("coast-harbor"),
    car = spawnCar(2, "shortcut", track);
  let branchFrames = 0,
    resets = 0;
  for (let frame = 0; frame < 60 * 180 && car.lap < 3; frame++) {
    const input = ai.aiInput(car, track, "hard", frame / 60);
    if (input.reset && !car.resetHeld) resets++;
    stepCar(car, input, 1 / 60, track);
    if (car.routeBranch === "shortcut") branchFrames++;
  }
  assert.equal(car.lap, 3);
  assert.equal(resets, 0);
  assert.ok(branchFrames > 60, "shortcut was never selected");
});

test("attacking drivers reject a discontinuous mountain entry instead of stalling", () => {
  const track = getTrack("mountain"),
    car = spawnCar(2, "sharp-entry", track);
  let resets = 0;
  for (let frame = 0; frame < 60 * 180 && car.lap < 3; frame++) {
    const input = ai.aiInput(car, track, "normal", frame / 60);
    if (input.reset && !car.resetHeld) resets++;
    stepCar(car, input, 1 / 60, track);
  }
  assert.equal(car.lap, 3);
  assert.equal(resets, 0);
});

test("technical expert completes an earned consecutive drift without sacrificing every mini", () => {
  const track = getTrack("coast"),
    car = spawnCar(1, "technical-chain", track);
  for (let frame = 0; frame < 60 * 150 && car.lap < 3; frame++) {
    stepCar(car, ai.aiInput(car, track, "hard", frame / 60), 1 / 60, track);
  }
  assert.equal(car.lap, 3);
  assert.ok(car.driftChains > 0, "expert never completed an earned chain");
  assert.ok(car.miniUses > 0, "chain policy must retain ordinary mini boosts");
  assert.equal(car.collisionCount, 0, "wide coast chains should stay clean");
});

test("expert only spends an earned chain window on a safe turn", () => {
  const track = getTrack("coast"),
    car = spawnCar(1, "chain-safety", track);
  for (let frame = 0; frame < 60 * 100; frame++) {
    const input = ai.aiInput(car, track, "hard", frame / 60);
    if (car.miniWindow > 0 && input.drift) {
      const original = structuredClone(car);
      for (const changes of [
        { speed: 9 },
        { resetTime: 1 },
        { energyLockTime: 0.2 },
        { collisionCooldown: 0.2 },
        { impact: 0.5 },
        { slot: 0 },
      ])
        assert.equal(
          ai.aiInput({ ...car, ...changes }, track, "hard", frame / 60).drift,
          false,
        );
      assert.equal(ai.aiInput(car, track, "normal", frame / 60).drift, false);
      const p = trackPoint(0, track);
      const straight = {
        ...car,
        x: p.x,
        z: p.z,
        lastT: p.t,
        heading: p.heading,
        vx: Math.sin(p.heading) * car.speed,
        vz: Math.cos(p.heading) * car.speed,
      };
      assert.equal(
        ai.aiInput(straight, track, "hard", frame / 60).drift,
        false,
      );
      assert.deepEqual(
        car,
        original,
        "choosing a chain cannot grant or mutate resources",
      );
      return;
    }
    stepCar(car, input, 1 / 60, track);
  }
  assert.fail("no actual earned chain decision reached");
});

