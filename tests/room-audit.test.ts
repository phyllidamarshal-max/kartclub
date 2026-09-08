import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { KartRoom } from "../server/room.ts";
import { RaceRecords } from "../server/race-records.ts";
import { EMPTY_INPUT } from "../shared/race.ts";
import { VERSIONS } from "../shared/rules.ts";

function fixture(t: TestContext) {
  const records = new RaceRecords(":memory:"),
    previous = KartRoom.records;
  KartRoom.records = records;
  t.after(() => {
    KartRoom.records = previous;
    records.close();
  });
  const room = new KartRoom(),
    handlers = new Map<string, Function>();
  room.broadcast = () => {};
  (room as any).onMessage = (kind: string, handler: Function) =>
    handlers.set(kind, handler);
  (room as any).setFixedTimestep = () => {};
  (room as any).lock = () => {};
  room.onCreate({ free: true, mode: "items", trackId: "coast", laps: 3 });
  for (const id of ["driver", "other"])
    room.onJoin({ sessionId: id } as any, { name: id }, "internal-" + id);
  const send = (id: string, kind: string, value: unknown) =>
    handlers.get(kind)!({ sessionId: id }, value);
  const tick = () => (room as any).tick(1 / 60);
  const events = () =>
    (
      (records as any).db
        .prepare(
          "SELECT race_id, event_id, payload FROM race_events ORDER BY CAST(event_id AS INTEGER)",
        )
        .all() as any[]
    ).map((row) => ({
      raceId: row.race_id,
      eventId: row.event_id,
      ...JSON.parse(row.payload),
    }));
  return { room, send, tick, events };
}

test("start audit preserves the item RNG seed while snapshots conceal it", (t) => {
  const { room, send, events } = fixture(t);
  send("driver", "ready", true);
  send("other", "ready", true);
  assert.equal(room.phase, "countdown");
  const start = events().find((e) => e.type === "start");
  assert.ok(start);
  assert.equal(start.payload.itemSeed, room.items!.seed);
  assert.equal(room.snapshot().items!.seed, 0);
  assert.equal(start.raceId, room.roomId);
  assert.equal(start.rulesVersion, VERSIONS.rulesVersion);
  assert.deepEqual(start.payload.players, [
    "internal-driver",
    "internal-other",
  ]);
});

test("actual reset and resource transitions emit once instead of following timer ticks", (t) => {
  const { room, send, tick, events } = fixture(t);
  send("driver", "ready", true);
  send("other", "ready", true);
  room.phase = "racing";
  const car = room.seats.get("driver")!.car;
  car.energy = 100;
  tick();
  assert.equal(car.storedNitro, 1);
  send("driver", "input", { ...EMPTY_INPUT, seq: 1, boost: true });
  tick();
  tick();
  assert.equal(car.nitroUses, 1);
  send("driver", "input", { ...EMPTY_INPUT, seq: 2, reset: true });
  tick();
  assert.ok(car.resetTime > 1.4);
  for (let i = 0; i < 120; i++) tick();
  car.miniWindow = 0.5;
  room.items!.players.driver.held = "shield";
  send("driver", "input", { ...EMPTY_INPUT, seq: 3, throttle: 1, item: true });
  tick();
  tick();
  assert.equal(car.miniUses, 1);
  assert.ok(car.ghostTime > 0);
  assert.equal(
    room.items!.players.driver.uses,
    0,
    "respawn protection cannot be used for a free item attack",
  );
  assert.equal(events().filter((e) => e.type === "item-use").length, 0);
  send("driver", "input", { ...EMPTY_INPUT, seq: 4 });
  for (let i = 0; i < 180 && car.ghostTime > 0; i++) tick();
  assert.equal(car.ghostTime, 0);
  send("driver", "input", { ...EMPTY_INPUT, seq: 5, item: true });
  tick();
  tick();
  assert.equal(room.items!.players.driver.uses, 1);
  const logged = events();
  for (const type of ["reset-start", "nitro-use", "mini-use", "item-use"]) {
    const matching = logged.filter((e) => e.type === type);
    assert.equal(
      matching.length,
      1,
      `${type} is logged once for its actual transition`,
    );
    assert.equal(matching[0].payload.playerId, "internal-driver");
  }
  assert.deepEqual(
    logged
      .filter((e) => e.type === "inventory-changed")
      .map((e) => [e.payload.resource, e.payload.previous, e.payload.current]),
    [
      ["nitro", 0, 1],
      ["nitro", 1, 0],
      ["item", "shield", null],
    ],
  );
  assert.equal(new Set(logged.map((e) => e.eventId)).size, logged.length);
  assert.ok(
    logged.every(
      (e) =>
        e.raceId === room.roomId && e.rulesVersion === VERSIONS.rulesVersion,
    ),
  );
});

test("invalid-input audit samples per player per second and never stores raw packets", (t) => {
  const { room, send, events } = fixture(t);
  room.phase = "racing";
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  for (let i = 0; i < 20; i++)
    send("driver", "input", {
      ...EMPTY_INPUT,
      seq: 0,
      token: "never-log-this-token",
      rawMarker: "never-log-this-payload",
    });
  send("other", "input", "never-log-this-payload");
  now = 1_999;
  send("driver", "input", { seq: 0 });
  assert.equal(events().filter((e) => e.type === "invalid-input").length, 2);
  now = 2_000;
  send("driver", "input", { ...EMPTY_INPUT, seq: 1, raceId: "foreign" });
  now = 3_000;
  send("driver", "input", { ...EMPTY_INPUT, seq: 1, clientTick: 10_000 });
  now = 4_000;
  send("driver", "input", { ...EMPTY_INPUT, seq: 1, steer: 100 });
  const logged = events().filter((e) => e.type === "invalid-input");
  assert.deepEqual(
    logged.map((e) => [e.payload.playerId, e.payload.reason]),
    [
      ["internal-driver", "invalid-sequence"],
      ["internal-other", "invalid-packet"],
      ["internal-driver", "wrong-race"],
      ["internal-driver", "invalid-client-tick"],
      ["internal-driver", "sanitized-controls"],
    ],
  );
  assert.ok(
    logged.every(
      (e) => Object.keys(e.payload).sort().join(",") === "playerId,reason",
    ),
  );
  assert.ok(!JSON.stringify(logged).includes("never-log-this"));
  assert.equal(
    room.seats.get("driver")!.seq,
    1,
    "logging does not reject previously accepted clamped controls",
  );
});
