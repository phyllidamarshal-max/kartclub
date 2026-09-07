import { test } from "node:test";
import assert from "node:assert/strict";
import { Economy } from "../server/economy.ts";
import { RaceRecords } from "../server/race-records.ts";
test("ties share occupied prizes equally without ID advantage, retries cannot alter the tie", () => {
  const e = new Economy(":memory:");
  for (const id of ["a", "b", "c", "d"]) e.ensureAccount(id);
  e.reserve("tie", ["a", "b", "c", "d"]);
  const r = e.settle("tie", ["a", "b", "c", "d"], [1, 1, 1, 1]);
  assert.deepEqual(
    r.allocations.map((a) => a.amount),
    [2500, 2500, 2500, 2500],
  );
  assert.deepEqual(e.settle("tie", ["a", "b", "c", "d"], [1, 1, 1, 1]), r);
  assert.throws(() => e.settle("tie", ["a", "b", "c", "d"], [1, 2, 3, 4]));
  assert.equal(e.pool().pending, 10000);
  e.close();
});
test("result records freeze exactly once and events deduplicate", () => {
  const r = new RaceRecords(":memory:");
  const a = r.freeze("r", { time: 1 });
  assert.equal(r.freeze("r", { time: 1 }), a);
  assert.throws(() => r.freeze("r", { time: 2 }));
  r.event("r", "1", { type: "start" });
  r.event("r", "1", { type: "start" });
  r.close();
});
