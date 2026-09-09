/** CPU-only catalog export. Runtime uses the editable TS builders, not these GLBs. */
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AmbientFauna } from "../../client/ambient-fauna.ts";
import { TRACKS } from "../../shared/track.ts";
import { ambientDirection } from "../../client/ambient-direction.ts";

class CPUFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  async readAsArrayBuffer(blob: Blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob: Blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
    this.onloadend?.();
  }
}
Object.assign(globalThis, { FileReader: CPUFileReader });
const directory = resolve("public/art/fauna");
await mkdir(directory, { recursive: true });
await mkdir(resolve("art/fauna"), { recursive: true });
const catalog: {
  species: string;
  file: string;
  triangles: number;
  materials: number;
  drawCalls: number;
  dimensions: number[];
}[] = [];
for (const [species, id] of [
  ["whale", "coast"],
  ["camel", "desert-canyon"],
  ["bird", "mountain"],
] as const) {
  const fauna = new AmbientFauna(
    new THREE.Scene(),
    TRACKS.find((t) => t.id === id)!,
    { groundHeight: () => 0 },
  );
  const model = fauna.root.children[0].clone(true);
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.visible = true;
  model.updateMatrixWorld(true);
  const materials = new Set<THREE.Material>();
  let triangles = 0,
    drawCalls = 0;
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      drawCalls += Array.isArray(o.material) ? o.geometry.groups.length : 1;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  const dimensions = new THREE.Box3()
    .setFromObject(model)
    .getSize(new THREE.Vector3())
    .toArray();
  const data = await new GLTFExporter().parseAsync(model, {
    binary: true,
    onlyVisible: true,
  });
  const file = `${species}-catalog.glb`;
  await writeFile(resolve(directory, file), Buffer.from(data as ArrayBuffer));
  catalog.push({
    species,
    file,
    triangles,
    materials: materials.size,
    drawCalls,
    dimensions,
  });
  fauna.dispose();
}
const placements = [];
for (const track of TRACKS.filter((t) => ambientDirection(t.id)?.actor)) {
  const fauna = new AmbientFauna(new THREE.Scene(), track);
  const profile = ambientDirection(track.id)!,
    p = fauna.root.userData.paths[0],
    time = profile.active / 2;
  fauna.update(time, new THREE.Vector3(p.x, 0, p.z), false);
  placements.push({
    track: track.id,
    time,
    actor0: fauna.root.children[0].position.toArray(),
    paths: fauna.root.userData.paths.map(
      ({ samples, ...path }: Record<string, unknown>) => path,
    ),
  });
  fauna.dispose();
}
const metadata = {
  runtime:
    "client/fauna-models.ts and client/ambient-fauna.ts; GLBs are catalog-only, not runtime-loaded",
  catalog,
  placements,
};
await writeFile(
  resolve("art/fauna/catalog.json"),
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(JSON.stringify(metadata, null, 2));
