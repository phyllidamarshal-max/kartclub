import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Track } from "../shared/track.ts";
import {
  createCoastLayout,
  COAST_FOOTPRINTS,
  type CoastPlacement,
} from "./coast-layout.ts";

interface AssetRecord {
  key: string;
  model: string;
  indirect: string;
  lighting?: string;
  triangles?: number;
  atlasSize?: number;
  height?: number;
  width?: number;
  depth?: number;
}
export interface CoastLoaderOptions {
  manifestUrl?: string;
  fetch?: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  loadGLTF?: (url: string) => Promise<{ scene: THREE.Group }>;
  loadTexture?: (url: string) => Promise<THREE.Texture>;
  layout?: CoastPlacement[];
  /** Borrowed resources are never disposed or ImageBitmap-closed. */
  externalResources?: ReadonlySet<object>;
}
interface Resources {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  textures: Set<THREE.Texture>;
  instances: Set<THREE.InstancedMesh>;
  external: ReadonlySet<object>;
  disposed: boolean;
}
const ownership = new WeakMap<THREE.Object3D, Resources>();
function collect(root: THREE.Object3D, r: Resources) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    r.geometries.add(object.geometry);
    for (const mat of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      r.materials.add(mat);
      for (const value of Object.values(mat))
        if (value instanceof THREE.Texture) r.textures.add(value);
    }
  });
}
export function disposeCoastAssets(group: THREE.Object3D): void {
  const r = ownership.get(group);
  if (!r || r.disposed) return;
  r.disposed = true;
  const closed = new Set<object>();
  // A bitmap can back both borrowed and owned texture wrappers.
  const borrowedImages = new Set(
    [...r.textures].filter((t) => r.external.has(t)).map((t) => t.source.data),
  );
  for (const texture of r.textures) {
    if (r.external.has(texture)) continue;
    texture.dispose();
    const data = texture.source.data as { close?: () => void } | undefined;
    if (
      data &&
      typeof data.close === "function" &&
      !closed.has(data) &&
      !r.external.has(data) &&
      !borrowedImages.has(data)
    ) {
      data.close();
      closed.add(data);
    }
  }
  for (const resource of [...r.instances, ...r.geometries, ...r.materials])
    if (!r.external.has(resource)) resource.dispose();
  group.removeFromParent();
  group.clear();
}

/** No process-wide decode cache: each World owns one complete load transaction. */
export async function loadCoastAssets(
  track: Track,
  options: CoastLoaderOptions = {},
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = "coast-authored-assets";
  const r: Resources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
    instances: new Set(),
    external: options.externalResources ?? new Set(),
    disposed: false,
  };
  ownership.set(group, r);
  const manifestUrl = options.manifestUrl ?? "/art/coast-rebuild/manifest.json";
  const resolve = (path: string) =>
    path.startsWith("/") || /^[a-z]+:/i.test(path)
      ? path
      : manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1) + path;
  try {
    const response = await (options.fetch ?? fetch)(manifestUrl);
    if (!response.ok) throw new Error("Coast manifest request failed");
    const manifest = (await response.json()) as {
      version: string;
      assets: AssetRecord[];
    };
    if (!manifest.version || !Array.isArray(manifest.assets))
      throw new Error("Invalid coast manifest");
    const records = new Map(manifest.assets.map((a) => [a.key, a]));
    if (
      records.size !== manifest.assets.length ||
      Object.keys(COAST_FOOTPRINTS).some(
        (key) => !records.get(key)?.model || !records.get(key)?.indirect,
      )
    )
      throw new Error("Incomplete coast asset manifest");
    const gltf = options.loadGLTF ?? ((url) => new GLTFLoader().loadAsync(url));
    const texture =
      options.loadTexture ??
      ((url) => new THREE.TextureLoader().loadAsync(url));
    const sources = new Map<string, THREE.Group>();
    // allSettled is intentional: late successful decodes must join cleanup before rejection.
    const settled = await Promise.allSettled(
      manifest.assets.map(async (record) => {
        const parts = await Promise.allSettled([
          gltf(resolve(record.model)).then((value) => {
            collect(value.scene, r);
            return value.scene;
          }),
          texture(resolve(record.indirect)).then((value) => {
            r.textures.add(value);
            return value;
          }),
        ]);
        const failed = parts.find((p) => p.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
        const source = (parts[0] as PromiseFulfilledResult<THREE.Group>).value;
        const light = (parts[1] as PromiseFulfilledResult<THREE.Texture>).value;
        light.channel = 1;
        light.flipY = false;
        light.colorSpace = THREE.LinearSRGBColorSpace;
        light.needsUpdate = true;
        let count = 0;
        source.updateMatrixWorld(true);
        source.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          if (
            !object.geometry.getAttribute("uv") ||
            !object.geometry.getAttribute("uv1")
          )
            throw new Error(`${record.key}: missing UV channels`);
          count++;
          for (const mat of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.lightMap = light;
              mat.lightMapIntensity = 0.45;
              mat.aoMapIntensity = 0.55;
              mat.needsUpdate = true;
            }
          }
        });
        if (!count) throw new Error(`${record.key}: no meshes`);
        sources.set(record.key, source);
      }),
    );
    const failed = settled.find((p) => p.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const layout = options.layout ?? createCoastLayout(track);
    const batches = new Map<
      string,
      {
        source: THREE.Mesh;
        matrices: THREE.Matrix4[];
        asset: string;
        x: number;
        z: number;
      }
    >();
    for (const placement of layout) {
      const source = sources.get(placement.asset);
      if (!source) throw new Error(`Unknown coast asset ${placement.asset}`);
      const cx = Math.floor(placement.x / 90),
        cz = Math.floor(placement.z / 90);
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(placement.x, placement.y, placement.z),
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          placement.heading,
        ),
        new THREE.Vector3().setScalar(placement.scale),
      );
      source.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        const key = `${cx},${cz}/${placement.asset}/${object.geometry.uuid}/${materials.map((m) => m.uuid).join(",")}`;
        if (!batches.has(key))
          batches.set(key, {
            source: object,
            matrices: [],
            asset: placement.asset,
            x: (cx + 0.5) * 90,
            z: (cz + 0.5) * 90,
          });
        batches
          .get(key)!
          .matrices.push(transform.clone().multiply(object.matrixWorld));
      });
    }
    for (const batch of batches.values()) {
      const mesh = new THREE.InstancedMesh(
        batch.source.geometry,
        batch.source.material,
        batch.matrices.length,
      );
      mesh.name = `coast:${batch.asset}`;
      batch.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      mesh.castShadow = !/meadow|shrub/.test(batch.asset);
      mesh.receiveShadow = true;
      mesh.userData.coastCell = {
        x: batch.x,
        z: batch.z,
        detail: /meadow|shrub/.test(batch.asset),
        tree: batch.asset.startsWith("tree"),
      };
      r.instances.add(mesh);
      group.add(mesh);
    }
    group.userData.coastAssets = {
      version: manifest.version,
      assetCount: sources.size,
      placementCount: layout.length,
      batchCount: batches.size,
      cellSize: 90,
    };
    return group;
  } catch (error) {
    disposeCoastAssets(group);
    throw error;
  }
}

export function updateCoastAssets(
  group: THREE.Group,
  cameraPosition: THREE.Vector3,
  lowQuality: boolean,
): void {
  for (const mesh of group.children) {
    const cell = mesh.userData.coastCell;
    if (!cell) continue;
    const distance = Math.hypot(
      cameraPosition.x - cell.x,
      cameraPosition.z - cell.z,
    );
    mesh.visible =
      distance <
      (cell.detail
        ? lowQuality
          ? 105
          : 165
        : cell.tree
          ? lowQuality
            ? 260
            : 420
          : 900) +
        64;
    mesh.castShadow = !cell.detail && distance < (lowQuality ? 100 : 185) + 64;
  }
}
