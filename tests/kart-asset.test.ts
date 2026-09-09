import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createKartModel } from "../client/kart-model.ts";

test("delivered GLB parses with animated wheels and independently owned tinted clones", async () => {
  const assetPath = new URL(
    "../public/models/kart/club-kart.glb",
    import.meta.url,
  );
  assert.ok(existsSync(assetPath), "a runtime GLB is delivered");
  const { cloneKartAsset } = await import("../client/kart-asset.ts");
  const bytes = readFileSync(assetPath);
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const a = cloneKartAsset(gltf.scene, "#a7cf35");
  const b = cloneKartAsset(gltf.scene, "#ef7893");
  const cloth = (root: THREE.Object3D) => {
    const found: THREE.Mesh[] = [];
    root.traverse((node) => {
      if (
        node instanceof THREE.Mesh &&
        (node.material as THREE.Material).name === "kart-suit"
      )
        found.push(node);
    });
    return found;
  };
  assert.equal(cloth(gltf.scene).length, 1);
  const clothSource = cloth(gltf.scene)[0];
  const clothColors = clothSource.geometry.getAttribute("color");
  assert.ok(clothColors, "runtime GLB must preserve cloth recess colors");
  assert.ok(
    Array.from({ length: clothColors.count }, (_, i) =>
      clothColors.getX(i),
    ).some((value) => value < 0.9),
  );
  for (const clone of [a, b]) {
    assert.deepEqual(
      cloth(clone)[0].geometry.getAttribute("color").array,
      clothColors.array,
    );
    assert.ok(
      (cloth(clone)[0].material as THREE.MeshStandardMaterial).vertexColors,
    );
    assert.equal(
      (
        cloth(clone)[0].material as THREE.MeshStandardMaterial
      ).color.getHexString(),
      "e9dfc7",
    );
  }
  const resources = (root: THREE.Object3D) => {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        geometries.add(node.geometry);
        for (const m of Array.isArray(node.material)
          ? node.material
          : [node.material])
          materials.add(m);
      }
    });
    return { geometries, materials };
  };
  const source = resources(gltf.scene),
    one = resources(a),
    two = resources(b);
  for (const geometry of one.geometries)
    assert.ok(
      !two.geometries.has(geometry) && !source.geometries.has(geometry),
    );
  for (const material of one.materials)
    assert.ok(!two.materials.has(material) && !source.materials.has(material));
  for (const [root, color] of [
    [a, "#a7cf35"],
    [b, "#ef7893"],
  ] as const) {
    assert.ok(root.getObjectByName("driver"));
    let wheels = 0,
      paint = 0;
    root.traverse((node) => {
      if (node.userData.wheelRadius) {
        wheels++;
        assert.ok(node.getObjectByName(node.userData.spinNode));
      }
      if (node instanceof THREE.Mesh)
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material]) {
          if (material.userData.kartTint) {
            paint++;
            assert.equal(
              (material as THREE.MeshStandardMaterial).color.getHexString(),
              new THREE.Color(color).getHexString(),
            );
          }
        }
    });
    assert.equal(wheels, 4);
    assert.ok(paint > 0);
  }
  assert.ok(
    existsSync(new URL("../art/kart/club-kart.blend", import.meta.url)),
  );
});

test("source and runtime GLBs match the authored geometry and measured budget", async () => {
  const authored = createKartModel("#aec83e");
  const authoredBounds = new THREE.Box3().setFromObject(authored, true);
  const count = (root: THREE.Object3D) => {
    let triangles = 0,
      meshes = 0,
      vertices = 0;
    const materials = new Set<THREE.Material>();
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      meshes++;
      triangles +=
        (node.geometry.index?.count ??
          node.geometry.getAttribute("position").count) / 3;
      vertices += node.geometry.getAttribute("position").count;
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        materials.add(material);
    });
    return { triangles, meshes, vertices, materials: materials.size };
  };
  const manifest = JSON.parse(
    readFileSync(
      new URL("../public/models/kart/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  for (const [key, path] of [
    ["source", "../art/kart/club-kart-source.glb"],
    ["runtime", "../public/models/kart/club-kart.glb"],
  ]) {
    const bytes = readFileSync(new URL(path, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    const actual = count(gltf.scene);
    assert.equal(
      actual.triangles,
      count(authored).triangles,
      `${key} GLB is stale`,
    );
    for (const [field, value] of Object.entries(actual))
      assert.equal(manifest[key][field], value);
    assert.equal(manifest[key].fileBytes, bytes.byteLength);
    const bounds = new THREE.Box3().setFromObject(gltf.scene, true);
    assert.ok(bounds.min.distanceTo(authoredBounds.min) < 0.00001);
    assert.ok(bounds.max.distanceTo(authoredBounds.max) < 0.00001);
  }
  assert.ok(manifest.runtime.triangles <= 26644);
  assert.ok(manifest.runtime.meshes <= 23);
  assert.ok(manifest.runtime.fileBytes <= 586144);
  const blender = JSON.parse(
    readFileSync(
      new URL("../art/kart/blender-validation.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(blender.assetVersion, manifest.version);
  assert.equal(
    blender.sourceGlbSha256,
    createHash("sha256")
      .update(
        readFileSync(
          new URL("../art/kart/club-kart-source.glb", import.meta.url),
        ),
      )
      .digest("hex"),
  );
  assert.equal(blender.triangles, manifest.source.triangles);
  assert.equal(blender.meshes, manifest.source.meshes);
  assert.equal(blender.materials, manifest.source.materials);
  assert.equal(blender.reopenedSuccessfully, true);
  assert.ok(
    blender.meshesWithVertexColors >= 10,
    "Blender must retain cloth vertex attributes",
  );
});
