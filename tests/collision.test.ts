import { test } from "node:test";
import assert from "node:assert/strict";
import {
  spawnCar,
  stepCar,
  separateCars,
  EMPTY_INPUT,
  type Car,
} from "../shared/race.ts";
import * as tracks from "../shared/track.ts";

const diameter = 2.1;
function pair() {
  const a = spawnCar(0, "a"),
    b = spawnCar(1, "b");
  const p = tracks.trackPoint(0);
  Object.assign(a, { x: p.x, z: p.z });
  Object.assign(b, { x: p.x, z: p.z });
  return [a, b];
}
function finite(c: Car) {
  for (const key of [
    "x",
    "z",
    "vx",
    "vz",
    "speed",
    "ghostTime",
    "impact",
  ] as const)
    assert.ok(Number.isFinite(c[key]), `${key} must be finite`);
}
function distance(a: Car, b: Car) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

test("zero-distance overlap separates exactly without NaN or free energy", () => {
  const cars = pair();
  separateCars(cars);
  cars.forEach(finite);
  assert.ok(distance(...(cars as [Car, Car])) >= diameter - 1e-6);
  assert.equal(cars[0].speed, 0);
  assert.equal(cars[1].speed, 0);
});

test("rear contact transfers bounded momentum and never adds kinetic energy", () => {
  const [a, b] = pair(),
    h = a.heading;
  a.x -= Math.sin(h);
  a.z -= Math.cos(h);
  a.vx = Math.sin(h) * 40;
  a.vz = Math.cos(h) * 40;
  a.speed = 40;
  separateCars([a, b]);
  assert.ok(b.vx * Math.sin(h) + b.vz * Math.cos(h) > 5);
  assert.ok(b.speed > 5 && b.speed <= 24);
  assert.ok(a.speed < 40 && a.speed >= 16);
  assert.ok(a.vx ** 2 + a.vz ** 2 + b.vx ** 2 + b.vz ** 2 <= 1600 + 1e-6);
  assert.ok(a.impact > 0 && b.impact > 0);
  const impact = a.impact;
  stepCar(a, EMPTY_INPUT, 1 / 60);
  assert.ok(a.impact < impact);
});

test("wall contact retains tangent velocity and removes strong outward normal velocity", () => {
  const c = spawnCar(),
    p = tracks.trackPoint(0),
    nx = Math.cos(p.heading),
    nz = -Math.sin(p.heading);
  Object.assign(c, {
    x: p.x + nx * 9,
    z: p.z + nz * 9,
    vx: Math.sin(p.heading) * 20 + nx * 30,
    vz: Math.cos(p.heading) * 20 + nz * 30,
    heading: p.heading + Math.atan2(30, 20),
    speed: Math.hypot(20, 30),
  });
  stepCar(c, EMPTY_INPUT, 0);
  assert.ok(c.vx * Math.sin(p.heading) + c.vz * Math.cos(p.heading) > 19);
  assert.ok(Math.abs(c.vx * nx + c.vz * nz) < 1);
  assert.ok(c.speed < 20);
});

test("reset grants two seconds of contact grace which held reset cannot extend", () => {
  const [a, b] = pair();
  stepCar(a, { ...EMPTY_INPUT, reset: true }, 1 / 60);
  assert.equal(a.ghostTime, 2);
  Object.assign(b, { x: a.x, z: a.z });
  separateCars([a, b]);
  assert.equal(distance(a, b), 0);
  for (let i = 0; i < 121; i++)
    stepCar(a, { ...EMPTY_INPUT, reset: true }, 1 / 60);
  assert.equal(a.ghostTime, 0);
  Object.assign(b, { x: a.x, z: a.z });
  separateCars([a, b]);
  assert.ok(distance(a, b) >= diameter - 1e-6);
});

test("cars overlapping at a road boundary separate while both stay on road", () => {
  const [a, b] = pair(),
    p = tracks.trackPoint(0);
  for (const c of [a, b])
    Object.assign(c, {
      x: p.x + Math.cos(p.heading) * 6.94,
      z: p.z - Math.sin(p.heading) * 6.94,
    });
  separateCars([a, b]);
  for (const c of [a, b]) {
    finite(c);
    assert.ok(
      tracks.nearestTrack(c.x, c.z).distance <=
        tracks.ROAD_WIDTH / 2 - 1.05 + 1e-5,
    );
  }
  assert.ok(distance(a, b) >= diameter - 1e-5);
});

test("finished cars are ignored by vehicle contacts", () => {
  const [a, b] = pair();
  b.finished = true;
  const before = structuredClone([a, b]);
  separateCars([a, b]);
  assert.deepEqual([a, b], before);
});

test("invalid timestep cannot corrupt vehicle state", () => {
  const c = spawnCar();
  stepCar(c, EMPTY_INPUT, NaN);
  finite(c);
});

test("track obstacles stop a car from passing through their centre", () => {
  assert.ok(tracks.DEFAULT_TRACK, "custom track API is available");
  const p = tracks.trackPoint(0);
  const track = {
    ...tracks.DEFAULT_TRACK,
    obstacles: [{ x: p.x, z: p.z, radius: 2 }],
  };
  const c = spawnCar();
  Object.assign(c, {
    x: p.x,
    z: p.z,
    vx: Math.sin(p.heading) * 40,
    vz: Math.cos(p.heading) * 40,
    speed: 40,
  });
  stepCar(c, EMPTY_INPUT, 1 / 60, track);
  assert.ok(Math.hypot(c.x - p.x, c.z - p.z) >= 3.05 - 1e-6);
  assert.ok(c.speed < 10);
  finite(c);
});

test("side contact pushes moderately without changing the common forward velocity", () => {
  const [a, b] = pair(),
    nx = Math.cos(a.heading),
    nz = -Math.sin(a.heading);
  a.x -= nx;
  a.z -= nz;
  for (const c of [a, b])
    Object.assign(c, {
      vx: Math.sin(c.heading) * 20,
      vz: Math.cos(c.heading) * 20,
      speed: 20,
    });
  a.vx += nx * 12;
  a.vz += nz * 12;
  separateCars([a, b]);
  assert.ok(b.vx * nx + b.vz * nz > 3);
  assert.ok(b.vx * nx + b.vz * nz < 9);
  for (const c of [a, b]) assert.ok(Math.abs(c.speed - 20) < 1e-6);
});

test("a four-car boundary pileup fully separates and stays finite under repeated contacts", () => {
  const p = tracks.trackPoint(0),
    nx = Math.cos(p.heading),
    nz = -Math.sin(p.heading);
  const cars = Array.from({ length: 4 }, (_, i) => {
    const c = spawnCar(i, String(i));
    Object.assign(c, {
      x: p.x + nx * (6.94 - i * 0.2),
      z: p.z + nz * (6.94 - i * 0.2),
      vx: nx * 30,
      vz: nz * 30,
      speed: 0,
    });
    return c;
  });
  for (let frame = 0; frame < 100; frame++) {
    separateCars(cars);
    for (let i = 0; i < cars.length; i++) {
      finite(cars[i]);
      assert.ok(
        tracks.nearestTrack(cars[i].x, cars[i].z).distance <=
          tracks.ROAD_WIDTH / 2 - 1.05 + 1e-5,
      );
      for (let j = i + 1; j < cars.length; j++)
        assert.ok(
          distance(cars[i], cars[j]) >= diameter - 1e-5,
          `frame ${frame}, pair ${i}/${j}: ${distance(cars[i], cars[j])}`,
        );
    }
    assert.ok(
      cars.reduce((sum, c) => sum + c.vx ** 2 + c.vz ** 2, 0) <= 3600 + 1e-5,
    );
  }
});

test("obstacle sweep catches movement that crosses the entire obstacle in one step", () => {
  const p = tracks.trackPoint(0),
    sx = Math.sin(p.heading),
    sz = Math.cos(p.heading);
  const track = {
    ...tracks.DEFAULT_TRACK,
    obstacles: [{ x: p.x, z: p.z, radius: 0.1 }],
  };
  const c = spawnCar();
  Object.assign(c, {
    x: p.x - sx * 2,
    z: p.z - sz * 2,
    vx: sx * 200,
    vz: sz * 200,
    speed: 63,
  });
  stepCar(c, EMPTY_INPUT, 1 / 30, track);
  assert.ok((c.x - p.x) * sx + (c.z - p.z) * sz <= -1.15 + 1e-6);
  assert.ok(Math.hypot(c.vx, c.vz) < 1e-6);
});

test("custom road widths and the mountain shortcut constrain car centres", () => {
  const track = { ...tracks.DEFAULT_TRACK, width: 10 };
  const c = spawnCar(0, "narrow", track),
    p = tracks.trackPoint(0, track);
  Object.assign(c, {
    x: p.x + Math.cos(p.heading) * 7,
    z: p.z - Math.sin(p.heading) * 7,
  });
  stepCar(c, EMPTY_INPUT, 0, track);
  assert.ok(tracks.nearestTrack(c.x, c.z, track).distance <= 3.95 + 1e-6);
  const mountain = tracks.getTrack("mountain"),
    shortcut = mountain.shortcut[40];
  Object.assign(c, {
    x: shortcut.x + Math.cos(shortcut.heading) * 3,
    z: shortcut.z - Math.sin(shortcut.heading) * 3,
  });
  stepCar(c, EMPTY_INPUT, 0, mountain);
  assert.ok(tracks.nearestTrack(c.x, c.z, mountain).distance <= 2.45 + 1e-6);
});

for (const penetration of [0, 1e-12]) {
  for (const direction of ["tangent", "outward"] as const) {
    test(`obstacle boundary allows ${direction} movement with ${penetration} penetration`, () => {
      const p = tracks.trackPoint(0);
      const track = {
        ...tracks.DEFAULT_TRACK,
        obstacles: [{ x: p.x, z: p.z, radius: 2 }],
      };
      const c = spawnCar();
      Object.assign(c, {
        x: p.x + 3.05 - penetration,
        z: p.z,
        heading: direction === "tangent" ? 0 : Math.PI / 2,
        vx: direction === "tangent" ? 0 : 20,
        vz: direction === "tangent" ? 20 : 0,
        speed: 20,
      });
      const startX = c.x,
        startZ = c.z;
      stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, 1 / 60, track);
      assert.ok(
        Math.hypot(c.x - startX, c.z - startZ) > 0.3,
        "first frame must retain its movement",
      );
      for (let frame = 1; frame < 60; frame++) {
        stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, 1 / 60, track);
        assert.ok(Math.hypot(c.x - p.x, c.z - p.z) >= 3.05 - 1e-7);
      }
      assert.ok(
        Math.hypot(c.x - startX, c.z - startZ) > 3,
        "car must escape the initial contact after 60 frames",
      );
      finite(c);
    });
  }
}
