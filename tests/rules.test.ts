import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  acceptSnapshot,
  InputInbox,
  RACE_RULES,
  recordKey,
} from "../shared/rules.ts";
import { spawnCar, EMPTY_INPUT } from "../shared/race.ts";
import * as rules from "../shared/rules.ts";

test("DNF equal progress uses current-progress arrival time, independent of player ID or total time", () => {
  const a = spawnCar(0, "A"),
    z = spawnCar(1, "Z");
  a.progress = z.progress = 0.6;
  a.time = z.time = 300;
  assert.deepEqual(
    classify([a, z], { A: 200, Z: 100 }).map((r) => [r.car.id, r.rank]),
    [
      ["Z", 0],
      ["A", 0],
    ],
  );
});

test("race deadline closes twenty seconds after AI finish and never passes the hard cap", () => {
  assert.equal(typeof rules.raceDeadline, "function");
  const local = spawnCar(0, "local"),
    ai = spawnCar(1, "AI");
  ai.finished = true;
  ai.time = 100;
  assert.equal(rules.raceDeadline([local, ai]), 120);
  assert.ok(
    125 > rules.raceDeadline([local, ai]),
    "local arrival after the window is too late",
  );
  ai.time = 295;
  assert.equal(rules.raceDeadline([local, ai]), 300);
  ai.time = 100;
  assert.equal(
    rules.raceDeadline([local, ai], false),
    300,
    "training/time/practice ignore the first finisher",
  );
});
test("unresolvable finishes tie, DNF stays ineligible and the deadline respects the hard cap", () => {
  const a = spawnCar(0, "a"),
    b = spawnCar(1, "b"),
    c = spawnCar(2, "c");
  a.finished = b.finished = true;
  a.time = 10.00001;
  b.time = 10.00002;
  c.progress = 2;
  assert.deepEqual(
    classify([b, c, a]).map((x) => [x.car.id, x.rank]),
    [
      ["a", 1],
      ["b", 1],
      ["c", 0],
    ],
  );
  assert.equal(
    Math.min(RACE_RULES.hardLimit, 295 + RACE_RULES.finishWindow),
    300,
  );
});
test("snapshots reject old races and ticks; performance versions isolate records", () => {
  assert.equal(
    acceptSnapshot("r", 12, { roomId: "other", serverTick: 13 }),
    false,
  );
  assert.equal(acceptSnapshot("r", 12, { roomId: "r", serverTick: 11 }), false);
  assert.equal(acceptSnapshot("r", 12, { roomId: "r", serverTick: 13 }), true);
  assert.notEqual(
    recordKey("coast"),
    recordKey("coast", { rulesVersion: "old" }),
  );
});
test("input inbox retains a quick press/release once, rejects old frames, bounds future ticks", () => {
  const box = new InputInbox();
  assert.ok(
    box.push({ ...EMPTY_INPUT, seq: 1, clientTick: 9, boost: true }, 10, 0),
  );
  assert.ok(
    box.push({ ...EMPTY_INPUT, seq: 2, clientTick: 10, boost: false }, 10, 1),
  );
  assert.equal(box.take(2).boost, true);
  assert.equal(box.take(3).boost, false);
  assert.equal(box.push({ ...EMPTY_INPUT, seq: 2 }, 10, 3), false);
  assert.equal(
    box.push({ ...EMPTY_INPUT, seq: 3, clientTick: 10000 }, 10, 4),
    false,
  );
  assert.equal(box.take(1000).boost, false);
});
