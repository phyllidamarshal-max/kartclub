import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar, EMPTY_INPUT } from "../shared/race.ts";
import { getTrack, trackPoint } from "../shared/track.ts";
import { createItems, stepItems } from "../shared/items.ts";
test("same car cannot farm the same item band by reversing or changing lane during a lap", () => {
  const t = getTrack("coast"),
    c = spawnCar(),
    w = createItems([c.id], t),
    p = trackPoint(0.06, t);
  c.x = p.x;
  c.z = p.z;
  c.heading = p.heading;
  c.speed = 20;
  c.progress = 0.059;
  stepItems(w, [c], {}, 1 / 60, t);
  c.progress = 0.06;
  stepItems(w, [c], {}, 1 / 60, t);
  assert.ok(w.players[c.id].held);
  w.players[c.id].held = null;
  w.time += 4;
  c.progress = 0.059;
  stepItems(w, [c], {}, 1 / 60, t);
  assert.equal(w.players[c.id].held, null);
  c.progress = 0.06;
  stepItems(w, [c], {}, 1 / 60, t);
  assert.equal(w.players[c.id].held, null);
});
