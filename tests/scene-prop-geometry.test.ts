import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  boxBevel,
  createChamferedBoxGeometry,
  createStratifiedRockGeometry,
} from "../client/scene-prop-geometry.ts";

function triangles(geometry: THREE.BufferGeometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.getAttribute("position");
  const result: THREE.Vector3[][] = [];
  for (let i = 0; i < p.count; i += 3)
    result.push(
      [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, i + j)),
    );
  return result;
}

test("architectural bevels preserve the box envelope and have closed outward faces", () => {
  for (const size of [
    [5.2, 3.1, 10],
    [9, 80, 11],
    [1.1, 9, 1.2],
  ]) {
    const bevel = boxBevel(...(size as [number, number, number]));
    assert.ok(bevel);
    bevel.forEach((value, axis) =>
      assert.ok(value * size[axis] <= 0.18 + 1e-9),
    );
    const geometry = createChamferedBoxGeometry(bevel);
    geometry.scale(...(size as [number, number, number]));
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    size.forEach((value, axis) => {
      assert.ok(Math.abs(bounds.min.getComponent(axis) + value / 2) < 1e-5);
      assert.ok(Math.abs(bounds.max.getComponent(axis) - value / 2) < 1e-5);
    });
    assert.equal(triangles(geometry).length, 44);
    assert.equal(geometry.getAttribute("position").count, 96);
    const edges = new Map<string, number>();
    for (const [a, b, c] of triangles(geometry)) {
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      assert.ok(normal.length() > 1e-6, "degenerate chamfer triangle");
      assert.ok(normal.dot(a.clone().add(b).add(c)) > 0, "inward chamfer face");
      for (const [start, end] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = [start.toArray().join(","), end.toArray().join(",")]
          .sort()
          .join("|");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert.ok(
      [...edges.values()].every((count) => count === 2),
      "open chamfer seam",
    );
  }
});

test("thin rails keep their economical box geometry and tall masses reuse bevel profiles", () => {
  assert.equal(boxBevel(0.18, 40, 0.12), undefined);
  assert.equal(boxBevel(5, 0.4, 3), undefined);
  assert.deepEqual(boxBevel(9, 40, 11), boxBevel(9, 41, 11));
});

test("stratified rocks remain inside the original cylinder footprint with finite batch attributes", () => {
  for (let variant = 0; variant < 3; variant++) {
    const geometry = createStratifiedRockGeometry(variant);
    const position = geometry.getAttribute("position");
    assert.ok(position.count <= 180);
    const layers = new Set<number>();
    const radii = new Set<number>();
    assert.deepEqual(Object.keys(geometry.attributes).sort(), [
      "normal",
      "position",
      "uv",
    ]);
    for (let i = 0; i < position.count; i++) {
      layers.add(Number(position.getY(i).toFixed(4)));
      radii.add(
        Number(Math.hypot(position.getX(i), position.getZ(i)).toFixed(3)),
      );
      assert.ok(Math.hypot(position.getX(i), position.getZ(i)) <= 1 + 1e-6);
      assert.ok(Math.abs(position.getY(i)) <= 0.5 + 1e-6);
    }
    assert.ok(layers.size >= 4, "rock needs stratified height changes");
    assert.ok(radii.size >= 4, "rock silhouette needs irregular taper");
    for (const attribute of Object.values(geometry.attributes))
      assert.ok([...attribute.array].every(Number.isFinite));
    for (const [a, b, c] of triangles(geometry))
      assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-6);
  }
});
