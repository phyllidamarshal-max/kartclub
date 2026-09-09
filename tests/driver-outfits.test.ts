import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createDriverOutfit,
  tintDriverOutfit,
} from "../client/driver-outfits.ts";
import { DRIVER_OUTFITS, getDriverColor } from "../shared/drivers.ts";
import { createKartModel } from "../client/kart-model.ts";
import { batchKartModel } from "../client/kart-batching.ts";
import { KART_FOOTPRINT } from "../shared/kart-contact.ts";

test("hoodie elbow panels end at sewn boundaries rather than whole triangle shards", () => {
  const driver = createDriverOutfit("neko");
  for (const side of ["left", "right"]) {
    const panel = driver.getObjectByName(
      `outfit-${side}-soft-elbow`,
    ) as THREE.Mesh;
    const p = panel.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      assert.ok(
        Math.abs(p.getX(i)) >= 0.7 - 0.0061,
        `ragged x edge: ${p.getX(i)}`,
      );
      assert.ok(
        p.getZ(i) >= 0.05 - 0.0061 && p.getZ(i) <= 0.18 + 0.0061,
        `ragged z edge: ${p.getZ(i)}`,
      );
    }
  }
});

function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh[] = [];
  root.traverse((n) => {
    if (n instanceof THREE.Mesh) result.push(n);
  });
  return result;
}
function materials(root: THREE.Object3D) {
  return [
    ...new Set(
      meshes(root).flatMap((m) =>
        Array.isArray(m.material) ? m.material : [m.material],
      ),
    ),
  ] as THREE.MeshStandardMaterial[];
}
const originals = createKartModel("#aec83e").getObjectByName("driver")!;
for (const { id } of DRIVER_OUTFITS) {
  test(`${id}: preserves seated transforms, bounds, normals and render budget`, () => {
    const driver = createDriverOutfit(id);
    assert.equal(driver.name, "driver");
    originals.traverse((n) => {
      if (n.name.startsWith("driver-")) {
        const actual = driver.getObjectByName(n.name);
        assert.ok(actual, n.name);
        assert.deepEqual(actual.position.toArray(), n.position.toArray());
        assert.deepEqual(actual.quaternion.toArray(), n.quaternion.toArray());
        assert.deepEqual(actual.scale.toArray(), n.scale.toArray());
      }
    });
    for (const base of meshes(originals).filter(
      (m) =>
        m.name.startsWith("driver-sleeve") ||
        m.name.startsWith("driver-glove") ||
        m.name === "driver-torso",
    )) {
      const actual = driver.getObjectByName(base.name) as THREE.Mesh,
        a = actual.geometry.getAttribute("position"),
        b = base.geometry.getAttribute("position");
      assert.equal(a.count, b.count);
      for (let i = 0; i < a.count; i++)
        assert.ok(
          new THREE.Vector3()
            .fromBufferAttribute(a, i)
            .distanceTo(new THREE.Vector3().fromBufferAttribute(b, i)) <=
            (base.name.startsWith("driver-sleeve") ? 0.030001 : 0),
          `${id}/${base.name}: cloth inflation or glove movement`,
        );
    }
    driver.updateMatrixWorld(true);
    let triangles = 0;
    for (const mesh of meshes(driver)) {
      const p = mesh.geometry.getAttribute("position"),
        n = mesh.geometry.getAttribute("normal");
      triangles += (mesh.geometry.index?.count ?? p.count) / 3;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3()
          .fromBufferAttribute(p, i)
          .applyMatrix4(mesh.matrixWorld);
        const length = new THREE.Vector3().fromBufferAttribute(n, i).length();
        assert.ok(
          Number.isFinite(length) && length > 0.9 && length < 1.1,
          mesh.name,
        );
        for (let e = 0; e < KART_FOOTPRINT.length; e++) {
          const a = KART_FOOTPRINT[e],
            b = KART_FOOTPRINT[(e + 1) % KART_FOOTPRINT.length];
          assert.ok(
            (b[0] - a[0]) * (v.z - a[1]) - (b[1] - a[1]) * (v.x - a[0]) >= 0,
            mesh.name,
          );
        }
        if (mesh.userData.headAccessory)
          assert.ok(
            Math.abs(v.x) <= 0.75 && v.z >= -0.9 && v.z <= 0.7 && v.y <= 3.15,
            `${mesh.name}: ${v.toArray()}`,
          );
      }
    }
    assert.ok(triangles <= 25000, `${id}: ${triangles} triangles`);
    batchKartModel(driver);
    assert.ok(
      meshes(driver).length <= 14,
      `${id}: ${meshes(driver).length} batches`,
    );
  });
  test(`${id}: tint changes tagged materials only, retaining geometry and independent outputs`, () => {
    const a = createDriverOutfit(id),
      b = createDriverOutfit(id),
      am = materials(a),
      bm = materials(b),
      geo = meshes(a).map((m) => m.geometry);
    assert.ok(geo.every((g) => !meshes(b).some((m) => m.geometry === g)));
    assert.ok(am.every((m) => !bm.includes(m)));
    const before = am.map((m) => m.color?.getHex());
    tintDriverOutfit(a, "coral");
    assert.ok(
      am.some(
        (m, i) => m.userData.driverColorRole && m.color.getHex() !== before[i],
      ),
    );
    am.forEach((m, i) => {
      assert.ok(!m.userData.kartTint);
      if (!m.userData.driverColorRole)
        assert.equal(m.color?.getHex(), before[i]);
    });
    assert.deepEqual(
      meshes(a).map((m) => m.geometry),
      geo,
    );
    assert.ok(
      am.some(
        (m) =>
          m.color.getHex() ===
          new THREE.Color(getDriverColor("coral").color).getHex(),
      ),
    );
  });
  if (id !== "club")
    test(`${id}: outer details have a visible raycast sample`, () => {
      const d = createDriverOutfit(id);
      d.updateMatrixWorld(true);
      const all = meshes(d),
        details = all.filter((m) => m.userData.outfitDetail);
      assert.ok(details.length >= 5);
      assert.ok(
        details.some((m) => m.name.includes("rear")),
        `${id}: visible rear tailoring`,
      );
      for (const detail of details) {
        const p = detail.geometry.getAttribute("position"),
          n = detail.geometry.getAttribute("normal");
        let visible = false;
        for (
          let i = 0;
          i < p.count && !visible;
          i += Math.max(1, Math.floor(p.count / 80))
        ) {
          const point = new THREE.Vector3()
              .fromBufferAttribute(p, i)
              .applyMatrix4(detail.matrixWorld),
            normal = new THREE.Vector3()
              .fromBufferAttribute(n, i)
              .transformDirection(detail.matrixWorld);
          // The bent arms occlude oblique tube normals; also sample ordinary inspection directions.
          for (const direction of [
            normal,
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 1, 0),
          ]) {
            const origin = point.clone().addScaledVector(direction, 3);
            const ray = new THREE.Raycaster(
              origin,
              direction.clone().negate(),
              0,
              3.02,
            );
            if (ray.intersectObjects(all, false)[0]?.object === detail) {
              visible = true;
              break;
            }
          }
        }
        assert.ok(
          visible,
          `${id}/${detail.name} entirely buried in sampled views`,
        );
      }
    });
}
test("six new outfits have distinct actual geometry signatures", () => {
  const signatures = DRIVER_OUTFITS.filter((o) => o.id !== "club").map((o) =>
    meshes(createDriverOutfit(o.id))
      .map(
        (m) =>
          `${m.geometry.getAttribute("position").count}:${Array.from(
            m.geometry.getAttribute("position").array,
          )
            .reduce((a, b) => a + b * b, 0)
            .toFixed(5)}`,
      )
      .join("|"),
  );
  assert.equal(new Set(signatures).size, 6);
});
test("rally has outward glove protection with no forward growth", () => {
  const d = createDriverOutfit("rally");
  for (const side of ["left", "right"]) {
    const pad = d.getObjectByName(`outfit-${side}-glove-pad`) as THREE.Mesh;
    assert.ok(pad);
    const p = pad.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) assert.ok(p.getZ(i) < 0.05);
  }
});
