import { test } from "node:test";
import assert from "node:assert/strict";
import { canOpenPause } from "../client/lifecycle.ts";

test("a stale solo result only blocks the solo result screen", () => {
  assert.equal(canOpenPause("solo", true, "result"), false);
  assert.equal(canOpenPause("multi", true, ""), true);
  assert.equal(canOpenPause("solo", false, ""), true);
});
