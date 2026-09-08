import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar, stepCar, EMPTY_INPUT, type Car } from "../shared/race.ts";
import { driftEfficiency } from "../shared/driving-skills.ts";
import { DEFAULT_TRACK, trackPoint } from "../shared/track.ts";

const dt = 1 / 60;
const openTrack = { ...DEFAULT_TRACK, width: 2000, obstacles: [] };

function movingCar(speed = 35) {
  const car = spawnCar();
  Object.assign(car, {
    speed,
    vx: Math.sin(car.heading) * speed,
    vz: Math.cos(car.heading) * speed,
  });
  return car;
}

function drift(car: Car, ticks: number, steer = 0.7) {
  for (let tick = 0; tick < ticks; tick++)
    stepCar(
      car,
      { ...EMPTY_INPUT, throttle: 1, drift: true, steer },
      dt,
      openTrack,
    );
}

function recover(car: Car) {
  const before = car.cleanDrifts;
  for (let tick = 0; tick < 90 && car.cleanDrifts === before; tick++)
    stepCar(car, { ...EMPTY_INPUT, throttle: 1 }, dt, openTrack);
  assert.equal(car.cleanDrifts, before + 1, "drift must recover on real inputs");
}

test("fresh cars expose initialized serializable driving telemetry", () => {
  const car = spawnCar();
  assert.deepEqual(
    {
      cleanDrifts: car.cleanDrifts,
      driftChains: car.driftChains,
      driftAttempts: car.driftAttempts,
      miniOpportunities: car.miniOpportunities,
      missedMini: car.missedMini,
      lastDriftGain: car.lastDriftGain,
      lastDriftKind: car.lastDriftKind,
    },
    {
      cleanDrifts: 0,
      driftChains: 0,
      driftAttempts: 0,
      miniOpportunities: 0,
      missedMini: 0,
      lastDriftGain: 0,
      lastDriftKind: "none",
    },
  );
  assert.deepEqual(structuredClone(car), car);
});

test("a recovered short drift records gain and one mini opportunity", () => {
  const car = movingCar();
  drift(car, 30);
  recover(car);
  assert.equal(car.driftAttempts, 1);
  assert.equal(car.cleanDrifts, 1);
  assert.equal(car.driftChains, 0);
  assert.equal(car.miniOpportunities, 1);
  assert.equal(car.lastDriftKind, "short");
  assert.ok(car.lastDriftGain > 1);
  assert.ok(car.miniWindow > 0);
});

test("a sustained recovered drift is classified long", () => {
  const car = movingCar();
  drift(car, 60);
  recover(car);
  assert.equal(car.driftAttempts, 1);
  assert.equal(car.cleanDrifts, 1);
  assert.equal(car.lastDriftKind, "long");
  assert.ok(car.lastDriftGain > 10);
});

test("starting the next drift inside the mini window records a completed chain", () => {
  const car = movingCar();
  drift(car, 30);
  recover(car);
  drift(car, 27, -1);
  recover(car);
  assert.equal(car.driftAttempts, 2);
  assert.equal(car.cleanDrifts, 2);
  assert.equal(car.driftChains, 1);
  assert.equal(car.miniOpportunities, 2);
  assert.equal(car.missedMini, 0, "a chain consumes the prior mini opportunity");
  assert.equal(car.lastDriftKind, "chain");
});

test("an earned mini window counts as missed only when it expires unused", () => {
  const missed = movingCar();
  drift(missed, 30);
  recover(missed);
  for (let tick = 0; tick < 40; tick++) stepCar(missed, EMPTY_INPUT, dt, openTrack);
  assert.equal(missed.miniOpportunities, 1);
  assert.equal(missed.missedMini, 1);
  assert.equal(missed.miniUses, 0);

  const used = movingCar();
  drift(used, 30);
  recover(used);
  stepCar(used, EMPTY_INPUT, dt, openTrack);
  stepCar(used, { ...EMPTY_INPUT, throttle: 1 }, dt, openTrack);
  for (let tick = 0; tick < 40; tick++) stepCar(used, EMPTY_INPUT, dt, openTrack);
  assert.equal(used.miniUses, 1);
  assert.equal(used.missedMini, 0);
});

test("drift efficiency rewards useful speed and angle while overdrift is costly", () => {
  const peak = (30 * Math.PI) / 180;
  assert.equal(driftEfficiency(0, peak, 1), 0);
  assert.equal(driftEfficiency(-35, peak, 1), 0);
  assert.equal(driftEfficiency(14, peak, 1), 0);
  assert.ok(driftEfficiency(38, peak, 0.6) > driftEfficiency(20, peak, 0.6));
  assert.ok(driftEfficiency(38, peak, 0.6) > driftEfficiency(38, (55 * Math.PI) / 180, 0.6));
  assert.equal(driftEfficiency(38, (70 * Math.PI) / 180, 0.6), 0);

  const ideal = movingCar(35);
  ideal.heading += peak;
  const over = movingCar(35);
  over.heading += (55 * Math.PI) / 180;
  stepCar(ideal, { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 0.16 }, dt, openTrack);
  stepCar(over, { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 0.16 }, dt, openTrack);
  assert.ok(ideal.energy > over.energy, `${ideal.energy} versus ${over.energy}`);
  assert.ok(ideal.speed > over.speed, `${ideal.speed} versus ${over.speed}`);
});

test("a drift interrupted by contact cannot publish partial gain as a completed skill", () => {
  const car = movingCar();
  drift(car, 30);
  assert.ok(car.lastDriftGain > 0);
  const obstacleTrack = {
    ...openTrack,
    obstacles: [
      {
        x: car.x + Math.sin(car.heading) * 3.1,
        z: car.z + Math.cos(car.heading) * 3.1,
        radius: 2,
      },
    ],
  };
  stepCar(
    car,
    { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 0.7 },
    dt,
    obstacleTrack,
  );
  assert.ok(car.collisionCount > 0);
  assert.equal(car.cleanDrifts, 0);
  assert.equal(car.miniOpportunities, 0);
  assert.equal(car.lastDriftGain, 0);
  assert.equal(car.lastDriftKind, "none");
});

test("low speed, wall contact and reset cannot farm completed drift skills", () => {
  const slow = movingCar(9);
  for (let tick = 0; tick < 90; tick++)
    stepCar(
      slow,
      { ...EMPTY_INPUT, drift: true, steer: 1 },
      dt,
      openTrack,
    );
  assert.equal(slow.energy, 0);
  assert.equal(slow.driftAttempts, 0);
  assert.equal(slow.cleanDrifts, 0);

  const p = trackPoint(0);
  const blockedTrack = {
    ...DEFAULT_TRACK,
    width: 2000,
    obstacles: [{ x: p.x, z: p.z, radius: 2 }],
  };
  const blocked = movingCar();
  for (let tick = 0; tick < 90; tick++)
    stepCar(
      blocked,
      { ...EMPTY_INPUT, throttle: 1, drift: true, steer: 1 },
      dt,
      blockedTrack,
    );
  assert.equal(blocked.energy, 0);
  assert.equal(blocked.cleanDrifts, 0);
  assert.equal(blocked.miniOpportunities, 0);

  const reset = movingCar();
  drift(reset, 30);
  assert.ok(reset.energy > 0);
  stepCar(reset, { ...EMPTY_INPUT, reset: true }, dt, openTrack);
  for (let tick = 0; tick < 100; tick++) stepCar(reset, EMPTY_INPUT, dt, openTrack);
  assert.equal(reset.cleanDrifts, 0);
  assert.equal(reset.miniOpportunities, 0);
  assert.equal(reset.lastDriftKind, "none");
  assert.equal(reset.lastDriftGain, 0);
});
