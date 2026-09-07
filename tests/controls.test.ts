import { test } from "node:test";
import assert from "node:assert/strict";
import { readInput, DEFAULT_BINDINGS } from "../client/controls.ts";
test("right key rotates toward camera screen right for the +Z forward kart", () => {
  assert.equal(readInput(new Set(["KeyD"]), DEFAULT_BINDINGS).steer, -1);
  assert.equal(readInput(new Set(["ArrowLeft"]), DEFAULT_BINDINGS).steer, 1);
});
test("remapped acceleration and permanent arrow fallback both work", () => {
  const b = { ...DEFAULT_BINDINGS, throttle: "KeyI" };
  assert.equal(readInput(new Set(["KeyI"]), b).throttle, 1);
  assert.equal(readInput(new Set(["ArrowUp"]), b).throttle, 1);
  assert.equal(readInput(new Set(["KeyW"]), b).throttle, 0);
});
