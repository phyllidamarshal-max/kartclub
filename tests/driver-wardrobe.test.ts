import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { DriverWardrobe } from "../client/driver-wardrobe.ts";
import { createKartModel } from "../client/kart-model.ts";
import { DRIVER_OUTFITS, DRIVER_COLORS } from "../shared/drivers.ts";
import { CoastReflectionProbe } from "../client/coast-reflection.ts";

test("wardrobe detaches borrowed reflection before disposal and rebinds new visor", () => {
  const wardrobe = new DriverWardrobe(),
    kart = createKartModel("#abc123");
  const target = new THREE.WebGLRenderTarget(4, 4),
    probe = new CoastReflectionProbe(target);
  let disposed = 0;
  target.texture.addEventListener("dispose", () => disposed++);
  probe.applyToKart(kart);
  for (const outfitId of ["circuit", "neko", "club"] as const) {
    wardrobe.apply(
      kart,
      { outfitId, colorId: "red" },
      "#abc123",
      undefined,
      (driver) => probe.releaseKart(driver),
    );
    assert.equal(disposed, 0);
    probe.applyToKart(kart);
    let visor: THREE.MeshStandardMaterial | undefined;
    kart.getObjectByName("driver")!.traverse((n) => {
      if (n instanceof THREE.Mesh)
        for (const m of Array.isArray(n.material) ? n.material : [n.material])
          if (m.name === "kart-visor") visor = m as THREE.MeshStandardMaterial;
    });
    assert.equal(visor?.envMap, target.texture);
  }
  probe.releaseKart(kart);
  probe.dispose();
  wardrobe.dispose();
});

test("wardrobe recolors in place and owns a bounded template cache", () => {
  const wardrobe = new DriverWardrobe(),
    kart = createKartModel("#123456");
  assert.equal(wardrobe.apply(kart, undefined, "#123456"), false);
  for (const outfit of DRIVER_OUTFITS) {
    wardrobe.apply(kart, { outfitId: outfit.id, colorId: "lime" }, "#123456");
    const driver = kart.getObjectByName("driver")!;
    const geometry: THREE.BufferGeometry[] = [];
    driver.traverse((n) => {
      if (n instanceof THREE.Mesh) geometry.push(n.geometry);
    });
    for (const color of DRIVER_COLORS) {
      wardrobe.apply(
        kart,
        { outfitId: outfit.id, colorId: color.id },
        "#123456",
      );
      assert.equal(kart.getObjectByName("driver"), driver);
      const current: THREE.BufferGeometry[] = [];
      driver.traverse((n) => {
        if (n instanceof THREE.Mesh) current.push(n.geometry);
      });
      assert.deepEqual(current, geometry);
    }
  }
  assert.equal(wardrobe.templateCount, 7);
  assert.equal(
    wardrobe.apply(kart, { outfitId: "club", colorId: "pearl" }, "#123456"),
    false,
  );
  wardrobe.dispose();
  assert.equal(wardrobe.templateCount, 0);
});

test("replacing a driver preserves materials shared by retained kart meshes", () => {
  const wardrobe = new DriverWardrobe(),
    kart = createKartModel("#123456");
  const driver = kart.getObjectByName("driver")!;
  const outside = new Set<THREE.Material>();
  kart.traverse((n) => {
    if (n instanceof THREE.Mesh) {
      let p = n.parent;
      while (p && p !== driver) p = p.parent;
      if (p !== driver)
        (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) =>
          outside.add(m),
        );
    }
  });
  let disposed = 0;
  outside.forEach((m) => m.addEventListener("dispose", () => disposed++));
  wardrobe.apply(kart, { outfitId: "rally", colorId: "gold" }, "#123456");
  assert.equal(disposed, 0);
  const current = kart.getObjectByName("driver")!;
  let retired = 0;
  current.traverse((n) => {
    if (n instanceof THREE.Mesh)
      n.geometry.addEventListener("dispose", () => retired++);
  });
  wardrobe.apply(kart, { outfitId: "neko", colorId: "coral" }, "#123456");
  assert.ok(retired > 0);
  assert.equal(disposed, 0);
  wardrobe.dispose();
});

test("custom imported driver remains the original option and returns after new outfit", () => {
  const wardrobe = new DriverWardrobe(),
    kart = createKartModel("#123456");
  let clones = 0;
  const custom = () => {
    clones++;
    const group = new THREE.Group();
    group.name = "imported";
    return group;
  };
  wardrobe.apply(
    kart,
    { outfitId: "club", colorId: "lime" },
    "#123456",
    custom,
  );
  assert.ok(kart.getObjectByName("imported"));
  assert.equal(clones, 1);
  wardrobe.apply(kart, { outfitId: "club", colorId: "red" }, "#123456", custom);
  assert.equal(clones, 1);
  wardrobe.apply(
    kart,
    { outfitId: "street", colorId: "red" },
    "#123456",
    custom,
  );
  assert.equal(kart.getObjectByName("imported"), undefined);
  wardrobe.apply(kart, undefined, "#123456", custom);
  assert.ok(kart.getObjectByName("imported"));
  assert.equal(clones, 2);
  wardrobe.dispose();
});
