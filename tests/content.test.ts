import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateContent } from "../shared/content.ts";
const source = () =>
  JSON.parse(
    readFileSync(new URL("../public/content.json", import.meta.url), "utf8"),
  );
test("content allows replacing driver, scenery and palette without race rule changes", () => {
  const c = source();
  c.characterModel = "/models/sample-driver.gltf";
  c.sceneModel = "/models/sample-driver.gltf";
  c.palette[0] = "#ff5599";
  assert.equal(validateContent(c).characterModel, c.characterModel);
});
test("invalid assets, colors, duplicate challenges and fractional laps fail clearly", () => {
  for (const change of [
    (c: any) => (c.palette = ["red"]),
    (c: any) => (c.characterModel = "javascript:alert(1)"),
    (c: any) => (c.modelScale = 0),
    (c: any) => (c.challenges[1].id = c.challenges[0].id),
    (c: any) => (c.challenges[0].laps = 1.5),
  ]) {
    const c = source();
    change(c);
    assert.throws(() => validateContent(c));
  }
  assert.throws(() => validateContent(null));
});
