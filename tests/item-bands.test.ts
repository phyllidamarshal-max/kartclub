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

test("claiming a later lap never erases the item band's earlier-lap exclusion", () => {
  const track = getTrack("coast"),
    c = spawnCar(),
    w = createItems([c.id], track);
  const p = trackPoint(0.06, track);
  Object.assign(c, { x: p.x, z: p.z, lastT: p.t, speed: 20 });
  const visit = (lap: number) => {
    w.time += 4;
    c.progress = lap + 0.059;
    stepItems(w, [c], {}, 1 / 60, track);
    c.progress = lap + 0.06;
    stepItems(w, [c], {}, 1 / 60, track);
  };
  visit(0);
  assert.ok(w.players[c.id].held);
  w.players[c.id].held = null;
  visit(1);
  assert.ok(w.players[c.id].held);
  w.players[c.id].held = null;
  visit(0);
  assert.equal(w.players[c.id].held, null);
  assert.equal(w.players[c.id].pickedLaps[0], 1);
});
