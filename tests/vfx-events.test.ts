import { test } from "node:test";
import assert from "node:assert/strict";
import { createItems, stepItems } from "../shared/items.ts";
import { spawnCar, EMPTY_INPUT } from "../shared/race.ts";
import { DEFAULT_TRACK } from "../shared/track.ts";
import { recordVfx, pruneVfx } from "../shared/vfx-events.ts";
import { ItemVfxReader, CollisionVfxReader } from "../client/vfx/events.ts";

test("item journal is bounded and expires without changing the item random seed", () => {
  const w = createItems(["local"]);
  const seed = w.seed;
  for (let i = 0; i < 100; i++)
    recordVfx(w, {
      kind: "pickup",
      item: "shield",
      actor: "local",
      x: 0,
      y: 0,
      z: 0,
    });
  assert.equal(w.vfx?.events.length, 64);
  assert.equal(w.vfx?.sequence, 100);
  assert.equal(w.seed, seed);
  w.time = 3;
  pruneVfx(w);
  assert.equal(w.vfx?.events.length, 0);
  assert.equal(w.vfx?.sequence, 100);
});

test("confirmed item events baseline on join, deduplicate, reject stale snapshots and never replay inactive events", () => {
  const w = createItems(["local"]),
    reader = new ItemVfxReader();
  recordVfx(w, {
    kind: "pickup",
    item: "shield",
    actor: "local",
    x: 0,
    y: 0,
    z: 0,
  });
  assert.deepEqual(reader.read(w, true), []);
  const old = structuredClone(w);
  recordVfx(w, {
    kind: "use",
    item: "shield",
    actor: "local",
    x: 0,
    y: 0,
    z: 0,
  });
  assert.equal(reader.read(w, true).length, 1);
  assert.deepEqual(reader.read(w, true), []);
  assert.deepEqual(reader.read(old, true), []);
  assert.deepEqual(reader.read(w, true), []);
  recordVfx(w, {
    kind: "use",
    item: "boost",
    actor: "local",
    x: 0,
    y: 0,
    z: 0,
  });
  assert.deepEqual(reader.read(w, false), []);
  assert.deepEqual(reader.read(w, true), []);
});

test("missile expiry does not report impact, while a real shield block is recorded without a hit", () => {
  const c = spawnCar(0, "local"),
    owner = spawnCar(1, "owner"),
    w = createItems([c.id, owner.id]);
  w.missiles.push({
    x: c.x + 20,
    z: c.z,
    owner: owner.id,
    target: c.id,
    ttl: 0.01,
  });
  stepItems(w, [c, owner], {}, 1 / 60, DEFAULT_TRACK);
  assert.equal(
    w.vfx?.events.some((e) => e.kind === "hit" || e.kind === "block") ?? false,
    false,
  );
  w.players[c.id].shield = 1;
  w.missiles.push({
    x: c.x + 1,
    z: c.z,
    owner: owner.id,
    target: c.id,
    ttl: 1,
  });
  stepItems(w, [c, owner], {}, 1 / 60, DEFAULT_TRACK);
  assert.deepEqual(
    w.vfx?.events.map((e) => [e.kind, e.item, e.target]),
    [["block", "missile", "local"]],
  );
  assert.equal(w.players[c.id].slow, 0);
});

test("confirmed trap impact keeps the trap position, and deployment gets a stable visual id", () => {
  const c = spawnCar(0, "local"),
    owner = spawnCar(1, "owner"),
    w = createItems([c.id, owner.id]);
  const x = c.x + 0.5,
    z = c.z;
  w.traps.push({ x, z, y: 0, owner: owner.id, ttl: 10 });
  stepItems(w, [c, owner], {}, 1 / 60, DEFAULT_TRACK);
  const hit = w.vfx?.events.find((e) => e.kind === "hit");
  assert.equal(hit?.item, "trap");
  assert.equal(hit?.x, x);
  assert.equal(hit?.z, z);
  w.players[owner.id].held = "trap";
  stepItems(
    w,
    [c, owner],
    { [owner.id]: { ...EMPTY_INPUT, item: true } },
    1 / 60,
    DEFAULT_TRACK,
  );
  assert.ok(w.traps[0]?.visualId);
  assert.ok(w.vfx?.events.some((e) => e.kind === "deploy"));
});

test("collision burst consumes the confirmed high-water count and preserves actual energy loss", () => {
  const c = spawnCar(),
    reader = new CollisionVfxReader();
  assert.deepEqual(reader.read([c], true), []);
  c.collisionCount = 1;
  c.lastCollisionStrength = 0.6;
  c.lastCollisionKind = "wall";
  c.lastEnergyLoss = 24;
  const [cue] = reader.read([c], true);
  assert.equal(cue.loss, 24);
  assert.equal(cue.kind, "wall");
  assert.deepEqual(reader.read([c], true), []);
  reader.read([{ ...c, collisionCount: 0 }], true);
  assert.deepEqual(reader.read([c], true), []);
});
