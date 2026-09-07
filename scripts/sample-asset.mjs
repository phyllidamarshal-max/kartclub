import { BoxGeometry } from "three";
import { mkdirSync, writeFileSync } from "node:fs";
const box = new BoxGeometry(1, 1, 1),
  parts = [
    box.attributes.position.array,
    box.attributes.normal.array,
    box.index.array,
  ];
const bytes = Buffer.concat(
  parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)),
);
let offset = 0;
const views = parts.map((p) => {
  const v = { buffer: 0, byteOffset: offset, byteLength: p.byteLength };
  offset += p.byteLength;
  return v;
});
const gltf = {
  asset: { version: "2.0", generator: "PONS Kart original sample character" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: "Sample Robot Driver", children: [1, 2, 3] },
    { mesh: 0, translation: [0, 0.35, 0], scale: [0.65, 0.7, 0.45] },
    { mesh: 1, translation: [0, 0.96, 0], scale: [0.8, 0.62, 0.68] },
    { mesh: 2, translation: [0, 0.98, 0.35], scale: [0.62, 0.2, 0.04] },
  ],
  meshes: [0, 1, 2].map((material) => ({
    primitives: [
      { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material },
    ],
  })),
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.93, 0.91, 0.84, 1],
        metallicFactor: 0,
        roughnessFactor: 0.8,
      },
    },
    {
      pbrMetallicRoughness: {
        baseColorFactor: [1, 0.45, 0.64, 1],
        metallicFactor: 0,
        roughnessFactor: 0.5,
      },
    },
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.08, 0.18, 0.23, 1],
        metallicFactor: 0.2,
        roughnessFactor: 0.3,
      },
    },
  ],
  buffers: [
    {
      byteLength: bytes.length,
      uri: "data:application/octet-stream;base64," + bytes.toString("base64"),
    },
  ],
  bufferViews: views,
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 24,
      type: "VEC3",
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5],
    },
    { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
    { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
  ],
};
mkdirSync("public/models", { recursive: true });
writeFileSync("public/models/sample-driver.gltf", JSON.stringify(gltf));
console.log("Original sample driver written.");
