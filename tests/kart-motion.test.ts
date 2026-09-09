import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { spawnCar } from "../shared/race.ts";
import { KartMotion } from "../client/kart-motion.ts";

function rig() {
  const root = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const wheel = new THREE.Group(), spin = new THREE.Group();
    wheel.name = `wheel-${i}`;
    spin.name = `wheel-spin-${i}`;
    wheel.userData = { wheelRadius: 0.6, steerable: i < 2, spinNode: spin.name };
    wheel.add(spin);
    root.add(wheel);
  }
  return { root, motion: new KartMotion(root) };
}

test("wheel rotation follows signed longitudinal travel, independent of frame rate", () => {
  for (const frames of [30, 60, 120]) {
    const {root, motion} = rig(), c = spawnCar();
    Object.assign(c, {x:0,z:0,heading:0,speed:6,vz:6});
    motion.update(c, 0, 0);
    const original = structuredClone(c);
    for (let frame=1; frame<=frames; frame++) {
      c.z = 6 * frame / frames;
      motion.update(c, 1/frames, 0);
    }
    const rotation = root.getObjectByName("wheel-spin-0")!.rotation.x;
    assert.ok(Math.abs(Math.sin(rotation) - Math.sin(10)) < 1e-8);
    assert.equal(c.heading, original.heading);
    assert.equal(c.speed, original.speed);
    c.z -= 0.6;
    motion.update(c, 0.1, 0);
    assert.ok(Math.abs(Math.sin(root.getObjectByName("wheel-spin-0")!.rotation.x) - Math.sin(9)) < 1e-8);
  }
});

test("front wheels follow input while stopped; rear wheels do not steer", () => {
  const {root,motion} = rig(), c=spawnCar();
  motion.update(c, 0.1, 1);
  for (let i=0;i<10;i++) motion.update(c, 0.1, 1);
  assert.ok(root.getObjectByName("wheel-0")!.rotation.y > 0.2);
  assert.equal(root.getObjectByName("wheel-2")!.rotation.y, 0);
  assert.equal(root.getObjectByName("wheel-spin-0")!.rotation.x, 0);
});

test("pause, reset and teleport do not accumulate wheel travel or mutate the car", () => {
  const {root,motion}=rig(),c=spawnCar();
  Object.assign(c,{x:0,z:0,heading:0});
  motion.update(c,0,0);
  c.z=100;
  motion.update(c,1/60,0);
  c.z=101; c.resetTime=1;
  motion.update(c,1/60,0);
  c.z=102; c.resetTime=0;
  motion.update(c,1/60,0);
  const before=structuredClone(c);
  for(let i=0;i<60;i++) motion.update(c,1/60,0);
  assert.equal(root.getObjectByName("wheel-spin-0")!.rotation.x,0);
  assert.deepEqual(c,before);
});
