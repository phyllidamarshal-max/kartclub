import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { World } from "../client/world.ts";
test("ten rounds of fresh session IDs release departed cars and GPU objects", () => {
  const w = Object.create(World.prototype) as World;
  w.scene = new THREE.Scene();
  w.cars = new Map();
  let released = 0;
  for (let round = 0; round < 10; round++) {
    const live = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const id = `${round}-${i}`,
        g = new THREE.Group(),
        geo = new THREE.BoxGeometry(),
        m = new THREE.MeshBasicMaterial();
      geo.addEventListener("dispose", () => released++);
      g.add(new THREE.Mesh(geo, m));
      w.cars.set(id, g);
      w.scene.add(g);
      live.add(id);
    }
    w.pruneCars(live);
    assert.equal(w.cars.size, 8);
    assert.equal(w.scene.children.length, 8);
  }
  w.pruneCars(new Set());
  assert.equal(w.cars.size, 0);
  assert.equal(released, 80);
});
