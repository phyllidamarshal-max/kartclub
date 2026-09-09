import * as THREE from "three";
import {
  sanitizeDriverAppearance,
  type DriverAppearance,
  type DriverOutfitId,
} from "../shared/drivers.ts";
import { createDriverOutfit, tintDriverOutfit } from "./driver-outfits.ts";
import { batchKartModel } from "./kart-batching.ts";
import { cloneKartAsset } from "./kart-asset.ts";

function resources(root: THREE.Object3D) {
  const result = new Set<
    THREE.BufferGeometry | THREE.Material | THREE.Texture
  >();
  root.traverse((n) => {
    if (n instanceof THREE.Mesh) {
      result.add(n.geometry);
      for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
        result.add(m);
        for (const value of Object.values(m))
          if (value instanceof THREE.Texture) result.add(value);
      }
    }
  });
  return result;
}
// Original driver and kart can share rubber/metal materials. Release only detached ownership.
function release(root: THREE.Object3D, retained?: THREE.Object3D) {
  const owned = resources(root);
  if (retained) for (const shared of resources(retained)) owned.delete(shared);
  for (const resource of owned) resource.dispose();
}

export class DriverWardrobe {
  private templates = new Map<DriverOutfitId, THREE.Group>();
  private applied = new WeakMap<
    THREE.Group,
    { outfit: string; color: string }
  >();
  get templateCount() {
    return this.templates.size;
  }

  apply(
    kart: THREE.Group,
    appearance: DriverAppearance | undefined,
    legacyColor: string,
    customFactory?: () => THREE.Object3D,
    beforeReplace?: (driver: THREE.Object3D) => void,
  ): boolean {
    const selected = sanitizeDriverAppearance(appearance);
    const custom =
      !!customFactory && (!appearance || selected.outfitId === "club");
    const outfit = custom
      ? "custom"
      : appearance
        ? selected.outfitId
        : "legacy";
    const color = custom
      ? "custom"
      : appearance
        ? selected.colorId
        : legacyColor;
    const current = this.applied.get(kart);
    if (!current && outfit === "legacy") return false;
    if (current?.outfit === outfit && current.color === color) return false;
    let driver = kart.getObjectByName("driver") as THREE.Group | undefined;
    if (current?.outfit !== outfit || !driver) {
      if (driver) {
        beforeReplace?.(driver);
        driver.removeFromParent();
        release(driver, kart);
      }
      if (custom) {
        driver = new THREE.Group();
        driver.name = "driver";
        const imported = customFactory!();
        imported.position.y = 0.9;
        driver.add(imported);
      } else {
        const id = outfit === "legacy" ? "club" : selected.outfitId;
        let template = this.templates.get(id);
        if (!template) {
          template = batchKartModel(createDriverOutfit(id));
          this.templates.set(id, template);
        }
        driver = cloneKartAsset(template, "#ffffff");
      }
      kart.add(driver);
    }
    if (!custom) {
      tintDriverOutfit(driver, selected.colorId);
      if (outfit === "legacy")
        driver.traverse((n) => {
          if (n instanceof THREE.Mesh)
            for (const m of Array.isArray(n.material)
              ? n.material
              : [n.material])
              if (m.userData.driverColorRole === "primary")
                (m as THREE.MeshStandardMaterial).color.set(legacyColor);
        });
    }
    this.applied.set(kart, { outfit, color });
    return true;
  }
  dispose() {
    for (const template of this.templates.values()) release(template);
    this.templates.clear();
    this.applied = new WeakMap();
  }
}
