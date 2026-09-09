import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";

/** Bake decorative parts once, keeping driver, steering and each wheel independent. */
export function batchKartModel(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const pivots = new Set<THREE.Object3D>([root]);
  root.traverse((node) => {
    if (
      node instanceof THREE.Group &&
      (node.name === "driver" ||
        node.name === "steering-wheel" ||
        node.name.startsWith("wheel-"))
    )
      pivots.add(node);
  });
  const sourceGeometry = new Set<THREE.BufferGeometry>();
  for (const pivot of pivots) {
    const inverse = pivot.matrixWorld.clone().invert();
    const batches = new Map<
      string,
      { sources: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }
    >();
    pivot.traverse((node) => {
      if (
        !(node instanceof THREE.Mesh) ||
        Array.isArray(node.material) ||
        !node.visible
      )
        return;
      let owner = node.parent;
      while (owner && !pivots.has(owner)) owner = owner.parent;
      if (owner !== pivot) return;
      const key = `${node.material.uuid}/${node.castShadow}/${node.receiveShadow}`;
      const batch = batches.get(key) ?? { sources: [], geometries: [] };
      const geometry = node.geometry.index
        ? node.geometry.toNonIndexed()
        : node.geometry.clone();
      // Built-in kart materials have no maps; some authored shells intentionally omit UVs.
      const material = node.material as THREE.MeshStandardMaterial;
      if (
        !material.map &&
        !material.normalMap &&
        !material.roughnessMap &&
        !material.metalnessMap &&
        !material.aoMap &&
        !material.emissiveMap &&
        !material.alphaMap &&
        !material.lightMap &&
        !material.bumpMap &&
        !material.displacementMap
      )
        geometry.deleteAttribute("uv");
      geometry.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld),
      );
      batch.sources.push(node);
      batch.geometries.push(geometry);
      batches.set(key, batch);
    });
    for (const batch of batches.values()) {
      if (batch.sources.length < 2) {
        batch.geometries.forEach((geometry) => geometry.dispose());
        continue;
      }
      const merged = mergeGeometries(batch.geometries);
      batch.geometries.forEach((source) => source.dispose());
      if (!merged) continue;
      // Restore shared vertices after grouping; normals still preserve material seams.
      const geometry = mergeVertices(merged);
      merged.dispose();
      const first = batch.sources[0];
      const combined = new THREE.Mesh(geometry, first.material);
      combined.name = `${pivot.name || "kart"}-detail-batch`;
      combined.castShadow = first.castShadow;
      combined.receiveShadow = first.receiveShadow;
      pivot.add(combined);
      batch.sources.forEach((source) => {
        source.removeFromParent();
        sourceGeometry.add(source.geometry);
      });
    }
  }
  // A primitive may also be used by an unmerged part; retain it until world disposal.
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) sourceGeometry.delete(node.geometry);
  });
  sourceGeometry.forEach((geometry) => geometry.dispose());
  return root;
}
