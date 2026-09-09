import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { spawnCar } from "../shared/race.ts";
import { DEFAULT_TRACK } from "../shared/track.ts";
import {
  EmissionClock,
  DrivingCues,
  ParticlePool,
  kartAnchor,
  driftSparkColor,
} from "../client/vfx/driving-state.ts";
import { DrivingVfx } from "../client/vfx/driving.ts";

test("emission is time based at 30, 60 and 144 Hz and never catches up after a suspended frame", () => {
  for (const hz of [30, 60, 144]) {
    const clock = new EmissionClock();
    let count = 0;
    for (let i = 0; i < hz * 2; i++) count += clock.take(24, 1 / hz);
    assert.equal(count, 48);
    assert.equal(clock.take(24, 0), 0);
    assert.equal(clock.take(24, 2), 0);
    assert.equal(clock.take(24, 1 / 24), 1);
  }
});

test("rear wheel and exhaust anchors rotate with the kart, including its rear offset", () => {
  const car = { x: 10, z: 20, heading: Math.PI / 2 };
  const rear = kartAnchor(car, 1.18, -1.12);
  assert.ok(Math.abs(rear.x - 8.88) < 1e-9);
  assert.ok(Math.abs(rear.z - 18.82) < 1e-9);
  const exhaust = kartAnchor({ ...car, heading: 0 }, -0.48, -1.64);
  assert.deepEqual(exhaust, { x: 9.52, z: 18.36 });
});

test("confirmed driving cues baseline, deduplicate, and ignore rollback and inactive transitions", () => {
  const cues = new DrivingCues(),
    c = spawnCar();
  c.nitroUses = 3;
  assert.equal(cues.take(c, true), 0);
  c.nitroUses++;
  assert.equal(cues.take(c, true), 1);
  assert.equal(cues.take(c, true), 0);
  c.nitroUses--;
  cues.take(c, true);
  c.nitroUses++;
  assert.equal(cues.take(c, true), 0);
  c.miniUses++;
  assert.equal(cues.take(c, false), 0);
  assert.equal(cues.take(c, true), 0);
  cues.clear();
  assert.equal(cues.take(c, true), 0);
});

test("particle storage is bounded, paused ages remain stable and expired slots are reusable", () => {
  const pool = new ParticlePool(2);
  assert.equal(pool.emit(0, 1, 0, 0, 2, 0, 1, 1, 0xffffff), true);
  assert.equal(pool.emit(1, 1, 0, 0, 2, 0, 0.5, 1, 0xffffff), true);
  assert.equal(pool.emit(2, 1, 0, 0, 2, 0, 1, 1, 0xffffff), false);
  pool.tick(0);
  assert.equal(pool.count, 2);
  assert.equal(pool.y[0], 1);
  pool.tick(0.6);
  assert.equal(pool.count, 1);
  assert.equal(pool.emit(2, 1, 0, 0, 2, 0, 1, 1, 0xffffff), true);
  pool.clear();
  assert.equal(pool.count, 0);
});

test("driver effects stop at pause, break across reset/teleport and dispose exactly once", () => {
  const scene = new THREE.Scene(),
    fx = new DrivingVfx(scene, DEFAULT_TRACK);
  const c = spawnCar();
  Object.assign(c, {
    drifting: true,
    speed: 25,
    slipAngle: 0.4,
    driftDuration: 0.4,
  });
  const frame = {
    active: true,
    paused: false,
    quality: "high",
    motion: 1,
    authoritative: [c],
  };
  fx.update([c], c.id, 1 / 60, frame);
  c.x += 1;
  fx.update([c], c.id, 1 / 60, frame);
  assert.ok(fx.stats.skids > 0);
  const before = { ...fx.stats };
  fx.update([c], c.id, 1, { ...frame, paused: true });
  assert.deepEqual(fx.stats, before);
  c.x += 100;
  fx.update([c], c.id, 1 / 60, frame);
  assert.equal(fx.stats.skids, before.skids);
  c.resetTime = 1;
  c.x += 1;
  fx.update([c], c.id, 1 / 60, frame);
  assert.equal(fx.stats.skids, before.skids);
  fx.reset();
  assert.deepEqual(fx.stats, { particles: 0, skids: 0, flames: 0 });
  let releases = 0;
  fx.group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points)
      o.geometry.addEventListener("dispose", () => releases++);
  });
  const expected = fx.group.children.length;
  fx.dispose();
  fx.dispose();
  assert.equal(fx.group.parent, null);
  assert.equal(releases, expected);
});

test("ghost and inactive racers emit nothing, low quality stays inside the pool budget", () => {
  const fx = new DrivingVfx(new THREE.Scene(), DEFAULT_TRACK),
    c = spawnCar(0, "ghost");
  Object.assign(c, { drifting: true, speed: 35, boostTime: 1, slipAngle: 0.6 });
  for (let i = 0; i < 60; i++) {
    c.z += 0.5;
    fx.update([c], c.id, 1 / 60, {
      active: true,
      paused: false,
      quality: "low",
      motion: 1,
    });
  }
  assert.deepEqual(fx.stats, { particles: 0, skids: 0, flames: 0 });
  c.id = "local";
  for (let i = 0; i < 600; i++) {
    c.z += 0.5;
    fx.update([c], c.id, 1 / 60, {
      active: true,
      paused: false,
      quality: "low",
      motion: 1,
    });
    assert.ok(fx.stats.particles <= 192);
    assert.ok(fx.stats.skids <= 256);
  }
  fx.update([c], c.id, 1 / 60, {
    active: false,
    paused: false,
    quality: "low",
    motion: 1,
  });
  assert.deepEqual(fx.stats, { particles: 0, skids: 0, flames: 0 });
  fx.dispose();
});

test("online prediction cannot trigger the ignition burst before confirmation", () => {
  const fx = new DrivingVfx(new THREE.Scene(), DEFAULT_TRACK),
    c = spawnCar();
  const confirmed = { ...c };
  const frame = {
    active: true,
    paused: false,
    quality: "high",
    motion: 1,
    authoritative: [confirmed],
  };
  fx.update([c], c.id, 1 / 60, frame);
  c.nitroUses = 1;
  c.boostTime = 2;
  fx.update([c], c.id, 1 / 60, frame);
  assert.equal(fx.stats.particles, 0);
  assert.equal(fx.stats.flames, 2);
  confirmed.nitroUses = 1;
  fx.update([c], c.id, 1 / 60, frame);
  const count = fx.stats.particles;
  assert.ok(count > 0);
  fx.update([c], c.id, 1 / 60, frame);
  // A short continuous exhaust trail may add one dot; the 18-dot ignition must not repeat.
  assert.ok(fx.stats.particles <= count + 2);
  fx.dispose();
});

test("charging sparks require real drift eligibility and stop at lockout or full charge", () => {
  const c = spawnCar();
  Object.assign(c, {
    drifting: true,
    driftState: "drifting",
    driftDuration: 0.5,
    speed: 30,
    slipAngle: 0.4,
  });
  assert.notEqual(driftSparkColor(c), null);
  for (const patch of [
    { driftState: "entering" },
    { speed: 8 },
    { slipAngle: 0.13 },
    { energyLockTime: 0.2 },
    { energy: 100 },
  ]) {
    assert.equal(driftSparkColor({ ...c, ...patch } as typeof c), null);
  }
});

test("low-quality culling consumes omitted rival events instead of replaying an expired ignition", () => {
  const fx = new DrivingVfx(new THREE.Scene(), DEFAULT_TRACK);
  const local = spawnCar(),
    rival = { ...local, id: "rival", x: local.x + 0.5 };
  const a = { ...local, id: "a", x: local.x + 1 },
    b = { ...local, id: "b", x: local.x + 2 };
  const cars = [local, rival, a, b];
  const frame = {
    active: true,
    paused: false,
    quality: "low",
    motion: 1,
    authoritative: cars,
  };
  fx.update(cars, local.id, 1 / 60, frame);
  a.x = local.x + 0.1;
  b.x = local.x + 0.2;
  rival.nitroUses++;
  fx.update(cars, local.id, 1 / 60, frame);
  a.x = local.x + 4;
  b.x = local.x + 5;
  fx.update(cars, local.id, 1 / 60, frame);
  assert.equal(fx.stats.particles, 0);
  fx.dispose();
});

test("resuming after suspension clears old particles and baselines hidden ignition events", () => {
  const fx = new DrivingVfx(new THREE.Scene(), DEFAULT_TRACK),
    c = spawnCar();
  const frame = {
    active: true,
    paused: false,
    quality: "high",
    motion: 1,
    authoritative: [c],
  };
  fx.update([c], c.id, 1 / 60, frame);
  c.nitroUses++;
  c.boostTime = 1;
  fx.update([c], c.id, 1 / 60, frame);
  assert.ok(fx.stats.particles > 0);
  c.nitroUses++;
  c.boostTime = 0;
  fx.update([c], c.id, 1.5, frame);
  assert.deepEqual(fx.stats, { particles: 0, skids: 0, flames: 0 });
  fx.update([c], c.id, 1 / 60, frame);
  assert.equal(fx.stats.particles, 0);
  fx.dispose();
});

test("a full skid budget keeps drawing under the current rear wheels by replacing the oldest marks", () => {
  const fx = new DrivingVfx(new THREE.Scene(), DEFAULT_TRACK),
    c = spawnCar();
  Object.assign(c, { heading: 0, drifting: true, speed: 30, slipAngle: 0.4 });
  for (let i = 0; i < 300; i++) {
    c.z += 1;
    fx.update([c], c.id, 1 / 60, {
      active: true,
      paused: false,
      quality: "high",
      motion: 0,
    });
  }
  const marks = fx.group.children[0] as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  let nearest = Infinity;
  for (let i = 0; i < marks.count; i++) {
    marks.getMatrixAt(i, matrix);
    nearest = Math.min(nearest, Math.abs(matrix.elements[14] - (c.z - 1.12)));
  }
  assert.equal(fx.stats.skids, 480);
  assert.ok(
    nearest < 1,
    `latest tyre mark is ${nearest}m behind the rear wheel`,
  );
  fx.dispose();
});

test("confirmed ignition is stronger than sustain, chaining is restrained and pressure freezes then clears", () => {
  const fx = new DrivingVfx(new THREE.Scene(), DEFAULT_TRACK),
    c = spawnCar();
  const f = {
    active: true,
    paused: false,
    quality: "high",
    motion: 1,
    authoritative: [c],
  };
  fx.update([c], c.id, 0.02, f);
  c.boostTime = 3;
  c.nitroUses++;
  fx.update([c], c.id, 0.02, f);
  const flame = fx.group.children.find(
    (o) =>
      o instanceof THREE.InstancedMesh && o.geometry.type === "ConeGeometry",
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  const length = () => {
    flame.getMatrixAt(0, matrix);
    return new THREE.Vector3().setFromMatrixScale(matrix).y;
  };
  const ignition = length();
  assert.equal(fx.impactPressure, true);
  fx.update([c], c.id, 0.2, { ...f, paused: true });
  assert.equal(length(), ignition);
  for (let n = 0; n < 12; n++) fx.update([c], c.id, 0.02, f);
  assert.equal(fx.impactPressure, false);
  const sustain = length();
  assert.ok(ignition > sustain * 1.3);
  c.nitroUses++;
  fx.update([c], c.id, 0.02, f);
  const chain = length();
  assert.ok(chain < ignition * 0.85);
  assert.ok(chain > sustain);
  fx.update([c], c.id, 0.02, { ...f, motion: 0 });
  assert.equal(fx.impactPressure, false);
  fx.update([c], c.id, 1, f);
  assert.equal(fx.impactPressure, false);
  fx.dispose();
});
