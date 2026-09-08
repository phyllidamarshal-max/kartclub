import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createKartModel } from "../client/kart-model.ts";

test("kart model has the expected low, wide composition and named controls", () => {
  const kart = createKartModel("#a7cf35");
  kart.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(kart);
  const size = bounds.getSize(new THREE.Vector3());
  for (const value of [...bounds.min.toArray(), ...bounds.max.toArray()])
    assert.ok(Number.isFinite(value));
  assert.ok(size.x >= 2.5 && size.x <= 2.9, `unexpected width ${size.x}`);
  assert.ok(size.z >= 3.7 && size.z <= 4.2, `unexpected length ${size.z}`);
  assert.ok(
    bounds.max.y >= 2.9 && bounds.max.y <= 3.4,
    `unexpected height ${bounds.max.y}`,
  );
  assert.ok(
    Math.abs(bounds.min.y - 0.1) < 0.015,
    `tire floor is ${bounds.min.y}`,
  );

  const wheels = kart.children.filter((child) =>
    child.name.startsWith("wheel-"),
  );
  assert.equal(wheels.length, 4);
  assert.ok(kart.getObjectByName("driver") instanceof THREE.Group);
  assert.ok(kart.getObjectByName("steering-wheel") instanceof THREE.Group);
  assert.ok(kart.getObjectByName("visor") instanceof THREE.Mesh);
  assert.equal(kart.getObjectByName("face"), undefined);
});

test("every rendered part owns disposable Three.js resources", () => {
  const kart = createKartModel("#ef7893");
  let meshes = 0;
  kart.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    assert.ok(object.geometry instanceof THREE.BufferGeometry);
    assert.equal(typeof object.geometry.dispose, "function");
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    assert.ok(materials.length > 0);
    for (const material of materials)
      assert.equal(typeof material.dispose, "function");
  });
  assert.ok(meshes >= 35, `expected a detailed model, got ${meshes} meshes`);
});
