import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const KART_ASSET_URL = "/models/kart/club-kart.glb";

/** The caller owns this template and must dispose it when its World is released. */
export async function loadKartAsset(): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(KART_ASSET_URL);
  return gltf.scene;
}

/** Cars own independent GPU resources so pruning one cannot dispose another. */
export function cloneKartAsset(
  template: THREE.Group,
  color: string,
): THREE.Group {
  const source = template.getObjectByName("kart-model") ?? template;
  const root = source.clone(true) as THREE.Group;
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const cloneMaterial = (sourceMaterial: THREE.Material) => {
    let material = materials.get(sourceMaterial);
    if (!material) {
      material = sourceMaterial.clone();
      if (
        material.userData.kartTint ||
        material.name === "kart-paint" ||
        material.name === "kart-helmet-paint"
      ) {
        (material as THREE.MeshStandardMaterial).color.set(color);
        material.userData.kartTint = true;
      }
      materials.set(sourceMaterial, material);
    }
    return material;
  };
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    let geometry = geometries.get(node.geometry);
    if (!geometry) {
      const clonedGeometry: THREE.BufferGeometry = node.geometry.clone();
      geometries.set(node.geometry, clonedGeometry);
      geometry = clonedGeometry;
    }
    node.geometry = geometry;
    node.material = Array.isArray(node.material)
      ? node.material.map(cloneMaterial)
      : cloneMaterial(node.material);
    node.castShadow = node.userData.kartCastShadow !== false;
    node.receiveShadow = node.userData.kartReceiveShadow !== false;
  });
  return root;
}
