import { test } from "node:test";
import assert from "node:assert/strict";
import { KartRoom } from "../server/room.ts";
import { VERSIONS } from "../shared/rules.ts";

function fixture(free = true) {
  const room = new KartRoom();
  const handlers = new Map<string, Function>();
  room.broadcast = () => {};
  (room as any).onMessage = (type: string, callback: Function) =>
    handlers.set(type, callback);
  (room as any).setFixedTimestep = () => {};
  (room as any).lock = () => {};
  room.onCreate({ free, trackId: "coast", mode: "race", laps: 1 });
  const add = (id: string, options = {}) =>
    room.onJoin({ sessionId: id } as any, { name: id, ...options }, id);
  const send = (id: string, type: string, value: unknown) =>
    handlers.get(type)!({ sessionId: id }, value);
  const tick = (seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) (room as any).tick(1 / 60);
  };
  return { room, add, send, tick };
}

test("a free friend room allows ten minutes to invite and ready players", () => {
  const { room, add, tick } = fixture();
  add("host");
  tick(31);
  assert.equal(room.phase, "waiting");
  assert.ok(room.snapshot().waitingRemaining! > 560);
  tick(570);
  assert.equal(room.phase, "cancelled");
});

test("ticket room keeps the existing thirty second preparation rule", () => {
  const { room, add, tick } = fixture(false);
  add("host");
  tick(31);
  assert.equal(room.phase, "cancelled");
});

test("a mismatched client cannot enter an otherwise valid room", () => {
  const { room, add } = fixture();
  assert.throws(
    () => add("old", { versions: { ...VERSIONS, trackVersion: "old" } }),
    /更新|版本/,
  );
  assert.equal(room.seats.size, 0);
  add("current", { versions: VERSIONS });
  assert.equal(room.seats.size, 1);
});

test("a drop in the waiting room revokes readiness and cannot start upon reconnect", async () => {
  const { room, add, send } = fixture();
  add("host");
  add("friend");
  send("host", "ready", true);
  (room as any).allowReconnection = async () => {};
  await room.onDrop({ sessionId: "host" } as any);
  send("friend", "ready", true);
  room.onReconnect({ sessionId: "host" } as any);
  assert.equal(room.seats.get("host")!.info.ready, false);
  assert.equal(room.phase, "waiting");
  send("host", "ready", true);
  assert.equal(room.phase, "countdown");
});
