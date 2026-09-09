import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar } from "../shared/race.ts";
import type { Account, Snapshot } from "../shared/protocol.ts";
import { nitroDisplay, rewardDisplay } from "../client/visual-state.ts";
import { VISUAL_CATALOG } from "../client/locales/visual.ts";
import { LANGUAGES, tr } from "../client/i18n.ts";

test("visual copy has six languages and matching interpolation fields", () => {
  const fields = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((item) => item[1]).sort();
  for (const [source, translations] of Object.entries(VISUAL_CATALOG)) {
    for (const locale of LANGUAGES) {
      assert.ok(translations[locale.code].trim(), `${source}: ${locale.code}`);
      assert.deepEqual(fields(translations[locale.code]), fields(source));
      assert.equal(tr(source, {}, locale.code), translations[locale.code]);
    }
  }
  assert.equal(tr("{count} ready", { count: 2 }, "zh"), "2 瓶可用");
});

test("nitro separates charge, collection, full inventory and actual release", () => {
  const car = spawnCar();
  car.energy = 63;
  assert.equal(nitroDisplay(car).state, "charging");
  car.energy = 100;
  assert.equal(nitroDisplay(car).state, "collect");
  car.storedNitro = 2;
  assert.equal(nitroDisplay(car).state, "full");
  car.boostTime = 1.5;
  const before = structuredClone(car);
  assert.deepEqual(nitroDisplay(car), {
    state: "releasing",
    energy: 100,
    capacity: 100,
    bottles: 2,
    bottleCapacity: 2,
    remaining: 1.5,
    releaseRatio: 0.5,
    paused: false,
    interrupted: false,
    usable: false,
  });
  assert.deepEqual(car, before, "display derivation must never mutate a car");
});

test("a paused boost retains its real remaining time; reset and finish suppress release", () => {
  const car = spawnCar();
  Object.assign(car, {
    energy: 40,
    storedNitro: 1,
    boostTime: 2.2,
    energyLockTime: 0.3,
  });
  assert.equal(nitroDisplay(car, true).remaining, 2.2);
  assert.equal(nitroDisplay(car, true).paused, true);
  assert.equal(nitroDisplay(car, true).usable, false);
  assert.equal(nitroDisplay(car).interrupted, true);
  car.resetTime = 1;
  assert.equal(nitroDisplay(car).remaining, 0);
  assert.equal(nitroDisplay(car).usable, false);
  car.resetTime = 0;
  car.finished = true;
  assert.equal(nitroDisplay(car).state, "charging");
  assert.equal(nitroDisplay(car).usable, false);
});

test("partial energy plus one bottle stays chargeable and mini boost is not nitro", () => {
  const car = spawnCar();
  Object.assign(car, { energy: 35, storedNitro: 1, miniTime: 0.3 });
  const display = nitroDisplay(car);
  assert.equal(display.state, "charging");
  assert.equal(display.bottles, 1);
  assert.equal(display.usable, true);
  assert.equal(display.remaining, 0);
});

test("the nitro key becomes available only in the actual queue window during release", () => {
  const car = spawnCar();
  Object.assign(car, { storedNitro: 1, boostTime: 0.16 });
  assert.equal(nitroDisplay(car).usable, false);
  car.boostTime = 0.14;
  assert.equal(nitroDisplay(car).usable, true);
});

const result = {
  raceId: "race-1",
  roomId: "race-1",
  phase: "finished",
  stage: "RESULTS",
  free: false,
  resultDigest: "verified-record",
  reason: "",
  results: [{ id: "driver-1", name: "Driver", time: 40, rank: 1, award: 7000 }],
} as Snapshot;
const account: Account = {
  id: "account-1",
  tickets: 10000,
  pons: 300,
  pending: [],
};

test("result allocation is not proof that a reward was credited", () => {
  const state = rewardDisplay(result, "driver-1", account);
  assert.equal(state.kind, "allocated");
  assert.equal(state.amount, 7000);
  assert.equal(state.audit, "recorded");
  assert.equal(state.balance, 300);
  assert.equal(rewardDisplay(result, "driver-1", null).kind, "allocated");
  assert.equal(rewardDisplay(result, "driver-1", null).balance, null);
});

test("claimable rewards require the matching account entry; credited requires the actual receipt", () => {
  const pending = {
    ...account,
    pending: [{ matchId: "race-1", amount: 7000 }],
  };
  assert.equal(rewardDisplay(result, "driver-1", pending).kind, "claimable");
  const receipt = { id: account.id, matchId: "race-1", amount: 7000 };
  assert.equal(
    rewardDisplay(result, "driver-1", account, receipt).kind,
    "credited",
  );
  assert.equal(
    rewardDisplay(result, "driver-1", account, { ...receipt, matchId: "other" })
      .kind,
    "allocated",
  );
  assert.equal(
    rewardDisplay(result, "driver-1", account, { ...receipt, id: "other" })
      .kind,
    "allocated",
  );
});

test("audit record failure does not erase a settled claim; cancellation and free races never promise payouts", () => {
  const pending = {
    ...account,
    pending: [{ matchId: "race-1", amount: 7000 }],
  };
  const auditFailure = {
    ...result,
    resultDigest: "",
    reason: "审计记录写入失败",
  };
  assert.equal(
    rewardDisplay(auditFailure, "driver-1", pending).kind,
    "claimable",
  );
  assert.equal(
    rewardDisplay(auditFailure, "driver-1", pending).audit,
    "unavailable",
  );
  assert.equal(
    rewardDisplay({ ...result, phase: "cancelled" }, "driver-1", pending).kind,
    "cancelled",
  );
  assert.equal(
    rewardDisplay({ ...result, free: true }, "driver-1", pending).kind,
    "free",
  );
  assert.equal(
    rewardDisplay(
      { ...result, phase: "racing", resultDigest: "" },
      "driver-1",
      pending,
    ).kind,
    "pending",
  );
  assert.equal(
    rewardDisplay({ ...result, results: [] }, "driver-1", account).kind,
    "unavailable",
  );
  assert.equal(
    rewardDisplay(
      { ...result, results: [{ ...result.results[0], award: 0 }] },
      "driver-1",
      account,
    ).kind,
    "none",
  );
});
