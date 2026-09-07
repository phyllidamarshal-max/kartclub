import { test } from "node:test";
import assert from "node:assert/strict";
import { validGhost } from "../shared/ghost.ts";
import { VERSIONS } from "../shared/rules.ts";
import { Training } from "../client/training.ts";
import { spawnCar } from "../shared/race.ts";
test("ghosts are compatible only inside a complete record context", () => {
  const g = {
    version: 3,
    trackId: "coast",
    ...VERSIONS,
    time: 1,
    frames: [
      [0, 0, 0, 0],
      [1, 2, 3, 0],
    ],
    sectors: [0.3, 0.7, 1],
  };
  assert.ok(validGhost(g, "coast"));
  assert.ok(!validGhost({ ...g, rulesVersion: "old" }, "coast"));
  assert.ok(!validGhost({ ...g, assistClass: "auto" }, "coast"));
  assert.ok(
    !validGhost(
      {
        ...g,
        frames: [
          [0, 0, 0, 0],
          [0.4, 2, 3, 0],
        ],
      },
      "coast",
    ),
  );
});
test("teaching advances only from actual driving events and can restart without granting resources", () => {
  const t = new Training(),
    c = spawnCar();
  t.update(c);
  assert.equal(t.step, 0);
  c.speed = 15;
  c.heading += 0.4;
  t.update(c);
  assert.equal(t.step, 1);
  c.driftTotal = 20;
  t.update(c);
  assert.equal(t.step, 2);
  c.miniUses = 1;
  t.update(c);
  assert.equal(t.step, 3);
  c.nitroUses = 1;
  t.update(c);
  assert.equal(t.step, 4);
  c.lap = 1;
  t.update(c);
  assert.equal(t.step, 5);
});
