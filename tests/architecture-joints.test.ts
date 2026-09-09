import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ArchitectureJoints } from "../client/architecture-joints.ts";

test("steel supports have connected footing, shaft and bearing plate outside the clear portal", () => {
  const kit = new ArchitectureJoints();
  const g = kit.portal({
    span: 10,
    grounds: [-0.55, -0.4],
    supports: [true, true],
  });
  g.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const foot = new THREE.Box3().setFromObject(
      g.getObjectByName(`footing:${side}`)!,
    );
    const shaft = new THREE.Box3().setFromObject(
      g.getObjectByName(`shaft:${side}`)!,
    );
    const cap = new THREE.Box3().setFromObject(
      g.getObjectByName(`bearing:${side}`)!,
    );
    assert.ok(Math.abs(foot.min.y - (side < 0 ? -0.55 : -0.4)) < 1e-5);
    assert.ok(shaft.min.y <= foot.max.y + 0.13);
    assert.ok(shaft.max.y >= cap.min.y);
    assert.ok(side < 0 ? foot.max.x < -9 : foot.min.x > 9);
  }
  const ray = new THREE.Raycaster(
    new THREE.Vector3(0, 0.1, 0),
    new THREE.Vector3(0, 1, 0),
    0,
    6,
  );
  assert.equal(ray.intersectObject(g, true).length, 0);
});

test("one kit shares finite geometry and returns no unsupported or invalid portal", () => {
  const kit = new ArchitectureJoints();
  assert.throws(() =>
    kit.portal({ span: NaN, grounds: [0, 0], supports: [true, true] }),
  );
  const a = kit.portal({ span: 9, grounds: [0, 0], supports: [true, true] });
  const b = kit.portal({
    span: 12,
    grounds: [-0.5, -0.5],
    supports: [true, true],
  });
  const missing = kit.portal({
    span: 12,
    grounds: [0, 0],
    supports: [false, false],
  });
  assert.equal(missing.children.length, 0);
  const geometries = new Set<THREE.BufferGeometry>();
  let triangles = 0;
  for (const root of [a, b])
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        triangles +=
          (o.geometry.index?.count ??
            o.geometry.getAttribute("position").count) / 3;
        for (const attr of ["position", "normal"])
          assert.ok(
            [...o.geometry.getAttribute(attr).array].every(Number.isFinite),
          );
      }
    });
  assert.ok(geometries.size <= 5);
  assert.ok(triangles < 5000);
});
