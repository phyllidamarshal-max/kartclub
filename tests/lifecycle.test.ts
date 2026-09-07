import { test } from "node:test";
import assert from "node:assert/strict";
import { canOpenPause, reconnectDeadline } from "../client/lifecycle.ts";

test("a stale solo result only blocks the solo result screen", () => {
  assert.equal(canOpenPause("solo", true, "result"), false);
  assert.equal(canOpenPause("multi", true, ""), true);
  assert.equal(canOpenPause("solo", false, ""), true);
});

test("repeated drops preserve the first reconnect deadline", () => {
  const first = reconnectDeadline(null, 1_000);
  assert.equal(first, 31_000);
  assert.equal(reconnectDeadline(first, 12_000), first);
  assert.equal(reconnectDeadline(null, 12_000), 42_000);
});
