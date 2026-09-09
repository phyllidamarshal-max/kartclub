import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { TRACKS, trackWidth, shortcutWidthAt } from "../shared/track.ts";
import { terrainHeight, decorateLevel } from "../client/level-scenery.ts";
import { roadsideClear } from "../client/scenery.ts";
import {
  FOREST_TREE_ASSETS,
  createForestFoliageLayout,
  loadBiomeFoliage,
  updateBiomeFoliage,
  disposeBiomeFoliage,
  type ForestFoliagePlacement,
} from "../client/biome-foliage.ts";

const forestTracks = TRACKS.filter((t) =>
  ["mountain", "forest-orchard", "forest-ridge"].includes(t.id),
);

test("authored GLB vertices fit the declared crown radii and start at ground level", () => {
  for (const [asset, metadata] of Object.entries(FOREST_TREE_ASSETS)) {
    const buffer = readFileSync(
      new URL(`../public/art/coast-rebuild/${asset}.glb`, import.meta.url),
    );
    const jsonLength = buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
    const position =
      gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
    const view = gltf.bufferViews[position.bufferView];
    const start =
      28 + jsonLength + (view.byteOffset ?? 0) + (position.byteOffset ?? 0);
    let radius = 0,
      height = 0,
      base = Infinity;
    for (let i = 0; i < position.count; i++) {
      const offset = start + i * (view.byteStride ?? 12);
      const x = buffer.readFloatLE(offset),
        y = buffer.readFloatLE(offset + 4),
        z = buffer.readFloatLE(offset + 8);
      radius = Math.max(radius, Math.hypot(x, z));
      height = Math.max(height, y);
      base = Math.min(base, y);
    }
    assert.ok(
      radius <= metadata.radius && metadata.radius - radius < 0.002,
      `${asset} crown radius mismatch`,
    );
    assert.ok(height <= metadata.height && metadata.height - height < 0.002);
    assert.equal(base, 0);
    assert.equal(gltf.materials.length, 1);
    assert.equal(gltf.textures.length, 3);
    for (const node of gltf.nodes) {
      assert.equal(node.matrix, undefined);
      assert.equal(node.translation, undefined);
      assert.equal(node.rotation, undefined);
      assert.equal(node.scale, undefined);
    }
  }
});

function fixture() {
  const resources: {
    count: number;
    resource: THREE.BufferGeometry | THREE.Material | THREE.Texture;
  }[] = [];
  const bitmaps: { count: number; close(): void }[] = [];
  const models: string[] = [],
    lights: string[] = [];
  const own = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(
    resource: T,
  ) => {
    const record = { count: 0, resource };
    resource.addEventListener("dispose", () => record.count++);
    resources.push(record);
    return resource;
  };
  const texture = () => {
    const bitmap = {
      count: 0,
      close() {
        this.count++;
      },
    };
    bitmaps.push(bitmap);
    return own(new THREE.Texture(bitmap as unknown as HTMLImageElement));
  };
  const options = {
    loadGLTF: async (url: string) => {
      models.push(url);
      const geometry = own(new THREE.BoxGeometry(1, 4, 1));
      geometry.setAttribute("uv1", geometry.getAttribute("uv").clone());
      const orm = texture(),
        ao = own(orm.clone());
      ao.channel = 1;
      const material = own(
        new THREE.MeshStandardMaterial({
          map: texture(),
          normalMap: texture(),
          roughnessMap: orm,
          metalnessMap: orm,
          aoMap: ao,
        }),
      );
      const scene = new THREE.Group();
      const parent = new THREE.Group();
      parent.position.y = 0.5;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 2;
      parent.add(mesh);
      scene.add(parent);
      return { scene };
    },
    loadTexture: async (url: string) => {
      lights.push(url);
      return texture();
    },
  };
  return { resources, bitmaps, models, lights, options };
}

for (const track of forestTracks) {
  test(`${track.id} uses repeatable human-scale trees clear of every main and shortcut segment`, () => {
    const layout = createForestFoliageLayout(track);
    assert.deepEqual(layout, createForestFoliageLayout(track));
    assert.ok(
      layout.length >= 220 && layout.length <= 320,
      `${layout.length} trees`,
    );
    assert.equal(new Set(layout.map((p) => p.asset)).size, 3);
    if (track.shortcut.length > 1)
      assert.ok(layout.filter((p) => p.branch === "shortcut").length >= 8);
    for (const p of layout) {
      assert.ok(p.scale >= 1.2 && p.scale <= 2);
      assert.equal(p.radius, FOREST_TREE_ASSETS[p.asset].radius * p.scale);
      assert.equal(p.y, terrainHeight(track, p.x, p.z));
      for (const [points, shortcut] of [
        [track.points, false],
        [track.shortcut, true],
      ] as const) {
        for (let i = 0; i < points.length - (shortcut ? 1 : 0); i++) {
          const a = points[i],
            b = points[(i + 1) % points.length];
          const dx = b.x - a.x,
            dz = b.z - a.z;
          const f = Math.max(
            0,
            Math.min(
              1,
              ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
            ),
          );
          const t = (a.t + ((b.t < a.t ? b.t + 1 : b.t) - a.t) * f) % 1;
          const width = shortcut
            ? shortcutWidthAt(t, track)
            : trackWidth(t, track);
          assert.ok(
            Math.hypot(p.x - a.x - f * dx, p.z - a.z - f * dz) >=
              width / 2 + p.radius + 1,
            `${track.id}: ${p.asset} overlaps ${shortcut ? "shortcut" : "main"} at ${t}`,
          );
        }
      }
    }
  });
}

test("non-forest tracks do not request any tree resources", async () => {
  const f = fixture();
  const track = TRACKS.find((t) => t.id === "coast")!;
  assert.deepEqual(createForestFoliageLayout(track), []);
  const group = await loadBiomeFoliage(track, f.options);
  assert.equal(group.children.length, 0);
  assert.equal(f.models.length, 0);
  assert.equal(f.lights.length, 0);
  disposeBiomeFoliage(group);
});

test("owned tree batches preserve source transforms, PBR channels and exact instance bounds", async () => {
  const f = fixture(),
    track = forestTracks[0];
  const group = await loadBiomeFoliage(track, f.options);
  const layout = group.userData.biomeFoliage
    .placements as ForestFoliagePlacement[];
  assert.equal(f.models.length, 3);
  assert.equal(f.lights.length, 3);
  assert.ok(
    f.models.every((url) => /\/tree-(round|oak|slender)\.glb$/.test(url)),
  );
  assert.equal(group.userData.biomeFoliage.materialCount, 3);
  assert.equal(group.userData.biomeFoliage.textureCount, 15);
  assert.equal(group.userData.biomeFoliage.cellSize, 72);
  let total = 0;
  for (const child of group.children) {
    assert.ok(child instanceof THREE.InstancedMesh);
    total += child.count;
    const cell = child.userData.biomeFoliageCell;
    const material = child.material as THREE.MeshStandardMaterial;
    assert.equal(material.map!.channel, 0);
    assert.equal(material.aoMap!.channel, 1);
    assert.equal(material.lightMap!.channel, 1);
    assert.equal(material.lightMap!.flipY, false);
    assert.equal(material.lightMap!.colorSpace, THREE.LinearSRGBColorSpace);
    assert.ok(child.boundingBox && child.boundingSphere);
    const size = child.boundingBox!.getSize(new THREE.Vector3());
    assert.ok(size.x < 84 && size.z < 84);
    const matrix = new THREE.Matrix4(),
      scale = new THREE.Vector3();
    for (let i = 0; i < child.count; i++) {
      child.getMatrixAt(i, matrix);
      const p = layout[cell.placementIndices[i]];
      assert.ok(Math.abs(matrix.elements[13] - (p.y + 2.5 * p.scale)) < 1e-4);
      scale.setFromMatrixScale(matrix);
      assert.ok(Math.abs(scale.x - p.scale) < 1e-5);
      assert.ok(Math.abs(scale.y - p.scale) < 1e-5);
      assert.ok(Math.abs(scale.z - p.scale) < 1e-5);
      const bounds: THREE.Box3 = child.geometry
        .boundingBox!.clone()
        .applyMatrix4(matrix);
      const outer = child.boundingBox!.clone().expandByScalar(1e-4);
      assert.ok(outer.containsBox(bounds));
    }
  }
  assert.equal(total, layout.length);
  const buffers = group.children.map((mesh) => {
    const record = { count: 0 };
    (mesh as THREE.InstancedMesh).addEventListener(
      "dispose",
      () => record.count++,
    );
    return record;
  });
  const parent = new THREE.Group();
  parent.add(group);
  disposeBiomeFoliage(group);
  disposeBiomeFoliage(group);
  assert.equal(parent.children.length, 0);
  assert.equal(group.children.length, 0);
  assert.ok(f.resources.every((r) => r.count === 1));
  assert.ok(f.bitmaps.every((r) => r.count === 1));
  assert.ok(buffers.every((r) => r.count === 1));
});

test("quality and distance cull cells and shadows while preserving foreground trees", async () => {
  const f = fixture(),
    group = await loadBiomeFoliage(forestTracks[0], f.options);
  const child = group.children[0],
    cell = child.userData.biomeFoliageCell;
  updateBiomeFoliage(group, new THREE.Vector3(cell.x + 320, 0, cell.z), false);
  assert.equal(child.visible, true);
  assert.equal(child.castShadow, false);
  updateBiomeFoliage(group, new THREE.Vector3(cell.x + 320, 0, cell.z), true);
  assert.equal(child.visible, false);
  updateBiomeFoliage(group, new THREE.Vector3(cell.x, 0, cell.z), true);
  assert.equal(child.visible, true);
  assert.equal(child.castShadow, true);
  updateBiomeFoliage(group, new THREE.Vector3(10000, 0, 10000), false);
  assert.ok(group.children.every((mesh) => !mesh.visible && !mesh.castShadow));
  disposeBiomeFoliage(group);
});

test("failed decode waits for and disposes all successful late model and light resources", async () => {
  const f = fixture(),
    original = f.options.loadGLTF;
  f.options.loadGLTF = async (url) => {
    if (url.includes("tree-oak")) throw new Error("tree decode failed");
    await new Promise((resolve) => setTimeout(resolve, 10));
    return original(url);
  };
  await assert.rejects(
    loadBiomeFoliage(forestTracks[0], f.options),
    /tree decode failed/,
  );
  assert.equal(f.models.length, 2);
  assert.equal(f.lights.length, 3);
  assert.ok(f.resources.every((r) => r.count === 1));
  assert.ok(f.bitmaps.every((r) => r.count === 1));
});

test("optional indirect maps can be omitted and separately loaded scenes own distinct resources", async () => {
  const f = fixture();
  const a = await loadBiomeFoliage(forestTracks[0], {
    ...f.options,
    indirect: false,
  });
  const firstResources = [...f.resources];
  const b = await loadBiomeFoliage(forestTracks[0], {
    ...f.options,
    indirect: false,
  });
  assert.equal(f.lights.length, 0);
  assert.equal(f.models.length, 6);
  disposeBiomeFoliage(a);
  assert.ok(firstResources.every((r) => r.count === 1));
  assert.ok(
    f.resources.slice(firstResources.length).every((r) => r.count === 0),
  );
  assert.ok(b.children.length > 0);
  disposeBiomeFoliage(b);
  assert.ok(f.resources.every((r) => r.count === 1));
});

test("failed indirect requests also release successful model resources", async () => {
  const f = fixture(),
    original = f.options.loadTexture;
  f.options.loadTexture = async (url) => {
    if (url.includes("tree-oak")) throw new Error("indirect decode failed");
    return original(url);
  };
  await assert.rejects(
    loadBiomeFoliage(forestTracks[0], f.options),
    /indirect decode failed/,
  );
  assert.equal(f.models.length, 3);
  assert.equal(f.lights.length, 2);
  assert.ok(f.resources.every((r) => r.count === 1));
  assert.ok(f.bitmaps.every((r) => r.count === 1));
});

test("borrowed texture wrappers and shared bitmaps are left available for their owner", async () => {
  const f = fixture(),
    external = new Set<object>();
  const original = f.options.loadGLTF;
  f.options.loadGLTF = async (url) => {
    const result = await original(url);
    result.scene.traverse((object) => {
      if (object instanceof THREE.Mesh)
        external.add(
          (object.material as THREE.MeshStandardMaterial).roughnessMap!,
        );
    });
    return result;
  };
  const group = await loadBiomeFoliage(forestTracks[0], {
    ...f.options,
    externalResources: external,
  });
  disposeBiomeFoliage(group);
  for (const record of f.resources)
    assert.equal(record.count, external.has(record.resource) ? 0 : 1);
  const borrowedImages = new Set(
    [...external].map((texture) => (texture as THREE.Texture).source.data),
  );
  for (const bitmap of f.bitmaps)
    assert.equal(bitmap.count, borrowedImages.has(bitmap) ? 0 : 1);
});

for (const track of forestTracks) {
  test(`${track.id} replaces the existing landmark with a clear uniform-scale oak and reserves its crown`, async () => {
    const scene = new THREE.Scene();
    decorateLevel(scene, track, () => 0.45);
    const original = scene.getObjectByName("forest-ancient-redwood")!;
    assert.ok(original);
    const landmark = {
      x: original.position.x,
      y: original.position.y,
      z: original.position.z,
      heading: original.rotation.y,
    };
    const f = fixture();
    const group = await loadBiomeFoliage(track, { ...f.options, landmark });
    const metadata = group.userData.biomeFoliage;
    assert.equal(metadata.landmarkCount, 1);
    const hero = (metadata.placements as ForestFoliagePlacement[]).find(
      (p) => p.kind === "landmark",
    )!;
    assert.ok(hero);
    assert.equal(hero.asset, "tree-oak");
    assert.equal(hero.scale, 4.5);
    assert.equal(hero.radius, FOREST_TREE_ASSETS["tree-oak"].radius * 4.5);
    assert.ok(hero.radius <= original.userData.footprintRadius);
    for (const key of ["x", "y", "z", "heading"] as const)
      assert.equal(hero[key], landmark[key]);
    assert.ok(roadsideClear(track, hero.x, hero.z, hero.radius + 1));
    for (const p of metadata.placements as ForestFoliagePlacement[]) {
      if (p === hero) continue;
      assert.ok(
        Math.hypot(p.x - hero.x, p.z - hero.z) >= p.radius + hero.radius + 0.5,
      );
      assert.ok(p.scale >= 1.2 && p.scale <= 2);
    }
    assert.ok(metadata.placementCount <= 320);
    assert.equal(f.models.length, 3);
    const landmarkBatch = group.children.find(
      (child) => child.userData.biomeFoliageCell.landmark,
    )!;
    const cell = landmarkBatch.userData.biomeFoliageCell;
    updateBiomeFoliage(
      group,
      new THREE.Vector3(cell.x + 600, 0, cell.z),
      false,
    );
    assert.equal(landmarkBatch.visible, true);
    updateBiomeFoliage(group, new THREE.Vector3(cell.x + 600, 0, cell.z), true);
    assert.equal(landmarkBatch.visible, false);
    updateBiomeFoliage(group, new THREE.Vector3(cell.x + 400, 0, cell.z), true);
    assert.equal(landmarkBatch.visible, true);
    disposeBiomeFoliage(group);
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    });
    for (const resource of [...geometries, ...materials]) resource.dispose();
    scene.clear();
  });
}

test("an unsafe landmark rejects before loading so the caller can preserve its fallback", async () => {
  const f = fixture(),
    track = forestTracks[0],
    p = track.points[0];
  await assert.rejects(
    loadBiomeFoliage(track, {
      ...f.options,
      landmark: { x: p.x, y: p.y, z: p.z, heading: p.heading },
    }),
    /landmark.*clearance/,
  );
  assert.equal(f.models.length, 0);
  assert.equal(f.lights.length, 0);
});

test("a rendered-ground sampler overrides analytic feet heights including the landmark", async () => {
  const f = fixture(),
    track = forestTracks[0];
  const landmark = { x: track.radius + 50, y: 80, z: 0, heading: 0 };
  const groundHeight = (x: number, z: number) => 8 + x * 0.002 - z * 0.001;
  const group = await loadBiomeFoliage(track, {
    ...f.options,
    landmark,
    groundHeight,
  });
  const placements = group.userData.biomeFoliage
    .placements as ForestFoliagePlacement[];
  assert.ok(placements.some((p) => p.kind === "landmark"));
  for (const p of placements) assert.equal(p.y, groundHeight(p.x, p.z));
  for (const child of group.children) {
    const mesh = child as THREE.InstancedMesh,
      indices = mesh.userData.biomeFoliageCell.placementIndices;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      const p = placements[indices[i]];
      assert.ok(
        Math.abs(
          matrix.elements[13] - (groundHeight(p.x, p.z) + 2.5 * p.scale),
        ) < 1e-4,
      );
    }
  }
  disposeBiomeFoliage(group);
});

test("nonfinite sampled ground rejects before any model or texture requests", async () => {
  for (const height of [NaN, Infinity, -Infinity]) {
    const f = fixture();
    await assert.rejects(
      loadBiomeFoliage(forestTracks[0], {
        ...f.options,
        groundHeight: () => height,
      }),
      /ground.*finite/,
    );
    assert.equal(f.models.length, 0);
    assert.equal(f.lights.length, 0);
  }
});
