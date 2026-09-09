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
    bounds.max.y >= 2.7 && bounds.max.y <= 3.1,
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

test("wheel rotation has separate steering and rolling pivots at the tire centre", () => {
  const kart = createKartModel("#a7cf35");
  const wheels = kart.children.filter((node) => node.name.startsWith("wheel-"));
  assert.equal(wheels.length, 4);
  for (const wheel of wheels) {
    assert.equal(wheel.userData.wheelRadius, 0.52);
    assert.equal(wheel.userData.steerable, wheel.name.includes("front"));
    const spin = wheel.getObjectByName(wheel.userData.spinNode);
    assert.ok(spin instanceof THREE.Group);
    assert.equal(spin.parent, wheel);
    const before = new THREE.Box3()
      .setFromObject(spin, true)
      .getCenter(new THREE.Vector3());
    spin.rotation.x = Math.PI / 2;
    wheel.rotation.y = 0.3;
    const after = new THREE.Box3()
      .setFromObject(spin, true)
      .getCenter(new THREE.Vector3());
    assert.ok(
      before.distanceTo(after) < 0.02,
      "wheel must rotate around its centre",
    );
    assert.ok(spin.getObjectByName("tire"));
  }
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

test("visor remains the outer visible surface around both cheeks", () => {
  const kart = createKartModel("#aec83e");
  kart.updateMatrixWorld(true);
  const head = kart.getObjectByName("driver-helmet")!;
  const centre = head.getWorldPosition(new THREE.Vector3());
  for (const degrees of [-74, -45, 0, 45, 74]) {
    const angle = THREE.MathUtils.degToRad(degrees);
    const direction = new THREE.Vector3(
      Math.sin(angle),
      -0.18,
      Math.cos(angle),
    ).normalize();
    const ray = new THREE.Raycaster(
      centre.clone().addScaledVector(direction, 2),
      direction.clone().negate(),
    );
    assert.equal(
      ray.intersectObject(head, true)[0]?.object.name,
      "visor",
      `cheek ${degrees} must show glass rather than shell or a gap`,
    );
  }
});

test("rear mechanical parts stay below the body shoulders and retain the exhaust transform", () => {
  const kart = createKartModel("#aec83e");
  const engine = kart.getObjectByName("rear-engine")!;
  engine.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node.name === "exhaust") return;
    const bounds = new THREE.Box3().setFromObject(node, true);
    assert.ok(
      bounds.max.y <= 0.86,
      `${node.name} protrudes above the rear deck: ${bounds.max.y}`,
    );
  });
  const exhaust = kart.getObjectByName("exhaust")!;
  assert.deepEqual(exhaust.position.toArray(), [-0.48, 0.5, -1.35]);
  assert.equal(exhaust.rotation.x, Math.PI / 2);
});

test("helmet crown stripe is closed solid geometry with thickness", () => {
  const kart = createKartModel("#aec83e");
  const stripe = kart.getObjectByName("helmet-top-stripe") as THREE.Mesh;
  const position = stripe.geometry.getAttribute("position");
  const index = stripe.geometry.index;
  const edges = new Map<string, number>();
  const key = (i: number) =>
    [position.getX(i), position.getY(i), position.getZ(i)]
      .map((v) => v.toFixed(5))
      .join(",");
  const count = index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const a = [0, 1, 2].map((j) => key(index ? index.getX(i + j) : i + j));
    for (let j = 0; j < 3; j++) {
      const k = [a[j], a[(j + 1) % 3]].sort().join("|");
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  assert.ok(
    [...edges.values()].every((value) => value === 2),
    "the crown must have side walls, not be a floating single-sided ribbon",
  );
});

test("both gloves contact the inclined steering rim and the nose side normals face outward", () => {
  const kart = createKartModel("#aec83e");
  kart.updateMatrixWorld(true);
  const steering = kart.getObjectByName("steering-wheel")!;
  for (const side of ["left", "right"]) {
    const glove = kart.getObjectByName(`driver-glove-${side}`)!;
    const local = steering.worldToLocal(
      glove.getWorldPosition(new THREE.Vector3()),
    );
    assert.ok(
      Math.abs(Math.hypot(local.x, local.y) - 0.39) < 0.07,
      `${side} glove must touch the rim`,
    );
    assert.ok(
      Math.abs(local.z) < 0.06,
      `${side} glove must lie in the steering plane`,
    );
  }
  const nose = kart.getObjectByName("nose-fairing")!;
  for (const side of [-1, 1]) {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(side * 2, 0.82, 0.9),
      new THREE.Vector3(-side, 0, 0),
    ).intersectObject(nose)[0];
    assert.ok(hit, "nose must not have an open or inward-facing side");
    assert.ok(hit.face!.normal.x * side > 0.5);
  }
});

test("driver arm silhouette has broad soft shoulders and gloves wrap the rim", () => {
  const kart = createKartModel("#aec83e");
  kart.updateMatrixWorld(true);
  const arms = new THREE.Box3()
    .setFromObject(kart.getObjectByName("driver-sleeve-left")!, true)
    .union(
      new THREE.Box3().setFromObject(
        kart.getObjectByName("driver-sleeve-right")!,
        true,
      ),
    );
  const helmet = new THREE.Box3().setFromObject(
    kart.getObjectByName("helmet")!,
    true,
  );
  const ratio =
    arms.getSize(new THREE.Vector3()).x / helmet.getSize(new THREE.Vector3()).x;
  assert.ok(ratio >= 1.25 && ratio <= 1.35, `arm / helmet span ${ratio}`);
  for (const side of ["left", "right"]) {
    const thumb = kart.getObjectByName(`driver-glove-thumb-${side}`);
    assert.ok(
      thumb instanceof THREE.Mesh,
      "a gripping glove needs a thumb silhouette",
    );
    const palm = new THREE.Box3().setFromObject(
      kart.getObjectByName(`driver-glove-${side}`)!,
      true,
    );
    assert.ok(
      palm.intersectsBox(new THREE.Box3().setFromObject(thumb, true)),
      "thumb must join the palm",
    );
  }
});

test("cloth recess colors survive batching without introducing extra material groups", async () => {
  const { batchKartModel } = await import("../client/kart-batching.ts");
  const kart = createKartModel("#aec83e");
  const sleeve = kart.getObjectByName("driver-sleeve-left") as THREE.Mesh;
  const colors = sleeve.geometry.getAttribute("color");
  assert.ok(colors, "cloth has authored recess modulation");
  const values = Array.from({ length: colors.count }, (_, i) => colors.getX(i));
  assert.ok(Math.min(...values) < 0.9 && Math.min(...values) >= 0.65);
  batchKartModel(kart);
  let clothMeshes = 0;
  const materials = new Set<THREE.Material>();
  kart.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    materials.add(node.material as THREE.Material);
    if ((node.material as THREE.Material).name !== "kart-suit") return;
    clothMeshes++;
    assert.ok((node.material as THREE.MeshStandardMaterial).vertexColors);
    assert.equal(
      node.geometry.getAttribute("position").count,
      node.geometry.getAttribute("color").count,
    );
  });
  assert.equal(clothMeshes, 1);
  assert.equal(materials.size, 8);
});

test("tailored sleeves close at the shoulder and cuff without exposed tube holes", () => {
  const kart = createKartModel("#aec83e");
  for (const side of ["left", "right"]) {
    const sleeve = kart.getObjectByName(`driver-sleeve-${side}`) as THREE.Mesh;
    const p = sleeve.geometry.getAttribute("position");
    const index = sleeve.geometry.index!;
    const edges = new Map<string, number>();
    const key = (i: number) =>
      [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join(",");
    for (let i = 0; i < index.count; i += 3) {
      const points = [0, 1, 2].map((j) => key(index.getX(i + j)));
      for (let j = 0; j < 3; j++) {
        const edge = [points[j], points[(j + 1) % 3]].sort().join("|");
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
    assert.ok(
      [...edges.values()].every((value) => value === 2),
      `${side} sleeve has exposed open edges`,
    );
  }
});
