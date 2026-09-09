import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createKartModel } from "../client/kart-model.ts";
import { batchKartModel } from "../client/kart-batching.ts";

function count(root: THREE.Object3D) {
  let meshes = 0,
    triangles = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    meshes++;
    triangles +=
      (node.geometry.index?.count ??
        node.geometry.getAttribute("position").count) / 3;
  });
  return { meshes, triangles };
}
test("kart batching preserves geometry and control pivots while reducing draw submissions", () => {
  const kart = createKartModel("#a8cc2f");
  kart.position.set(7, 2, -11);
  kart.rotation.y = 1.3;
  const before = count(kart);
  const bounds = new THREE.Box3().setFromObject(kart, true);
  const driver = kart.getObjectByName("driver");
  const steering = kart.getObjectByName("steering-wheel");
  const wheels = kart.children.filter((node) => node.name.startsWith("wheel-"));
  batchKartModel(kart);
  const after = count(kart);
  const actual = new THREE.Box3().setFromObject(kart, true);
  assert.ok(
    after.meshes < before.meshes * 0.4,
    `${before.meshes} -> ${after.meshes}`,
  );
  assert.equal(after.triangles, before.triangles);
  assert.ok(actual.min.distanceTo(bounds.min) < 0.00001);
  assert.ok(actual.max.distanceTo(bounds.max) < 0.00001);
  assert.equal(kart.getObjectByName("driver"), driver);
  assert.equal(kart.getObjectByName("steering-wheel"), steering);
  assert.equal(wheels.length, 4);
  wheels.forEach((wheel) => assert.equal(wheel.parent, kart));
});

test("batching retains rolling geometry under its animated spin pivot", () => {
  const kart = batchKartModel(createKartModel("#a8cc2f"));
  for (const name of [
    "wheel-front-left",
    "wheel-front-right",
    "wheel-rear-left",
    "wheel-rear-right",
  ]) {
    const wheel = kart.getObjectByName(name)!;
    const spin = wheel.getObjectByName(wheel.userData.spinNode);
    assert.ok(spin instanceof THREE.Group);
    assert.ok(spin.children.some((node) => node instanceof THREE.Mesh));
    assert.equal(
      wheel.children.filter((node) => node instanceof THREE.Mesh).length,
      0,
    );
  }
});
