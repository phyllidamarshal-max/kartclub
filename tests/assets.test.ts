import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Box3, Vector3 } from "three";
// Node has fetch but no ProgressEvent; provide the event shape the browser loader expects.
if (typeof globalThis.ProgressEvent === "undefined")
  globalThis.ProgressEvent = class extends Event {
    readonly lengthComputable = false;
    readonly loaded = 0;
    readonly total = 0;
    constructor(type: string, init: ProgressEventInit = {}) {
      super(type);
      Object.assign(this, init);
    }
  } as typeof ProgressEvent;
test("replacement sample character loads with the actual glTF loader at kart scale", async () => {
  const json = readFileSync(
    new URL("../public/models/sample-driver.gltf", import.meta.url),
    "utf8",
  );
  const gltf = await new GLTFLoader().parseAsync(json, "");
  const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
  assert.ok(size.y > 1 && size.y < 2);
  assert.ok(size.x > 0.5 && size.x < 1);
  assert.equal(gltf.scene.children[0].name, "Sample_Robot_Driver");
});
