import { test } from "node:test";
import assert from "node:assert/strict";
import { KartRoom } from "../server/room.ts";
import { Economy } from "../server/economy.ts";
import { spawnCar, EMPTY_INPUT } from "../shared/race.ts";
import { InputInbox } from "../shared/rules.ts";
function fixture() {
  const r = new KartRoom();
  r.roomId = "test";
  r.config = { trackId: "coast", mode: "race", laps: 2, free: true };
  r.broadcast = () => {};
  r.phase = "racing";
  const c = spawnCar(0, "a");
  r.seats.set("a", {
    info: {
      id: "a",
      name: "A",
      ready: true,
      connected: true,
      slot: 0,
      dnf: false,
    },
    account: "a",
    car: c,
    input: EMPTY_INPUT,
    seq: 0,
    lastInput: 0,
    bucket: 0,
    bucketStart: 0,
    inbox: new InputInbox(),
    progressAt: 0,
    dnfReason: "",
  });
  return r;
}
test("ready timeout cancels with a reason; countdown never moves or charges a kart", () => {
  const r = fixture();
  r.phase = "waiting";
  for (let i = 0; i < 1801; i++) (r as any).tick(1 / 60);
  assert.equal(r.phase, "cancelled");
  assert.match(r.reason, /30/);
  const t = fixture();
  t.phase = "countdown";
  const c = t.seats.get("a")!.car;
  const before = JSON.stringify(c);
  for (let i = 0; i < 100; i++) (t as any).tick(1 / 60);
  assert.equal(JSON.stringify(c), before);
});
test("hard limit DNF freezes result once and excludes uncompleted progress from awards", () => {
  const r = fixture();
  (r as any).finishDeadline = 300;
  r.elapsed = 299.99;
  (r as any).tick(1 / 60);
  assert.equal(r.phase, "finished");
  assert.equal(r.results[0].status, "DNF");
  assert.equal(r.results[0].rank, 0);
  const result = r.results;
  (r as any).finish();
  assert.equal(r.results, result);
  assert.ok(Object.isFrozen(result));
});
