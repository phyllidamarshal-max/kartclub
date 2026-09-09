/** Editable catalog snapshot of actual procedural runtime props; never loaded by World. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { decorateLevel } from "../../client/level-scenery.ts";
import { TRACKS } from "../../shared/track.ts";

class ExportFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
      this.onloadend?.();
    });
  }
}
globalThis.FileReader = ExportFileReader as unknown as typeof FileReader;

const root = new URL("../../", import.meta.url);
const path = (relative: string) => fileURLToPath(new URL(relative, root));
const seed = 741;
const selections = [
  ["harbor", "coast-harbor", "harbor-container-yard"],
  ["city", "city", "city-neon-block"],
  ["factory", "city-factory", "factory-machinery"],
  ["space", "city-nightshift", "space-route-dressing"],
  ["desert", "coast-breakwater", "desert-route-dressing"],
  ["forest", "mountain", "forest-route-dressing"],
  ["ice", "mountain-pass", "ice-glacier-wall"],
  ["mine", "mountain-summit", "mine-ore-cart"],
] as const;

function statistics(object: THREE.Object3D) {
  let meshes = 0,
    vertices = 0,
    triangles = 0;
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  object.updateMatrixWorld(true);
  object.traverse((node) => {
    assert.ok(
      node.matrixWorld.elements.every(Number.isFinite),
      `${node.name}: nonfinite transform`,
    );
    if (!(node instanceof THREE.Mesh)) return;
    meshes++;
    const position = node.geometry.getAttribute("position");
    vertices += position.count;
    triangles += (node.geometry.index?.count ?? position.count) / 3;
    for (const attribute of Object.values(
      (node.geometry as THREE.BufferGeometry).attributes,
    ))
      assert.ok(
        [...attribute.array].every(Number.isFinite),
        `${node.name}: nonfinite attribute`,
      );
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      materials.add(material);
  });
  const bounds = new THREE.Box3().setFromObject(object, true);
  assert.ok(
    [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite),
  );
  return {
    meshes,
    vertices,
    triangles,
    geometries: geometries.size,
    materials: materials.size,
    bounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
      size: bounds.getSize(new THREE.Vector3()).toArray(),
    },
  };
}

const catalog = new THREE.Group();
catalog.name = "scene-props-catalog";
catalog.userData = {
  catalogOnly: true,
  authoritativeSource: "client/level-scenery.ts",
  seed,
};
const records = [];
for (const [index, [biome, trackId, sourceName]] of selections.entries()) {
  const track = TRACKS.find((candidate) => candidate.id === trackId);
  assert.ok(track, `Track missing: ${trackId}`);
  let state = seed;
  const sourceScene = new THREE.Scene();
  decorateLevel(
    sourceScene,
    track,
    () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296,
  );
  const selected = sourceScene.getObjectByName(sourceName);
  assert.ok(selected, `Runtime group missing: ${sourceName}`);
  const sourceTransform = {
    position: selected.position.toArray(),
    quaternion: selected.quaternion.toArray(),
    scale: selected.scale.toArray(),
  };
  const prop = selected.clone(true);
  prop.position.set(0, 0, 0);
  prop.quaternion.identity();
  const runtimeLocal = statistics(prop);
  const geometryClones = new Map<string, THREE.BufferGeometry>(),
    materialClones = new Map<THREE.Material, THREE.Material>();
  let part = 0,
    bakedFlatNormalMeshes = 0;
  prop.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    assert.ok(
      !Array.isArray(node.material),
      "Catalog selection unexpectedly has multi-material geometry",
    );
    const sourceMaterial = node.material as THREE.MeshStandardMaterial;
    const flat = Boolean(sourceMaterial.flatShading);
    const geometryKey = `${node.geometry.uuid}/${flat}`;
    if (!geometryClones.has(geometryKey)) {
      const clone =
        flat && node.geometry.index
          ? node.geometry.toNonIndexed()
          : node.geometry.clone();
      if (flat) clone.computeVertexNormals();
      geometryClones.set(geometryKey, clone);
    }
    node.geometry = geometryClones.get(geometryKey)!;
    if (!materialClones.has(sourceMaterial)) {
      const clone = sourceMaterial.clone();
      clone.name = `${biome}-${sourceMaterial.color.getHexString()}-${materialClones.size + 1}`;
      materialClones.set(sourceMaterial, clone);
    }
    node.material = materialClones.get(sourceMaterial)!;
    node.name ||= `${biome}-part-${String(++part).padStart(3, "0")}`;
    node.userData = {
      ...node.userData,
      runtimeCastShadow: node.castShadow,
      runtimeReceiveShadow: node.receiveShadow,
    };
    if (flat) bakedFlatNormalMeshes++;
  });
  const localBounds = new THREE.Box3().setFromObject(prop, true);
  const center = localBounds.getCenter(new THREE.Vector3());
  prop.position.set(-center.x, -localBounds.min.y, -center.z);
  const wrapper = new THREE.Group();
  wrapper.name = `catalog-${biome}`;
  wrapper.userData = {
    catalogProp: true,
    biome,
    sourceTrack: trackId,
    sourceName,
    sourceOccurrence: 0,
    seed,
  };
  wrapper.position.set(
    ((index % 4) - 1.5) * 32,
    0,
    (Math.floor(index / 4) - 0.5) * 32,
  );
  wrapper.add(prop);
  catalog.add(wrapper);
  const exported = statistics(wrapper);
  assert.equal(
    exported.triangles,
    runtimeLocal.triangles,
    `${biome}: surface topology changed`,
  );
  assert.ok(
    exported.vertices < 20000 &&
      exported.triangles < 15000 &&
      exported.materials <= 12,
    `${biome}: prop budget exceeded`,
  );
  exported.bounds.size.forEach((size, axis) =>
    assert.ok(Math.abs(size - runtimeLocal.bounds.size[axis]) < 1e-6),
  );
  records.push({
    biome,
    sourceTrack: trackId,
    sourceName,
    sourceOccurrence: 0,
    sourceTransform,
    catalogNode: wrapper.name,
    gridPosition: wrapper.position.toArray(),
    normalizedTranslation: prop.position.toArray(),
    bakedFlatNormalMeshes,
    runtimeLocal,
    exported,
  });
}
catalog.updateMatrixWorld(true);
for (let a = 0; a < catalog.children.length; a++)
  for (let b = a + 1; b < catalog.children.length; b++)
    assert.equal(
      new THREE.Box3()
        .setFromObject(catalog.children[a], true)
        .intersectsBox(
          new THREE.Box3().setFromObject(catalog.children[b], true),
        ),
      false,
      "Catalog grid overlaps",
    );
const total = statistics(catalog);
assert.ok(
  total.vertices < 100000 && total.triangles < 75000,
  "Catalog total budget exceeded",
);
const binary = await new GLTFExporter().parseAsync(catalog, {
  binary: true,
  onlyVisible: false,
  trs: true,
});
assert.ok(binary instanceof ArrayBuffer, "Expected binary GLB");
const bytes = Buffer.from(binary);
const sha256 = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const loaded = await new GLTFLoader().parseAsync(binary, "");
const loadedStats = statistics(loaded.scene);
assert.equal(loadedStats.meshes, total.meshes);
assert.equal(loadedStats.triangles, total.triangles);
for (const record of records) {
  const object = loaded.scene.getObjectByName(record.catalogNode);
  assert.ok(object, `${record.catalogNode}: GLB group missing`);
  const actual = statistics(object);
  assert.equal(actual.triangles, record.exported.triangles);
  for (const key of ["min", "max"] as const)
    actual.bounds[key].forEach((coordinate, axis) =>
      assert.ok(
        Math.abs(coordinate - record.exported.bounds[key][axis]) < 0.0001,
      ),
    );
}

await mkdir(path("public/art/all-maps"), { recursive: true });
await mkdir(path("art/all-maps"), { recursive: true });
const glbPath = path("public/art/all-maps/scene-props.glb"),
  blendPath = path("art/all-maps/scene-props.blend");
await writeFile(glbPath, bytes);
// Use the already installed bpy worker; no renderer or package installation is needed.
const python = String.raw`
import bpy, json, math, os, sys
from mathutils import Vector, Euler
glb, blend, source_hash, expected_json = sys.argv[1:]
expected = json.loads(expected_json)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene
scene['catalog_only'] = True
scene['source_glb_sha256'] = source_hash
scene['authoritative_source'] = 'client/level-scenery.ts and client/scene-prop-geometry.ts'
scene['editing'] = 'Eight procedural snapshot examples, separated meshes. Blender edits do not feed back into the runtime builders.'
scene['coordinates'] = 'Blender metres +Z up, -Y forward; runtime glTF metres +Y up, +Z forward.'
scene['license'] = 'Original project-authored geometry and materials; no third-party assets.'
roots = [obj for obj in scene.objects if obj.get('catalogProp')]
assert len(roots) == 8
for obj in roots:
    collection = bpy.data.collections.new('Catalog / ' + obj.get('biome'))
    scene.collection.children.link(collection)
    for node in [obj, *obj.children_recursive]:
        for old in list(node.users_collection): old.objects.unlink(node)
        collection.objects.link(node)
notes = bpy.data.texts.new('README - scene props catalog')
notes.write('Editable snapshot of actual decorateLevel outputs. Eight representative props, not a one-to-one archive of all map scenery. The runtime continues to generate props from TypeScript and does not load this GLB. Rerun node --import tsx scripts/all-map-assets/export-props.ts to refresh. Full details: art/all-maps/README.md.')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.shading.type = 'SOLID'
            area.spaces.active.shading.color_type = 'MATERIAL'
            area.spaces.active.region_3d.view_location = (0, 0, 12)
            area.spaces.active.region_3d.view_distance = 130
            area.spaces.active.region_3d.view_rotation = Euler((math.radians(65), 0, math.radians(25)), 'XYZ').to_quaternion()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=blend, check_existing=False)
bpy.ops.wm.open_mainfile(filepath=blend)
results = []
for record in expected:
    obj = bpy.data.objects.get(record['catalogNode'])
    assert obj is not None
    meshes = [node for node in obj.children_recursive if node.type == 'MESH']
    points, triangles = [], 0
    for node in meshes:
        node.data.calc_loop_triangles()
        triangles += len(node.data.loop_triangles)
        points.extend(node.matrix_world @ vertex.co for vertex in node.data.vertices)
    assert len(meshes) == record['exported']['meshes']
    assert triangles == record['exported']['triangles']
    assert all(math.isfinite(value) for point in points for value in point)
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    old_min, old_max = record['exported']['bounds']['min'], record['exported']['bounds']['max']
    expected_min, expected_max = [old_min[0], -old_max[2], old_min[1]], [old_max[0], -old_min[2], old_max[1]]
    assert all(abs(minimum[axis] - expected_min[axis]) < 0.001 and abs(maximum[axis] - expected_max[axis]) < 0.001 for axis in range(3))
    results.append({'biome': record['biome'], 'meshes': len(meshes), 'triangles': triangles, 'bounds': {'min': minimum, 'max': maximum}})
print('CATALOG_VALIDATION=' + json.dumps({'version': bpy.app.version_string, 'reopenedSuccessfully': True, 'props': results}), flush=True)
sys.stdout.flush()
os._exit(0)
`;
const worker = spawnSync(
  path("output/blender-runtime/Scripts/python.exe"),
  ["-c", python, glbPath, blendPath, sha256(bytes), JSON.stringify(records)],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, windowsHide: true },
);
assert.equal(
  worker.status,
  0,
  `${worker.error?.message ?? ""}\n${worker.stdout}\n${worker.stderr}`,
);
const validationLine = worker.stdout
  .split(/\r?\n/)
  .find((line) => line.startsWith("CATALOG_VALIDATION="));
assert.ok(validationLine, "Blender validation output missing");
const blenderValidation = JSON.parse(
  validationLine.slice("CATALOG_VALIDATION=".length),
);
const sourceFiles = [
  "client/level-scenery.ts",
  "client/scene-prop-geometry.ts",
  "client/scenery.ts",
  "shared/track.ts",
  "shared/levels.ts",
  "scripts/all-map-assets/export-props.ts",
];
const sourceHashes = await Promise.all(
  sourceFiles.map(async (file) => ({
    file,
    sha256: sha256(await readFile(path(file))),
  })),
);
const blendBytes = await readFile(blendPath);
const manifest = {
  version: "all-map-props-catalog-v1",
  role: "editable representative snapshot; not a runtime-loaded asset",
  seed,
  authoritativeSources: sourceHashes,
  runtimeIntegration: {
    generatedBy: "client/level-scenery.ts",
    geometry: "client/scene-prop-geometry.ts",
    loadedByWorld: false,
  },
  files: {
    glb: {
      path: "/art/all-maps/scene-props.glb",
      bytes: bytes.length,
      sha256: sha256(bytes),
    },
    blend: {
      path: "art/all-maps/scene-props.blend",
      bytes: blendBytes.length,
      sha256: sha256(blendBytes),
    },
  },
  coordinates: {
    units: "metres",
    gltfUp: "+Y",
    gltfForward: "+Z",
    blenderUp: "+Z",
    blenderForward: "-Y",
  },
  layout: {
    columns: 4,
    rows: 2,
    spacingMetres: 32,
    normalizedToFloor: true,
    routeHeadingRemoved: true,
  },
  conversion:
    "Cloned actual procedural groups; local mesh geometry/material values preserved. Runtime flat-shading faces are expanded and normals recomputed for glTF. Route translation/yaw removed, centered horizontally and grounded in the catalog grid.",
  scope:
    "Eight representative groups from eight non-coast themes. Not a one-to-one archive of all props, routes, or authored foliage; Blender edits are independent snapshots.",
  license:
    "Original project-authored geometry and materials; no third-party assets",
  textures: 0,
  catalog: total,
  props: records,
  validation: {
    finiteTransformsAndAttributes: true,
    nonOverlappingGrid: true,
    glbRoundTrip: { passed: true, ...loadedStats },
    blender: blenderValidation,
  },
};
await writeFile(
  path("public/art/all-maps/manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      files: manifest.files,
      catalog: total,
      props: records.map(({ biome, exported }) => ({ biome, ...exported })),
      glbRoundTrip: true,
      blenderReopened: true,
    },
    null,
    2,
  ),
);
