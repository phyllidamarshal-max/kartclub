/** Original authored model -> editable separated GLB and compact runtime GLB. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createKartModel } from "../../client/kart-model.ts";
import { batchKartModel } from "../../client/kart-batching.ts";

// GLTFExporter uses FileReader for its binary Blob in browsers; Node has Blob.
class ExportFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.();
    });
  }
}
globalThis.FileReader = ExportFileReader as unknown as typeof FileReader;

const assetDirectory = new URL("../../public/models/kart/", import.meta.url);
const sourceDirectory = new URL("../../art/kart/", import.meta.url);
await mkdir(assetDirectory, { recursive: true });
await mkdir(sourceDirectory, { recursive: true });

function statistics(root: THREE.Object3D) {
  let meshes = 0,
    triangles = 0,
    vertices = 0,
    geometryBytes = 0;
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    meshes++;
    triangles +=
      (node.geometry.index?.count ??
        node.geometry.getAttribute("position").count) / 3;
    vertices += node.geometry.getAttribute("position").count;
    geometries.add(node.geometry);
    for (const m of Array.isArray(node.material)
      ? node.material
      : [node.material])
      materials.add(m);
  });
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes))
      geometryBytes += attribute.array.byteLength;
    geometryBytes += geometry.index?.array.byteLength ?? 0;
  }
  const bounds = new THREE.Box3().setFromObject(root, true);
  return {
    meshes,
    triangles,
    vertices,
    geometryBytes,
    materials: materials.size,
    bounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
      size: bounds.getSize(new THREE.Vector3()).toArray(),
    },
  };
}

async function exportGlb(root: THREE.Group, path: URL) {
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.userData.kartCastShadow = node.castShadow;
      node.userData.kartReceiveShadow = node.receiveShadow;
    }
  });
  const data = await new GLTFExporter().parseAsync(root, {
    binary: true,
    onlyVisible: false,
    trs: true,
  });
  if (!(data instanceof ArrayBuffer)) throw new Error("Expected a GLB binary");
  await writeFile(path, Buffer.from(data));
  return data.byteLength;
}

const kart = createKartModel("#aec83e");
const sourceStats = statistics(kart);
const sourceBytes = await exportGlb(
  kart,
  new URL("club-kart-source.glb", sourceDirectory),
);
batchKartModel(kart);
const runtimeStats = statistics(kart);
const runtimeBytes = await exportGlb(
  kart,
  new URL("club-kart.glb", assetDirectory),
);
const manifest = {
  version: "club-kart-reference-v3",
  model: "/models/kart/club-kart.glb",
  authoring: {
    implementation: "client/kart-model.ts",
    editable: "art/kart/club-kart.blend",
    separated: "art/kart/club-kart-source.glb",
  },
  coordinates: { units: "metres", up: "+Y", forward: "+Z", tireGroundY: 0.1 },
  wheel: {
    radius: 0.52,
    steeringAxis: "+Y",
    rollingAxis: "+X",
    centres: [
      [-1.18, 0.62, 1.2],
      [1.18, 0.62, 1.2],
      [-1.18, 0.62, -1.12],
      [1.18, 0.62, -1.12],
    ],
  },
  materialNames: [
    "kart-paint",
    "kart-dark",
    "kart-rubber",
    "kart-silver",
    "kart-suit",
    "kart-upholstery",
    "kart-visor",
    "kart-helmet-paint",
  ],
  source: { ...sourceStats, fileBytes: sourceBytes },
  runtime: { ...runtimeStats, fileBytes: runtimeBytes },
  textures: 0,
  lighting:
    "Runtime PBR; neutral cloth recess vertex colors, no baked direct lighting",
  license:
    "Original project-authored geometry and materials; no third-party assets",
};
await writeFile(
  new URL("manifest.json", assetDirectory),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(manifest, null, 2));
console.log(
  `Editable Blender command: output/blender-runtime/Scripts/python.exe scripts/kart-assets/save_blend.py`,
);
console.log(fileURLToPath(assetDirectory));
