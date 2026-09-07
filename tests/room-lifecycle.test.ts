import { test } from "node:test";
import assert from "node:assert/strict";
import { KartRoom } from "../server/room.ts";
import { Economy } from "../server/economy.ts";
import { spawnCar, EMPTY_INPUT } from "../shared/race.ts";
import { InputInbox } from "../shared/rules.ts";
import { getTrack, trackPoint } from "../shared/track.ts";
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

test("room results use the authoritative arrival timestamp for tied DNF progress", () => {
  const r = fixture(),
    a = r.seats.get("a")!;
  a.car.progress = 0.6;
  a.car.time = 300;
  a.progressAt = 200;
  const z = {
    ...a,
    info: { ...a.info, id: "z", name: "Z" },
    account: "z",
    car: { ...a.car, id: "z" },
    progressAt: 100,
  };
  r.seats.set("z", z);
  (r as any).finish();
  assert.deepEqual(
    r.results.map((x) => [x.id, x.rank]),
    [
      ["z", 0],
      ["a", 0],
    ],
  );
});

test("reversing updates the arrival time of the current legal progress", () => {
  const r = fixture(),
    seat = r.seats.get("a")!,
    p = trackPoint(0.1, getTrack("coast"));
  Object.assign(seat.car, {
    x: p.x,
    z: p.z,
    lastX: p.x,
    lastZ: p.z,
    lastT: p.t,
    progress: p.t,
    heading: p.heading,
    speed: -10,
    vx: -Math.sin(p.heading) * 10,
    vz: -Math.cos(p.heading) * 10,
  });
  r.elapsed = 20;
  seat.progressAt = 5;
  (r as any).tick(1 / 60);
  assert.ok(seat.car.progress < p.t);
  assert.equal(seat.progressAt, r.elapsed);
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
