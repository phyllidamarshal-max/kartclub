import { test } from "node:test";
import assert from "node:assert/strict";
import { aiItemInput } from "../shared/ai-items.ts";
import { createItems, type Item } from "../shared/items.ts";
import { spawnCar, type Car } from "../shared/race.ts";
import { getTrack, trackPoint } from "../shared/track.ts";

const track = getTrack("city");

function carAt(id: string, progress: number): Car {
  const car = spawnCar(0, id, track);
  const point = trackPoint(progress, track);
  Object.assign(car, {
    x: point.x,
    z: point.z,
    heading: point.heading,
    lastT: point.t,
    progress,
    speed: 32,
  });
  return car;
}

function scenario(item: Item, progress = 0.1) {
  const car = carAt("ai", progress);
  const world = createItems([car.id], track);
  world.players[car.id].held = item;
  return { car, world };
}

function moveRelative(car: Car, forward: number, side = 0) {
  car.x += Math.sin(car.heading) * forward + Math.cos(car.heading) * side;
  car.z += Math.cos(car.heading) * forward - Math.sin(car.heading) * side;
}

function placeRelative(
  car: Car,
  point: { x: number; z: number },
  forward: number,
  side = 0,
) {
  point.x =
    car.x + Math.sin(car.heading) * forward + Math.cos(car.heading) * side;
  point.z =
    car.z + Math.cos(car.heading) * forward - Math.sin(car.heading) * side;
}

test("missile fires only at a target accepted by the item engine", () => {
  const { car, world } = scenario("missile");
  const valid = carAt("valid", car.progress + 0.01);
  valid.x = car.x + 40;
  valid.z = car.z;
  const behind = { ...valid, id: "behind", progress: car.progress - 0.01 };
  const distant = { ...valid, id: "distant", x: car.x + 161 };
  const ghost = { ...valid, id: "ghost", ghostTime: 1 };
  const reset = { ...valid, id: "reset", resetTime: 1 };
  const finished = { ...valid, id: "finished", finished: true };

  assert.equal(aiItemInput(car, track, "normal", [behind], world, true), false);
  assert.equal(aiItemInput(car, track, "hard", [distant], world, true), false);
  assert.equal(
    aiItemInput(car, track, "hard", [ghost, reset, finished], world, true),
    false,
  );
  assert.equal(aiItemInput(car, track, "normal", [valid], world, true), true);
});

test("missile rejects a rival on a vertically separated road", () => {
  const mountain = getTrack("mountain");
  const car = carAt("ai", 0.1);
  const rival = carAt("rival", 0.11);
  const world = createItems([car.id], mountain);
  world.players.ai.held = "missile";
  const low = trackPoint(car.lastT, mountain);
  const highIndex = mountain.points.findIndex(
    (point) => Math.abs(point.y - low.y) >= 5,
  );
  assert.ok(highIndex >= 0);
  rival.lastT = highIndex / 720;
  rival.x = car.x + 20;
  rival.z = car.z;

  assert.equal(aiItemInput(car, mountain, "hard", [rival], world, true), false);
});

test("missile judges the engine-selected nearest target and waits out protection", () => {
  const { car, world } = scenario("missile");
  const protectedRival = carAt("protected", car.progress + 0.01);
  const vulnerableRival = carAt("vulnerable", car.progress + 0.02);
  moveRelative(protectedRival, 35);
  moveRelative(vulnerableRival, 50);
  world.players.protected = createItems(["protected"], track).players.protected;
  world.players.vulnerable = createItems(
    ["vulnerable"],
    track,
  ).players.vulnerable;
  world.players.protected.shield = 2;

  assert.equal(
    aiItemInput(
      car,
      track,
      "hard",
      [vulnerableRival, protectedRival],
      world,
      true,
    ),
    false,
  );
  world.players.protected.shield = 0.3;
  assert.equal(
    aiItemInput(
      car,
      track,
      "hard",
      [vulnerableRival, protectedRival],
      world,
      true,
    ),
    true,
  );
});

test("missile clears a protected target when an item box pickup is imminent", () => {
  const { car, world } = scenario("missile");
  const rival = carAt("rival", car.progress + 0.01);
  moveRelative(rival, 35);
  world.players.rival = createItems(["rival"], track).players.rival;
  world.players.rival.hitProtection = 3;
  const box = world.boxes[0];
  placeRelative(car, box, 20);
  box.y = trackPoint(car.lastT, track).y;

  assert.equal(aiItemInput(car, track, "hard", [rival], world, true), true);
});

test("shield responds to an incoming missile or nearby trap and avoids waste", () => {
  const { car, world } = scenario("shield");
  world.missiles.push({
    x: car.x + 80,
    z: car.z,
    owner: "rival",
    target: car.id,
    ttl: 3,
  });
  assert.equal(aiItemInput(car, track, "normal", [], world, true), true);

  world.players.ai.shield = 2;
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);
  world.players.ai.shield = 0;
  world.missiles.length = 0;
  world.traps.push({ x: car.x, z: car.z, owner: "rival", ttl: 10 });
  assert.equal(aiItemInput(car, track, "hard", [], world, true), true);
});

test("shield ignores attacks that cannot arrive and traps outside our path", () => {
  const { car, world } = scenario("shield");
  world.missiles.push({
    x: car.x + 150,
    z: car.z,
    owner: "rival",
    target: car.id,
    ttl: 0.5,
  });
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);

  world.missiles.length = 0;
  const behind = { x: car.x, z: car.z, owner: "rival", ttl: 10 };
  placeRelative(car, behind, -5);
  world.traps.push(behind);
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);

  world.traps.length = 0;
  const outsideLane = { x: car.x, z: car.z, owner: "rival", ttl: 10 };
  placeRelative(car, outsideLane, 8, 7);
  world.traps.push(outsideLane);
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);
});

test("shield accounts for trap arming time before committing", () => {
  const { car, world } = scenario("shield");
  const trap = { x: car.x, z: car.z, owner: "rival", ttl: 14.9 };
  placeRelative(car, trap, 8);
  world.traps.push(trap);
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);

  trap.ttl = 14.2;
  assert.equal(aiItemInput(car, track, "hard", [], world, true), true);
});

test("shield frees capacity near a usable future box only", () => {
  const { car, world } = scenario("shield");
  const box = world.boxes[0];
  const point = trackPoint(car.lastT, track);
  Object.assign(box, {
    x: car.x + Math.sin(car.heading) * 32,
    z: car.z + Math.cos(car.heading) * 32,
    y: point.y,
    readyAt: world.time,
  });
  assert.equal(aiItemInput(car, track, "normal", [], world, true), true);

  box.x = car.x - Math.sin(car.heading) * 32;
  box.z = car.z - Math.cos(car.heading) * 32;
  assert.equal(aiItemInput(car, track, "normal", [], world, true), false);
  box.x = car.x + Math.sin(car.heading) * 32;
  box.z = car.z + Math.cos(car.heading) * 32;
  box.readyAt = world.time + 1;
  assert.equal(aiItemInput(car, track, "normal", [], world, true), false);
  box.readyAt = world.time;
  world.players.ai.pickedLaps[box.band] = Math.floor(car.progress);
  assert.equal(aiItemInput(car, track, "normal", [], world, true), false);
});

test("boost waits for a safe straight or corner exit", () => {
  const { car, world } = scenario("boost");
  assert.equal(aiItemInput(car, track, "hard", [], world, false), false);
  assert.equal(aiItemInput(car, track, "hard", [], world, true), true);
  car.boostTime = 0.1;
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);
});

test("trap is used for a close pursuer but not an unrelated distant car", () => {
  const { car, world } = scenario("trap");
  const pursuer = carAt("pursuer", car.progress - 0.01);
  pursuer.x = car.x;
  pursuer.z = car.z;
  moveRelative(pursuer, -15);
  const distant = { ...pursuer, id: "distant" };
  moveRelative(distant, -65);
  assert.equal(
    aiItemInput(car, track, "normal", [distant], world, true),
    false,
  );
  assert.equal(aiItemInput(car, track, "normal", [pursuer], world, true), true);
});

test("trap requires a pursuer to be physically behind on our path", () => {
  const { car, world } = scenario("trap");
  const front = carAt("front", car.progress - 0.01);
  front.x = car.x;
  front.z = car.z;
  moveRelative(front, 12);
  assert.equal(aiItemInput(car, track, "normal", [front], world, true), false);

  moveRelative(front, -24, 8);
  assert.equal(aiItemInput(car, track, "normal", [front], world, true), false);
});

test("hard AI can clear a trap at a narrow upcoming bend", () => {
  const mountain = getTrack("mountain");
  const index = mountain.points.findIndex((point, i) => {
    const ahead = trackPoint(i / 720 + 18 / mountain.length, mountain);
    return (
      Math.abs(
        Math.atan2(
          Math.sin(ahead.heading - point.heading),
          Math.cos(ahead.heading - point.heading),
        ),
      ) > 0.28
    );
  });
  assert.ok(index >= 0);
  const car = carAt("ai", index / 720);
  const point = trackPoint(car.lastT, mountain);
  Object.assign(car, { x: point.x, z: point.z, heading: point.heading });
  const world = createItems([car.id], mountain);
  world.players.ai.held = "trap";

  assert.equal(aiItemInput(car, mountain, "hard", [], world, true), true);
  assert.equal(aiItemInput(car, mountain, "easy", [], world, true), false);
});

test("release frames, absent state, and inactive cars never press an item", () => {
  const { car, world } = scenario("boost");
  world.players.ai.pressed = true;
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);
  assert.equal(aiItemInput(car, track, "hard", [], null, true), false);
  assert.equal(
    aiItemInput({ ...car, finished: true }, track, "hard", [], world, true),
    false,
  );
  assert.equal(
    aiItemInput({ ...car, resetTime: 1 }, track, "hard", [], world, true),
    false,
  );
  assert.equal(
    aiItemInput({ ...car, ghostTime: 1 }, track, "hard", [], world, true),
    false,
  );
  delete world.players.ai;
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);
});

test("decision is a pure computation", () => {
  const { car, world } = scenario("missile");
  const rival = carAt("rival", car.progress + 0.01);
  rival.x = car.x + 20;
  rival.z = car.z;
  const before = JSON.stringify({ car, rival, world });
  aiItemInput(car, track, "hard", [rival], world, true);
  assert.equal(JSON.stringify({ car, rival, world }), before);
});

test("missile rejects a physically adjacent rival far ahead in canonical race metres", () => {
  const { car, world } = scenario("missile"),
    parallel = carAt("parallel", car.progress + 0.2);
  parallel.x = car.x + 10;
  parallel.z = car.z;
  assert.equal(aiItemInput(car, track, "hard", [parallel], world, true), false);
});

test("missile waits while the target shield covers the real impact radius", () => {
  const { car, world } = scenario("missile"),
    rival = carAt("rival", car.progress + 0.01);
  rival.x = car.x + 20;
  rival.z = car.z;
  world.players.rival = createItems(["rival"], track).players.rival;
  world.players.rival.shield = 0.28;
  assert.equal(aiItemInput(car, track, "hard", [rival], world, true), false);
});

test("shield sees radius-based imminent hits but does not waste existing hit protection", () => {
  const { car, world } = scenario("shield");
  world.missiles.push({
    x: car.x + 140,
    z: car.z,
    owner: "enemy",
    target: car.id,
    ttl: 2.12,
  });
  assert.equal(aiItemInput(car, track, "hard", [], world, true), true);
  world.players[car.id].hitProtection = 2.2;
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);
});

test("shield ignores a trap that expires before the kart reaches it", () => {
  const { car, world } = scenario("shield"),
    trap = { x: car.x, z: car.z, owner: "enemy", ttl: 0.05 };
  placeRelative(car, trap, 8);
  world.traps.push(trap);
  assert.equal(aiItemInput(car, track, "hard", [], world, true), false);
});
