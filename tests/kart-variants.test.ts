import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createKartVariant } from "../client/kart-variants.ts";
import { createKartModel } from "../client/kart-model.ts";
import { batchKartModel } from "../client/kart-batching.ts";
import { cloneKartAsset } from "../client/kart-asset.ts";
import { KARTS } from "../shared/karts.ts";
import { KART_FOOTPRINT } from "../shared/kart-contact.ts";

const premium = KARTS.filter((k) => k.id !== "club");
const meshes = (root: THREE.Object3D) => {
  const result: THREE.Mesh[] = [];
  root.traverse((n) => {
    if (n instanceof THREE.Mesh) result.push(n);
  });
  return result;
};

test("classic remains the original model and premium models replace its shell", () => {
  const classic = createKartVariant("club", "#abcdef");
  assert.deepEqual(
    meshes(classic).map((m) => m.name),
    meshes(createKartModel("#abcdef")).map((m) => m.name),
  );
  const fingerprints = new Set<string>();
  for (const { id } of premium) {
    const kart = createKartVariant(id, "#abcdef");
    assert.equal(kart.name, "kart-model");
    assert.equal(kart.userData.kartId, id);
    assert.ok(kart.getObjectByName("driver"));
    assert.ok(kart.getObjectByName("steering-wheel"));
    assert.equal(kart.getObjectByName("nose-fairing"), undefined);
    const body = kart.getObjectByName("variant-body");
    assert.ok(body);
    fingerprints.add(
      meshes(body)
        .map((m) => `${m.name}:${m.geometry.getAttribute("position").count}`)
        .join("|"),
    );
    for (const wheel of kart.children.filter((n) => n.userData.wheelRadius)) {
      assert.equal(wheel.userData.wheelRadius, 0.52);
      assert.equal(Math.abs(wheel.position.x), 1.18);
      assert.ok(wheel.getObjectByName(wheel.userData.spinNode));
    }
  }
  assert.equal(fingerprints.size, 6);
});

for (const { id } of premium)
  test(`${id}: finite geometry, collision footprint, and tire clearance through steering sweep`, () => {
    const kart = createKartVariant(id, "#abcdef");
    const body = kart.getObjectByName("variant-body")!;
    const wheels = kart.children.filter((n) => n.userData.wheelRadius);
    const point = new THREE.Vector3();
    for (const mesh of meshes(kart)) {
      const n = mesh.geometry.getAttribute("normal");
      assert.ok(n, mesh.name);
      for (let i = 0; i < n.count; i++) {
        const length = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
        assert.ok(
          Number.isFinite(length) && length > 0.9 && length < 1.1,
          `${id}/${mesh.name}: invalid normal`,
        );
      }
    }
    for (let step = 0; step <= 16; step++) {
      for (const wheel of wheels)
        if (wheel.userData.steerable)
          wheel.rotation.y = -0.38 + (step * 0.76) / 16;
      kart.updateMatrixWorld(true);
      for (const mesh of meshes(kart)) {
        const p = mesh.geometry.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
          for (let e = 0; e < KART_FOOTPRINT.length; e++) {
            const a = KART_FOOTPRINT[e],
              b = KART_FOOTPRINT[(e + 1) % KART_FOOTPRINT.length];
            const clearance =
              ((b[0] - a[0]) * (point.z - a[1]) -
                (b[1] - a[1]) * (point.x - a[0])) /
              Math.hypot(b[0] - a[0], b[1] - a[1]);
            assert.ok(
              clearance >= 0.009,
              `${id}/${mesh.name} outside footprint: ${point.toArray()}`,
            );
          }
        }
      }
      // Sample triangle interiors too: no broad panel may bridge through a tire.
      for (const wheel of wheels) {
        const inverse = wheel.matrixWorld.clone().invert();
        for (const mesh of meshes(body)) {
          const matrix = inverse.clone().multiply(mesh.matrixWorld),
            p = mesh.geometry.getAttribute("position"),
            ix = mesh.geometry.index;
          const a = new THREE.Vector3(),
            b = new THREE.Vector3(),
            c = new THREE.Vector3();
          const count = ix?.count ?? p.count;
          for (let i = 0; i < count; i += 3) {
            a.fromBufferAttribute(p, ix ? ix.getX(i) : i).applyMatrix4(matrix);
            b.fromBufferAttribute(p, ix ? ix.getX(i + 1) : i + 1).applyMatrix4(
              matrix,
            );
            c.fromBufferAttribute(p, ix ? ix.getX(i + 2) : i + 2).applyMatrix4(
              matrix,
            );
            for (const sample of [
              a,
              b,
              c,
              a
                .clone()
                .add(b)
                .add(c)
                .multiplyScalar(1 / 3),
            ]) {
              assert.ok(
                !(
                  Math.abs(sample.x) < 0.25 &&
                  Math.hypot(sample.y, sample.z) < 0.535
                ),
                `${id}/${mesh.name} touches ${wheel.name} at ${sample.toArray()}`,
              );
            }
          }
        }
      }
    }
  });

test("batching stays bounded and clones own resources while premium paint stays fixed", () => {
  for (const { id, color } of premium) {
    const template = batchKartModel(createKartVariant(id, "#abcdef"));
    assert.ok(
      meshes(template).length <= 32,
      `${id}: ${meshes(template).length} draw calls`,
    );
    const copy = cloneKartAsset(template, "#123456");
    const sourceG = new Set(meshes(template).map((m) => m.geometry));
    const sourceM = new Set(
      meshes(template).flatMap((m) =>
        Array.isArray(m.material) ? m.material : [m.material],
      ),
    );
    for (const mesh of meshes(copy)) {
      assert.ok(!sourceG.has(mesh.geometry));
      for (const m of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        assert.ok(!sourceM.has(m));
        if (m.name === `variant-${id}-paint`)
          assert.equal(
            (m as THREE.MeshStandardMaterial).color.getHexString(),
            color.slice(1),
          );
      }
    }
  }
});

test("authored shells face outward and silhouette features survive as real geometry", () => {
  for (const { id } of premium) {
    const kart = createKartVariant(id, "#abcdef");
    kart.updateMatrixWorld(true);
    const body = kart.getObjectByName("variant-body")!;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 3, 1.1),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(body, true)[0];
    assert.ok(
      hit && hit.point.y > 0.7,
      `${id}: opaque closed nose crown must face upward`,
    );
    for (const side of [-1, 1]) {
      if (id === "corsa") {
        assert.equal(kart.getObjectByName(`front-arch-${side}`), undefined);
        assert.ok(kart.getObjectByName(`front-wing-${side}`));
      } else if (id !== "rallye") {
        const arch = kart.getObjectByName(`front-arch-${side}`)!;
        const crown = new THREE.Raycaster(
          new THREE.Vector3(side * 1.1, 3, 1.2),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(arch)[0];
        assert.ok(
          crown && crown.point.y > 1.3,
          `${id}: arch crown exterior missing`,
        );
      }
    }
    if (id === "tempest") {
      const blade = new THREE.Box3().setFromObject(
        kart.getObjectByName("titanium-central-blade")!,
        true,
      );
      const pod = new THREE.Box3().setFromObject(
        kart.getObjectByName("twin-nose-pod-1")!,
        true,
      );
      assert.ok(pod.max.y > blade.max.y + 0.2);
    }
  }
});

test("premium decoration keeps each complete kart below sixty thousand triangles", () => {
  for (const { id } of premium) {
    const count = meshes(createKartVariant(id, "#abcdef")).reduce(
      (sum, m) =>
        sum +
        (m.geometry.index?.count ?? m.geometry.getAttribute("position").count) /
          3,
      0,
    );
    assert.ok(count < 60000, `${id}: ${count} triangles`);
  }
});

test("Rallye tread is exposed rubber geometry while retaining the nominal wheel radius", () => {
  const kart = createKartVariant("rallye", "#abcdef");
  kart.updateMatrixWorld(true);
  for (const wheel of kart.children.filter((n) => n.userData.wheelRadius)) {
    const spin = wheel.getObjectByName(wheel.userData.spinNode)!;
    const origin = spin.localToWorld(new THREE.Vector3(-0.096, 1, 0));
    const hit = new THREE.Raycaster(
      origin,
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(spin, true)[0];
    assert.ok(
      hit?.object.name.startsWith("rally-tread"),
      `${wheel.name}: tread buried beneath tire`,
    );
    assert.ok(Math.abs(spin.worldToLocal(hit.point.clone()).y - 0.52) < 0.003);
  }
});

// Quality regression: complete fender shoulders and exterior lighting must read as solid coachwork.
test("touring fenders have sculpted depth and readable exposed headlight bezels", () => {
  for (const id of ["apex", "vesper", "aurelia"] as const) {
    const kart = createKartVariant(id, "#abcdef");
    kart.updateMatrixWorld(true);
    const body = kart.getObjectByName("variant-body")!;
    const arch = kart.getObjectByName("front-arch-1") as THREE.Mesh;
    assert.ok(
      new THREE.Box3().setFromObject(arch, true).min.x < 0.6,
      "fender must connect to central body",
    );
    assert.ok(
      kart.getObjectByName("headlight-bezel-1"),
      "visible lamp needs a dark inset bezel",
    );
    const headlight = kart.getObjectByName("headlight-lens-1")!;
    const centre = headlight.getWorldPosition(new THREE.Vector3());
    const outward = new THREE.Vector3(0, 0.7, 1).normalize();
    const hit = new THREE.Raycaster(
      centre.clone().addScaledVector(outward, 1),
      outward.clone().negate(),
    ).intersectObject(body, true)[0];
    assert.ok(
      hit && /^headlight-(lens|led|projector(-bezel)?)-1/.test(hit.object.name),
      `${id}: exterior lens or light optics must remain visible; hit ${hit?.object.name}`,
    );
  }
});

