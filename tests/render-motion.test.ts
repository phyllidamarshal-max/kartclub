import { test } from "node:test";
import assert from "node:assert/strict";
import { interpolateCar, capturePose } from "../client/render-motion.ts";
import { spawnCar, stepCar, EMPTY_INPUT } from "../shared/race.ts";

test("144 Hz rendering advances smoothly between 60 Hz startup physics ticks", () => {
  const car = spawnCar();
  let previous = capturePose(car),
    accumulator = 0,
    lastX = car.x,
    lastZ = car.z;
  const distances: number[] = [];
  for (let frame = 0; frame < 144; frame++) {
    accumulator += 1 / 144;
    while (accumulator >= 1 / 60) {
      previous = capturePose(car);
      stepCar(car, { ...EMPTY_INPUT, throttle: 1 }, 1 / 60);
      accumulator -= 1 / 60;
    }
    const visible = interpolateCar(car, previous, accumulator * 60);
    const distance = Math.hypot(visible.x - lastX, visible.z - lastZ);
    distances.push(distance);
    lastX = visible.x;
    lastZ = visible.z;
  }
  const firstMotion = distances.findIndex((d) => d > 0);
  assert.ok(
    firstMotion >= 0 && firstMotion <= 3,
    "only one simulation tick of interpolation delay",
  );
  assert.ok(
    distances.slice(firstMotion).every((d) => d > 0),
    "no repeated frozen poses from the very first movement",
  );
  assert.ok(
    distances.every((d, i) => !i || Math.abs(d - distances[i - 1]) < 0.003),
    "no double-step jumps even during initial acceleration",
  );
});

test("idle poses stay exact and interpolation never mutates authoritative physics", () => {
  const car = spawnCar(),
    original = { ...car },
    previous = capturePose(car);
  for (const alpha of [0, 0.1, 0.7, 1]) {
    assert.deepEqual(interpolateCar(car, previous, alpha), car);
  }
  assert.deepEqual(car, original);
});

test("heading uses the short arc and resets snap instead of sliding through the map", () => {
  const car = spawnCar();
  car.heading = -Math.PI + 0.01;
  const previous = {
    ...capturePose(car),
    heading: Math.PI - 0.01,
    x: car.x - 1,
  };
  const visible = interpolateCar(car, previous, 0.5);
  assert.ok(Math.abs(Math.abs(visible.heading) - Math.PI) < 1e-8);
  assert.ok(Math.abs(visible.x - (car.x - 0.5)) < 1e-10);
  assert.equal(
    interpolateCar(car, { ...previous, x: car.x - 100 }, 0.2).x,
    car.x,
  );
  car.resetTime = 1;
  assert.equal(interpolateCar(car, previous, 0.2).x, car.x);
});
