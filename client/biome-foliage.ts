import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { getLevel } from "../shared/levels.ts";
import {
  shortcutWidthAt,
  trackPoint,
  trackWidth,
  type Point,
  type Track,
} from "../shared/track.ts";
import { terrainHeight } from "./level-scenery.ts";
import { roadsideClear } from "./scenery.ts";

/** Circumscribed XZ radii measured from the authored, feet-at-zero GLBs. */
export const FOREST_TREE_ASSETS = {
  "tree-round": { radius: 2.681, height: 6.678, triangles: 436 },
  "tree-oak": { radius: 2.789, height: 7.215, triangles: 554 },
  "tree-slender": { radius: 1.694, height: 7.481, triangles: 554 },
  "tree-blossom": { radius: 2.368, height: 6.52, triangles: 436 },
} as const;
type TreeAsset = keyof typeof FOREST_TREE_ASSETS;
export interface ForestFoliagePlacement {
  asset: TreeAsset;
  x: number;
  y: number;
  z: number;
  heading: number;
  scale: number;
  /** Scaled conservative crown radius, retained for integration clearance audits. */
  radius: number;
  branch: "main" | "shortcut";
  kind: "tree" | "landmark";
}
export interface ForestFoliageLandmark {
  x: number;
  y: number;
  z: number;
  heading: number;
}
export interface BiomeFoliageOptions {
  loadGLTF?: (url: string) => Promise<{ scene: THREE.Group }>;
  loadTexture?: (url: string) => Promise<THREE.Texture>;
  /** Asset-local diffuse indirect only; no baked direct sun. Defaults to true. */
  indirect?: boolean;
  /** Borrowed resource wrappers and bitmaps remain owned by the caller. */
  externalResources?: ReadonlySet<object>;
  /** Original landmark transform captured before the caller batches its fallback. */
  landmark?: ForestFoliageLandmark;
  /** Sample the rendered terrain triangles captured before static batching. */
  groundHeight?: (x: number, z: number) => number;
}

const CELL_SIZE = 72;
const MAX_TREES = 320;

/** Route-meter density, deterministic species mixes, and full road-union clearance. */
export function createForestFoliageLayout(
  track: Track,
  landmark?: ForestFoliageLandmark,
): ForestFoliagePlacement[] {
  if (getLevel(track.id).biome !== "forest") return [];
  let seed = 190909;
  for (const c of track.id)
    seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const palette: readonly TreeAsset[] =
    track.id === "forest-orchard"
      ? ["tree-round", "tree-blossom", "tree-oak", "tree-blossom", "tree-round"]
      : track.id === "forest-ridge"
        ? ["tree-slender", "tree-round", "tree-oak", "tree-slender", "tree-oak"]
        : ["tree-oak", "tree-round", "tree-slender", "tree-oak", "tree-round"];
  const result: ForestFoliagePlacement[] = [];
  if (landmark) {
    const radius = FOREST_TREE_ASSETS["tree-oak"].radius * 4.5;
    if (
      ![landmark.x, landmark.y, landmark.z, landmark.heading].every(
        Number.isFinite,
      ) ||
      !roadsideClear(track, landmark.x, landmark.z, radius + 1)
    )
      throw new Error("Forest landmark failed road clearance");
    result.push({
      ...landmark,
      asset: "tree-oak",
      radius,
      scale: 4.5,
      branch: "main",
      kind: "landmark",
    });
  }
  const place = (
    p: Point,
    side: number,
    i: number,
    branch: ForestFoliagePlacement["branch"],
  ) => {
    const asset = palette[Math.floor(random() * palette.length)];
    const scale = 1.2 + random() * 0.8;
    const radius = FOREST_TREE_ASSETS[asset].radius * scale;
    const heading = random() * Math.PI * 2;
    const width =
      branch === "shortcut"
        ? shortcutWidthAt(p.t, track)
        : trackWidth(p.t, track);
    // A loose foreground row alternates with small stands behind it. Full crowns
    // stay outside fences and the larger planting gaps preserve bend visibility.
    const setback = radius + 3.2 + random() * 5 + (i % 4 === 0 ? 14 : 0);
    for (const extra of [0, 7, 15]) {
      const distance = width / 2 + setback + extra;
      const x = p.x + Math.cos(p.heading) * distance * side;
      const z = p.z - Math.sin(p.heading) * distance * side;
      if (!roadsideClear(track, x, z, radius + 1)) continue;
      if (
        result.some(
          (other) =>
            Math.hypot(other.x - x, other.z - z) < other.radius + radius + 0.5,
        )
      )
        continue;
      result.push({
        asset,
        x,
        y: terrainHeight(track, x, z),
        z,
        heading,
        scale,
        radius,
        branch,
        kind: "tree",
      });
      return;
    }
  };
  // Reserve space for the shortcut before the longer main-road loop fills the budget.
  if (track.shortcut.length > 1) {
    let length = 0;
    for (let i = 1; i < track.shortcut.length; i++) {
      const a = track.shortcut[i - 1],
        b = track.shortcut[i];
      length += Math.hypot(b.x - a.x, b.z - a.z);
    }
    const count = Math.min(24, Math.max(8, Math.ceil(length / 23)));
    for (let i = 0; i < count; i++) {
      const p =
        track.shortcut[
          Math.floor(((i + 0.5) / count) * (track.shortcut.length - 1))
        ];
      for (const side of [-1, 1]) place(p, side, i, "shortcut");
    }
  }
  const count = Math.min(
    Math.floor((MAX_TREES - result.length) / 2),
    Math.ceil(track.length / 19),
  );
  for (let i = 0; i < count; i++) {
    for (const side of [-1, 1]) {
      if (result.length >= MAX_TREES) return result;
      const t = (i + 0.2 + random() * 0.55) / count;
      place(trackPoint(t, track), side, i, "main");
    }
  }
  return result;
}

interface Resources {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  textures: Set<THREE.Texture>;
  instances: Set<THREE.InstancedMesh>;
  external: ReadonlySet<object>;
  disposed: boolean;
}
// Ownership only: this map never reuses a THREE resource across Worlds.
const ownership = new WeakMap<THREE.Object3D, Resources>();
function collect(source: THREE.Object3D, resources: Resources) {
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      resources.materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) resources.textures.add(value);
    }
  });
}

/** Safe both after a normal unload and when the caller receives a stale late load. */
export function disposeBiomeFoliage(group: THREE.Object3D): void {
  const resources = ownership.get(group);
  if (!resources || resources.disposed) return;
  resources.disposed = true;
  const closed = new Set<object>();
  const borrowedImages = new Set(
    [...resources.textures]
      .filter((texture) => resources.external.has(texture))
      .map((texture) => texture.source.data),
  );
  for (const texture of resources.textures) {
    if (resources.external.has(texture)) continue;
    texture.dispose();
    const bitmap = texture.source.data as { close?: () => void } | undefined;
    if (
      bitmap &&
      typeof bitmap.close === "function" &&
      !closed.has(bitmap) &&
      !resources.external.has(bitmap) &&
      !borrowedImages.has(bitmap)
    ) {
      bitmap.close();
      closed.add(bitmap);
    }
  }
  for (const resource of [
    ...resources.instances,
    ...resources.geometries,
    ...resources.materials,
  ])
    if (!resources.external.has(resource)) resource.dispose();
  group.removeFromParent();
  group.clear();
}

/** Load only this forest's three tree species; no coast manifest or global decode cache. */
export async function loadBiomeFoliage(
  track: Track,
  options: BiomeFoliageOptions = {},
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = "forest-authored-foliage";
  const resources: Resources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
    instances: new Set(),
    external: options.externalResources ?? new Set(),
    disposed: false,
  };
  ownership.set(group, resources);
  try {
    const placements = createForestFoliageLayout(track, options.landmark);
    if (options.groundHeight) {
      for (const placement of placements) {
        placement.y = options.groundHeight(placement.x, placement.z);
        if (!Number.isFinite(placement.y))
          throw new Error("Forest ground height must be finite");
      }
    }
    const assets = [...new Set(placements.map((p) => p.asset))];
    const loadGLTF =
      options.loadGLTF ?? ((url: string) => new GLTFLoader().loadAsync(url));
    const loadTexture =
      options.loadTexture ??
      ((url: string) => new THREE.TextureLoader().loadAsync(url));
    const sources = new Map<TreeAsset, THREE.Group>();
    // Wait for every model/texture before rejecting so late successful decodes
    // cannot escape the transaction's cleanup after a sibling request fails.
    const settled = await Promise.allSettled(
      assets.map(async (asset) => {
        const parts = await Promise.allSettled([
          loadGLTF(`/art/coast-rebuild/${asset}.glb`).then(({ scene }) => {
            collect(scene, resources);
            return scene;
          }),
          options.indirect === false
            ? Promise.resolve(null)
            : loadTexture(`/art/coast-rebuild/${asset}-indirect.png`).then(
                (texture) => {
                  resources.textures.add(texture);
                  return texture;
                },
              ),
        ]);
        const failure = parts.find((part) => part.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        const source = (parts[0] as PromiseFulfilledResult<THREE.Group>).value;
        const indirect = (
          parts[1] as PromiseFulfilledResult<THREE.Texture | null>
        ).value;
        if (indirect) {
          indirect.channel = 1;
          indirect.flipY = false;
          indirect.colorSpace = THREE.LinearSRGBColorSpace;
          indirect.needsUpdate = true;
        }
        source.updateMatrixWorld(true);
        let meshes = 0;
        source.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          meshes++;
          if (
            !object.geometry.getAttribute("uv") ||
            !object.geometry.getAttribute("uv1")
          )
            throw new Error(`${asset}: missing authored UV channels`);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            if (indirect) {
              material.lightMap = indirect;
              material.lightMapIntensity = 0.4;
            }
            material.aoMapIntensity = 0.55;
            material.needsUpdate = true;
          }
        });
        if (!meshes) throw new Error(`${asset}: no tree meshes`);
        source.userData.foliageSource = { asset, ...FOREST_TREE_ASSETS[asset] };
        sources.set(asset, source);
      }),
    );
    const failure = settled.find((part) => part.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const batches = new Map<
      string,
      {
        source: THREE.Mesh;
        asset: TreeAsset;
        matrices: THREE.Matrix4[];
        indices: number[];
      }
    >();
    const up = new THREE.Vector3(0, 1, 0);
    placements.forEach((placement, index) => {
      const source = sources.get(placement.asset)!;
      const cell = `${Math.floor(placement.x / CELL_SIZE)},${Math.floor(placement.z / CELL_SIZE)}`;
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(placement.x, placement.y, placement.z),
        new THREE.Quaternion().setFromAxisAngle(up, placement.heading),
        new THREE.Vector3().setScalar(placement.scale),
      );
      source.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        const key = `${cell}/${placement.asset}/${object.geometry.uuid}/${materials.map((m) => m.uuid).join(",")}`;
        if (!batches.has(key))
          batches.set(key, {
            source: object,
            asset: placement.asset,
            matrices: [],
            indices: [],
          });
        const batch = batches.get(key)!;
        batch.matrices.push(transform.clone().multiply(object.matrixWorld));
        batch.indices.push(index);
      });
    });
    for (const batch of batches.values()) {
      const mesh = new THREE.InstancedMesh(
        batch.source.geometry,
        batch.source.material,
        batch.matrices.length,
      );
      mesh.name = `forest-foliage:${batch.asset}`;
      batch.matrices.forEach((matrix, index) =>
        mesh.setMatrixAt(index, matrix),
      );
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      const center = mesh.boundingBox!.getCenter(new THREE.Vector3());
      const size = mesh.boundingBox!.getSize(new THREE.Vector3());
      mesh.userData.biomeFoliageCell = {
        x: center.x,
        z: center.z,
        radius: Math.hypot(size.x, size.z) / 2,
        asset: batch.asset,
        source: { ...FOREST_TREE_ASSETS[batch.asset] },
        placementIndices: batch.indices,
        landmark: batch.indices.some(
          (index) => placements[index].kind === "landmark",
        ),
      };
      mesh.castShadow = mesh.receiveShadow = true;
      resources.instances.add(mesh);
      group.add(mesh);
    }
    group.userData.biomeFoliage = {
      placements,
      placementCount: placements.length,
      landmarkCount: placements.filter((p) => p.kind === "landmark").length,
      assetCount: sources.size,
      batchCount: batches.size,
      cellSize: CELL_SIZE,
      materialCount: resources.materials.size,
      textureCount: resources.textures.size,
      geometryCount: resources.geometries.size,
      triangles: placements.reduce(
        (sum, p) => sum + FOREST_TREE_ASSETS[p.asset].triangles,
        0,
      ),
    };
    return group;
  } catch (error) {
    disposeBiomeFoliage(group);
    throw error;
  }
}

export function updateBiomeFoliage(
  group: THREE.Group,
  cameraPosition: THREE.Vector3,
  low: boolean,
): void {
  for (const mesh of group.children) {
    const cell = mesh.userData.biomeFoliageCell;
    if (!cell) continue;
    // Distance to the conservative cell edge prevents culling nearby crowns
    // just because their cell center lies beyond the quality threshold.
    const distance = Math.max(
      0,
      Math.hypot(cameraPosition.x - cell.x, cameraPosition.z - cell.z) -
        cell.radius,
    );
    mesh.visible =
      distance <= (cell.landmark ? (low ? 450 : 700) : low ? 240 : 420);
    mesh.castShadow = distance <= (low ? 90 : 180);
  }
}
