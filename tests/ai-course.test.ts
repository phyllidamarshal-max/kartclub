import { test } from "node:test";
import assert from "node:assert/strict";
import { itemCourse } from "../shared/ai-course.ts";
import { aiInput } from "../shared/ai.ts";
import { getTrack, trackPoint } from "../shared/track.ts";
import { spawnCar } from "../shared/race.ts";
import { createItems } from "../shared/items.ts";

function fixture() {
  const track = getTrack("coast"),
    car = spawnCar(1, "driver", track),
    p = trackPoint(0.01, track);
  Object.assign(car, {
    x: p.x,
    z: p.z,
    lastT: p.t,
    progress: p.t,
    heading: p.heading,
    speed: 30,
    vx: Math.sin(p.heading) * 30,
    vz: Math.cos(p.heading) * 30,
  });
  const world = createItems([car.id], track);
  const ahead = trackPoint(p.t + 18 / track.length, track);
  world.boxes = [
    {
      x: ahead.x + Math.cos(ahead.heading) * 4,
      z: ahead.z - Math.sin(ahead.heading) * 4,
      y: ahead.y,
      readyAt: 0,
      band: 0,
    },
  ];
  return { track, car, world, ahead };
}
test("AI steers toward an available box when its inventory is empty", () => {
  const { track, car, world } = fixture();
  const before = structuredClone(world);
  const empty = aiInput(car, track, "hard", 10);
  assert.ok(itemCourse(car, track, world).pickupLane! > 3.5);
  assert.ok(
    aiInput(car, track, "hard", 10, [], world).steer > empty.steer + 0.15,
  );
  assert.deepEqual(world, before);
  world.players[car.id].held = "shield";
  assert.equal(itemCourse(car, track, world).pickupLane, null);
});
test("AI avoids an armed trap in its driving corridor instead of boosting into it", () => {
  const { track, car, world, ahead } = fixture();
  world.boxes = [];
  world.traps = [{ x: ahead.x, z: ahead.z, owner: "rival", ttl: 13 }];
  car.storedNitro = 1;
  const clear = aiInput(car, track, "hard", 10);
  const danger = aiInput(car, track, "hard", 10, [], world);
  assert.ok(Math.abs(danger.steer - clear.steer) > 0.15);
  assert.equal(danger.boost, false);
  world.traps[0].ttl = 0;
  assert.deepEqual(itemCourse(car, track, world).traps, []);
});
test("unavailable or already collected boxes do not distract the AI", () => {
  const { track, car, world } = fixture();
  world.boxes[0].readyAt = 2;
  assert.equal(itemCourse(car, track, world).pickupLane, null);
  world.boxes[0].readyAt = 0;
  world.players[car.id].pickedLaps[0] = 0;
  assert.equal(itemCourse(car, track, world).pickupLane, null);
});

test("a nearer harmless trap cannot hide a second trap directly ahead", () => {
  const { track, car, world, ahead } = fixture();
  world.boxes = [];
  car.storedNitro = 1;
  world.traps = [{ x: ahead.x, z: ahead.z, owner: "rival", ttl: 13 }];
  const near = trackPoint(car.lastT + 10 / track.length, track);
  world.traps.push({
    x: near.x - Math.cos(near.heading) * 5,
    z: near.z + Math.sin(near.heading) * 5,
    owner: "rival",
    ttl: 13,
  });
  const both = aiInput(car, track, "hard", 10, [], world);
  assert.equal(both.boost, false);
  assert.ok(
    both.steer > 0.15,
    "steer right to clear both the centre and left traps",
  );
});
