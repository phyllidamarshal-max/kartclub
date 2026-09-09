import { test } from "node:test";
import assert from "node:assert/strict";
import { aiInput } from "../shared/ai.ts";
import { TRACKS, trackPoint } from "./fixtures/tracks-before-route-mastery.ts";
import { spawnCar, stepCar } from "../shared/race.ts";

test("AI brakes for an outward corner exit but accelerates once aligned", () => {
  const track = TRACKS.find((track) => track.id === "mountain-pass")!;
  const point = trackPoint(0.3518, track);
  const car = spawnCar(1, "corner-exit", track);
  car.lastT = point.t;
  car.x = point.x + Math.cos(point.heading) * 0.31;
  car.z = point.z - Math.sin(point.heading) * 0.31;
  car.lastX = car.x;
  car.lastZ = car.z;
  car.heading = point.heading - 0.48;
  car.speed = 21.69;
  car.vx = Math.sin(point.heading - 0.58) * car.speed;
  car.vz = Math.cos(point.heading - 0.58) * car.speed;
  car.slipAngle = 0.1;
  const input = aiInput(car, track, "hard", 18.5);
  assert.ok(
    input.steer > 0.8,
    "steer into the corner to arrest outward travel",
  );
  assert.ok(
    input.throttle <= 0,
    "do not accelerate while the kart is sliding toward the wall",
  );
  car.heading = point.heading;
  car.vx = Math.sin(point.heading) * car.speed;
  car.vz = Math.cos(point.heading) * car.speed;
  car.slipAngle = 0;
  assert.ok(aiInput(car, track, "hard", 18.5).throttle > 0);
});

test("expert city laps avoid the wall when accelerating out of the narrowing turn", () => {
  const track = TRACKS.find((track) => track.id === "city")!;
  const car = spawnCar(1, "city-exits", track);
  for (let i = 0; i < 60 * 180 && car.lap < 3; i++)
    stepCar(car, aiInput(car, track, "hard", i / 60), 1 / 60, track);
  assert.equal(car.lap, 3);
  assert.equal(car.collisionCount, 0);
});

