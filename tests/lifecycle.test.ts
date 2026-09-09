import { test } from "node:test";
import assert from "node:assert/strict";
import { canOpenPause, reconnectDeadline } from "../client/lifecycle.ts";
import * as lifecycle from "../client/lifecycle.ts";
import { spawnCar } from "../shared/race.ts";
import { classify, raceDeadline } from "../shared/rules.ts";

test("practice and tutorial time remain open while timed races use the new route limits", () => {
  assert.equal(typeof lifecycle.soloSessionDeadline, "function");
  const cars = [spawnCar(0, "local")];
  const session = { trackId: "coast", laps: 1, raceMode: "practice" as const };
  assert.equal(lifecycle.soloSessionDeadline(cars, session), Infinity);
  assert.equal(
    lifecycle.soloRaceComplete(
      cars,
      900,
      lifecycle.soloSessionDeadline(cars, session),
      false,
    ),
    false,
  );
  assert.equal(
    lifecycle.soloSessionDeadline(cars, {
      ...session,
      raceMode: "race",
      training: true,
    }),
    Infinity,
  );
  assert.equal(
    lifecycle.soloSessionDeadline(cars, { ...session, raceMode: "time" }),
    90,
  );
  assert.equal(
    lifecycle.soloSessionDeadline(cars, {
      trackId: "mountain-summit",
      laps: 3,
      raceMode: "items",
    }),
    450,
  );
  assert.equal(
    lifecycle.soloSessionDeadline(cars, {
      ...session,
      raceMode: "time",
      limit: 78,
    }),
    78,
  );
});

test("a local first finish keeps the solo race open for later AI finishers", () => {
  assert.equal(typeof lifecycle.soloRaceComplete, "function");
  const local = spawnCar(0, "local"),
    ai = spawnCar(1, "AI");
  local.finished = true;
  local.time = 100;
  const cars = [local, ai],
    deadline = raceDeadline(cars);
  assert.equal(deadline, 120);
  assert.equal(lifecycle.soloRaceComplete(cars, 100, deadline, true), false);
  assert.equal(lifecycle.soloRaceComplete(cars, 104, deadline, true), false);
  ai.finished = true;
  ai.time = 105;
  assert.equal(lifecycle.soloRaceComplete(cars, 105, deadline, true), true);
  assert.deepEqual(
    classify(cars).map((r) => [r.car.id, r.rank, r.car.finished]),
    [
      ["local", 1, true],
      ["AI", 2, true],
    ],
  );
});

test("unfinished solo racers become DNF only at deadline; noncompetitive modes may end locally", () => {
  assert.equal(typeof lifecycle.soloRaceComplete, "function");
  const local = spawnCar(0, "local"),
    ai = spawnCar(1, "AI");
  ai.finished = true;
  ai.time = 295;
  const cars = [local, ai],
    deadline = raceDeadline(cars);
  assert.equal(lifecycle.soloRaceComplete(cars, 299.99, deadline, true), false);
  assert.equal(lifecycle.soloRaceComplete(cars, 300, deadline, true), true);
  assert.equal(classify(cars).find((r) => r.car.id === "local")?.rank, 0);
  local.finished = true;
  ai.finished = false;
  assert.equal(lifecycle.soloRaceComplete(cars, 10, 300, false), true);
});

test("a stale solo result only blocks the solo result screen", () => {
  assert.equal(canOpenPause("solo", true, "result"), false);
  assert.equal(canOpenPause("multi", true, ""), true);
  assert.equal(canOpenPause("solo", false, ""), true);
});

test("repeated drops preserve the first reconnect deadline", () => {
  const first = reconnectDeadline(null, 1_000);
  assert.equal(first, 11_000);
  assert.equal(reconnectDeadline(first, 12_000), first);
  assert.equal(reconnectDeadline(null, 12_000), 22_000);
});
