import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  loadCoastAssets,
  disposeCoastAssets,
  updateCoastAssets,
} from "../client/coast-assets.ts";
import {
  createCoastLayout,
  COAST_FOOTPRINTS,
  coastCottageApproach,
} from "../client/coast-layout.ts";
import { DEFAULT_TRACK } from "../shared/track.ts";
import { roadsideClear } from "../client/scenery.ts";
import { createCoastPaths } from "../client/coast-gardens.ts";

const keys = Object.keys(COAST_FOOTPRINTS);
function fixture() {
  const geometries: THREE.BufferGeometry[] = [],
    materials: THREE.MeshStandardMaterial[] = [],
    textures: THREE.Texture[] = [];
  let disposed = 0,
    closed = 0;
  const tex = () => {
    const t = new THREE.Texture({
      close() {
        closed++;
      },
    } as unknown as HTMLImageElement);
    t.addEventListener("dispose", () => disposed++);
    textures.push(t);
    return t;
  };
  const options = {
    fetch: async () => ({
      ok: true,
      json: async () => ({
        version: "test",
        assets: keys.map((key) => ({
          key,
          model: `${key}.glb`,
          indirect: `${key}.png`,
        })),
      }),
    }),
    loadGLTF: async (_url: string) => {
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      geometry.setAttribute("uv1", geometry.getAttribute("uv").clone());
      geometries.push(geometry);
      geometry.addEventListener("dispose", () => disposed++);
      const mat = new THREE.MeshStandardMaterial({ map: tex(), aoMap: tex() });
      mat.map!.channel = 0;
      mat.aoMap!.channel = 1;
      materials.push(mat);
      mat.addEventListener("dispose", () => disposed++);
      const scene = new THREE.Group();
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.y = 1;
      scene.add(mesh);
      return { scene };
    },
    loadTexture: async (_url: string) => tex(),
    layout: [0, 1].map((i) => ({
      asset: "cottage-hero",
      x: 10 + i * 3,
      y: -0.18,
      z: 20,
      heading: 0,
      scale: 1,
    })),
  };
  return {
    options,
    geometries,
    materials,
    textures,
    counts: () => ({ disposed, closed }),
  };
}

test("coast load preserves atlas channels and source transforms, batches shared resources", async () => {
  const f = fixture();
  const group = await loadCoastAssets(DEFAULT_TRACK, f.options);
  assert.equal(
    group.children.filter((c) => c.name !== "coast:cottage-paths").length,
    1,
  );
  const mesh = group.children[0] as THREE.InstancedMesh;
  assert.equal(mesh.count, 2);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  assert.ok(Math.abs(matrix.elements[13] - 0.82) < 1e-5);
  assert.equal(mesh.geometry, f.geometries[0]);
  for (const mat of f.materials) {
    assert.equal(mat.map!.channel, 0);
    assert.equal(mat.aoMap!.channel, 1);
    assert.equal(mat.lightMap!.channel, 1);
    assert.equal(mat.lightMap!.flipY, false);
    assert.equal(mat.lightMap!.colorSpace, THREE.LinearSRGBColorSpace);
    assert.equal(mat.lightMapIntensity, 0.45);
    assert.equal(mat.aoMapIntensity, 0.55);
  }
  let buffers = 0;
  mesh.addEventListener("dispose", () => buffers++);
  disposeCoastAssets(group);
  disposeCoastAssets(group);
  assert.equal(buffers, 1);
  assert.equal(group.children.length, 0);
  assert.deepEqual(f.counts(), {
    disposed: keys.length * 5,
    closed: keys.length * 3,
  });
});

test("coast failure cleans partial and late resolving model and texture resources", async () => {
  const f = fixture();
  const original = f.options.loadGLTF;
  f.options.loadGLTF = async (url) => {
    if (url.includes("cottage-hero")) throw new Error("decode failed");
    await new Promise((resolve) => setTimeout(resolve, 15));
    return original(url);
  };
  await assert.rejects(
    loadCoastAssets(DEFAULT_TRACK, f.options),
    /decode failed/,
  );
  assert.equal(f.geometries.length, keys.length - 1);
  assert.deepEqual(f.counts(), {
    disposed: (keys.length - 1) * 4 + keys.length,
    closed: (keys.length - 1) * 2 + keys.length,
  });
});

test("stale World disposal detaches group and protects borrowed textures and bitmaps", async () => {
  const f = fixture();
  const external = new Set<object>();
  const original = f.options.loadTexture;
  f.options.loadTexture = async (url) => {
    const value = await original(url);
    external.add(value);
    return value;
  };
  const group = await loadCoastAssets(DEFAULT_TRACK, {
    ...f.options,
    externalResources: external,
  });
  const parent = new THREE.Group();
  parent.add(group);
  disposeCoastAssets(group);
  assert.equal(parent.children.length, 0);
  assert.deepEqual(f.counts(), {
    disposed: keys.length * 4,
    closed: keys.length * 2,
  });
});

test("different materials never combine even with shared geometry", async () => {
  const f = fixture(),
    original = f.options.loadGLTF;
  f.options.loadGLTF = async (url) => {
    const result = await original(url);
    if (url.includes("cottage-hero")) {
      const first = result.scene.children[0] as THREE.Mesh;
      result.scene.add(
        new THREE.Mesh(first.geometry, new THREE.MeshStandardMaterial()),
      );
    }
    return result;
  };
  const group = await loadCoastAssets(DEFAULT_TRACK, f.options);
  assert.equal(
    group.children.filter((c) => c.name !== "coast:cottage-paths").length,
    2,
  );
  disposeCoastAssets(group);
});

test("layout uses road-clear full footprints and avoids cottages with ground patches", () => {
  const layout = createCoastLayout(DEFAULT_TRACK);
  const houses = layout.filter((p) => p.asset.startsWith("cottage"));
  const patches = layout.filter((p) => /meadow|shrub/.test(p.asset));
  assert.ok(patches.length >= 1000 && patches.length <= 1100);
  for (const rock of layout.filter((p) => p.asset === "rock-cluster")) {
    assert.ok(rock.y < -4);
    assert.ok(rock.y + 1.742078 * rock.scale < 0.3);
  }
  assert.ok(
    houses.length >= 7 && houses.length <= 10,
    `got ${houses.length} houses`,
  );
  assert.equal(new Set(houses.map((p) => p.asset)).size, 3);
  assert.equal(layout.filter((p) => p.asset === "lighthouse").length, 1);
  for (const p of layout) {
    assert.ok(
      roadsideClear(
        DEFAULT_TRACK,
        p.x,
        p.z,
        COAST_FOOTPRINTS[p.asset] * p.scale + 0.5,
      ),
      p.asset,
    );
    if (/meadow|shrub/.test(p.asset))
      for (const h of houses)
        assert.ok(
          Math.hypot(p.x - h.x, p.z - h.z) >=
            COAST_FOOTPRINTS[p.asset] * p.scale +
              COAST_FOOTPRINTS[h.asset] * h.scale +
              1,
        );
  }
});

test("cottage paths stop clear of road ribbons and release their own buffers", async () => {
  const layout = createCoastLayout(DEFAULT_TRACK);
  const paths = createCoastPaths(DEFAULT_TRACK, layout)!;
  // Path length follows the rebuilt outer stairs; paving beneath the stairs is
  // no longer counted. Every cottage still has an approach (checked below).
  assert.ok(paths.count >= layout.filter(p=>p.asset.startsWith('cottage')).length);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < paths.count; i++) {
    paths.getMatrixAt(i, matrix);
    assert.ok(
      roadsideClear(
        DEFAULT_TRACK,
        matrix.elements[12],
        matrix.elements[14],
        1.19,
      ),
    );
    assert.ok(matrix.elements[13] < -0.1);
  }
  paths.dispose();
  paths.geometry.dispose();
  (paths.material as THREE.Material).dispose();
  const f = fixture(),
    group = await loadCoastAssets(DEFAULT_TRACK, {
      ...f.options,
      layout: [f.options.layout[0]],
    });
  const loaded = group.getObjectByName(
    "coast:cottage-paths",
  ) as THREE.InstancedMesh;
  let disposed = 0;
  loaded.addEventListener("dispose", () => disposed++);
  loaded.geometry.addEventListener("dispose", () => disposed++);
  (loaded.material as THREE.Material).addEventListener(
    "dispose",
    () => disposed++,
  );
  disposeCoastAssets(group);
  disposeCoastAssets(group);
  assert.equal(disposed, 3);
});

test("paving follows authored off-centre doors and the same planting corridor", () => {
  const layout = createCoastLayout(DEFAULT_TRACK);
  for (const house of layout.filter((p) => p.asset.startsWith("cottage"))) {
    const paths = createCoastPaths(DEFAULT_TRACK, [house])!;
    assert.ok(paths);
    const matrix = new THREE.Matrix4();
    paths.getMatrixAt(0, matrix);
    const dx = matrix.elements[12] - house.x,
      dz = matrix.elements[14] - house.z;
    const expected =
      (house.asset === "cottage-hero"
        ? -1.5
        : house.asset === "cottage-low"
          ? -1.45
          : 0) * house.scale;
    assert.ok(
      Math.abs(
        dx * Math.cos(house.heading) - dz * Math.sin(house.heading) - expected,
      ) < 1e-4,
    );
    const origin = coastCottageApproach(house);
    const exportedStair={"cottage-hero":4.67,"cottage-gable":5.02,"cottage-low":4.27}[house.asset as 'cottage-hero'|'cottage-gable'|'cottage-low'];
    const slabRear=(matrix.elements[12]-origin.x)*Math.sin(house.heading)+(matrix.elements[14]-origin.z)*Math.cos(house.heading)-.4*house.scale;
    assert.ok(Math.abs(slabRear-exportedStair*house.scale)<1e-4,'first slab meets exported stair edge');
    for (const patch of layout.filter((p) => /meadow|shrub/.test(p.asset))) {
      const x = patch.x - origin.x,
        z = patch.z - origin.z;
      const forward = x * Math.sin(house.heading) + z * Math.cos(house.heading);
      if (forward > 0 && forward < 22)
        assert.ok(
          Math.abs(x * Math.cos(house.heading) - z * Math.sin(house.heading)) >=
            COAST_FOOTPRINTS[patch.asset] * patch.scale + 1,
        );
    }
    paths.dispose();
    paths.geometry.dispose();
    (paths.material as THREE.Material).dispose();
  }
  const shore = layout.slice(-220);
  assert.equal(shore.length, 220);
  assert.ok(
    shore.every(
      (p) => /meadow|shrub/.test(p.asset) && p.scale >= 0.6 && p.scale <= 0.85,
    ),
  );
});

test("detail batches respond to quality/distance without hiding near cottages", async () => {
  const f = fixture();
  const group = await loadCoastAssets(DEFAULT_TRACK, {
    ...f.options,
    layout: [
      { ...f.options.layout[0], asset: "meadow-patch" },
      f.options.layout[1],
    ],
  });
  updateCoastAssets(group, new THREE.Vector3(300, 0, 0), true);
  assert.equal(
    group.children.find((c) => c.name === "coast:meadow-patch")!.visible,
    false,
  );
  assert.equal(
    group.children.find((c) => c.name === "coast:cottage-hero")!.visible,
    true,
  );
  disposeCoastAssets(group);
});
