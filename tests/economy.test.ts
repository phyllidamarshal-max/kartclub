import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Economy, PRIZE, TICKET, UNIT } from "../server/economy.ts";

const directories: string[] = [];
function database() {
  const directory = mkdtempSync(join(tmpdir(), "pons-economy-"));
  directories.push(directory);
  return join(directory, "economy.sqlite");
}
afterEach(() => {
  while (directories.length)
    rmSync(directories.pop()!, { recursive: true, force: true });
});

function assertConserved(economy: Economy) {
  const pool = economy.pool();
  assert.equal(
    pool.received,
    pool.available + pool.reserved + pool.pending + pool.paid,
  );
}

test("new accounts and the simulated opening fund use integer minor units", () => {
  const economy = new Economy(database());
  assert.equal(UNIT, 100);
  assert.equal(TICKET, 1_000);
  assert.equal(PRIZE, 10_000);
  assert.deepEqual(economy.ensureAccount("alice"), {
    id: "alice",
    tickets: 100_000,
    pons: 0,
    pending: [],
  });
  assert.deepEqual(economy.pool(), {
    received: 1_284_000,
    available: 1_284_000,
    reserved: 0,
    pending: 0,
    paid: 0,
    ticketRevenue: 0,
  });
  assert.deepEqual(economy.ensureAccount("alice"), economy.account("alice"));
  assertConserved(economy);
  economy.close();
});

test("reserve is atomic, debits entrants, and is repeatably idempotent", () => {
  const economy = new Economy(database());
  economy.ensureAccount("alice");
  economy.ensureAccount("bob");
  const receipt = economy.reserve("race-1", ["alice", "bob"]);
  assert.deepEqual(economy.reserve("race-1", ["alice", "bob"]), receipt);
  assert.throws(() => economy.reserve("race-1", ["bob", "alice"]), /conflict/i);
  assert.equal(economy.account("alice").tickets, 99_000);
  assert.equal(economy.account("bob").tickets, 99_000);
  assert.deepEqual(economy.pool(), {
    received: 1_284_000,
    available: 1_274_000,
    reserved: 10_000,
    pending: 0,
    paid: 0,
    ticketRevenue: 2_000,
  });
  assertConserved(economy);
  economy.close();
});

test("failed reservation rolls back both tickets and pool state", () => {
  const economy = new Economy(database());
  economy.ensureAccount("alice");
  economy.ensureAccount("bob");
  assert.throws(
    () => economy.reserve("unknown", ["alice", "nobody"]),
    /account/i,
  );
  assert.equal(economy.account("alice").tickets, 100_000);
  for (let i = 0; i < 128; i++) {
    const a = `a${i}`;
    const b = `b${i}`;
    economy.ensureAccount(a);
    economy.ensureAccount(b);
    economy.reserve(`m${i}`, [a, b]);
  }
  economy.ensureAccount("last-a");
  economy.ensureAccount("last-b");
  assert.throws(
    () => economy.reserve("one-too-many", ["last-a", "last-b"]),
    /pool/i,
  );
  assert.equal(economy.account("last-a").tickets, 100_000);
  assertConserved(economy);
  economy.close();
});

test("insufficient entrant bankroll rolls back every debit and reservation", () => {
  const economy = new Economy(database());
  economy.ensureAccount("alice");
  economy.ensureAccount("bob");
  for (let i = 0; i < 100; i++) economy.reserve(`spent-${i}`, ["alice", "bob"]);
  assert.equal(economy.account("alice").tickets, 0);
  const before = economy.pool();
  assert.throws(
    () => economy.reserve("spent-100", ["alice", "bob"]),
    /tickets/i,
  );
  assert.deepEqual(economy.pool(), before);
  assert.equal(economy.account("bob").tickets, 0);
  economy.close();
});

test("settle rejects forged and duplicate finishers without changing a reservation", () => {
  const economy = new Economy(database());
  for (const id of ["alice", "bob", "cara"]) economy.ensureAccount(id);
  economy.reserve("race", ["alice", "bob", "cara"]);
  assert.throws(() => economy.settle("race", ["alice", "forged"]), /entrant/i);
  assert.throws(
    () => economy.settle("race", ["alice", "alice"]),
    /distinct|duplicate/i,
  );
  assert.equal(economy.pool().reserved, 10_000);
  assert.equal(economy.pool().pending, 0);
  economy.close();
});

test("ordered partial finishers receive the specified split and remainder", () => {
  const economy = new Economy(database());
  for (const id of ["alice", "bob", "cara", "dan"]) economy.ensureAccount(id);
  economy.reserve("race", ["alice", "bob", "cara", "dan"]);
  const receipt = economy.settle("race", ["cara", "alice", "dan"]);
  assert.deepEqual(economy.settle("race", ["cara", "alice", "dan"]), receipt);
  assert.throws(
    () => economy.settle("race", ["alice", "cara", "dan"]),
    /conflict/i,
  );
  assert.deepEqual(economy.account("cara").pending, [
    { matchId: "race", amount: 6_000 },
  ]);
  assert.deepEqual(economy.account("alice").pending, [
    { matchId: "race", amount: 3_000 },
  ]);
  assert.deepEqual(economy.account("dan").pending, [
    { matchId: "race", amount: 1_000 },
  ]);
  assert.equal(economy.account("bob").pending.length, 0);
  assert.deepEqual(economy.pool(), {
    received: 1_284_000,
    available: 1_274_000,
    reserved: 0,
    pending: 10_000,
    paid: 0,
    ticketRevenue: 4_000,
  });
  assertConserved(economy);
  economy.close();
});

test("empty results release the prize but retain ticket revenue", () => {
  const economy = new Economy(database());
  economy.ensureAccount("alice");
  economy.ensureAccount("bob");
  economy.reserve("race", ["alice", "bob"]);
  economy.settle("race", []);
  assert.deepEqual(economy.pool(), {
    received: 1_284_000,
    available: 1_284_000,
    reserved: 0,
    pending: 0,
    paid: 0,
    ticketRevenue: 2_000,
  });
  assertConserved(economy);
  economy.close();
});

test("claim pays once and duplicate claim returns the same receipt", () => {
  const economy = new Economy(database());
  economy.ensureAccount("alice");
  economy.ensureAccount("bob");
  economy.reserve("race", ["alice", "bob"]);
  economy.settle("race", ["bob"]);
  const receipt = economy.claim("bob", "race");
  assert.deepEqual(economy.claim("bob", "race"), receipt);
  assert.deepEqual(economy.account("bob"), {
    id: "bob",
    tickets: 99_000,
    pons: 10_000,
    pending: [],
  });
  assert.throws(() => economy.claim("alice", "race"), /award/i);
  assert.deepEqual(economy.pool(), {
    received: 1_284_000,
    available: 1_274_000,
    reserved: 0,
    pending: 0,
    paid: 10_000,
    ticketRevenue: 2_000,
  });
  assertConserved(economy);
  economy.close();
});

test("cancel and explicit restart recovery refund active races", () => {
  const path = database();
  let economy = new Economy(path);
  economy.ensureAccount("alice");
  economy.ensureAccount("bob");
  economy.reserve("cancelled", ["alice", "bob"]);
  const cancelled = economy.cancel("cancelled");
  assert.deepEqual(economy.cancel("cancelled"), cancelled);
  assert.equal(economy.account("alice").tickets, 100_000);
  economy.reserve("orphaned", ["alice", "bob"]);
  economy.close();
  economy = new Economy(path);
  assert.equal(
    economy.account("alice").tickets,
    99_000,
    "constructor must not recover implicitly",
  );
  economy.recover();
  assert.equal(economy.account("alice").tickets, 100_000);
  assert.equal(economy.pool().reserved, 0);
  assert.equal(economy.pool().ticketRevenue, 0);
  assertConserved(economy);
  economy.close();
});

test("settled awards survive restart and cannot be cancelled", () => {
  const path = database();
  let economy = new Economy(path);
  economy.ensureAccount("alice");
  economy.ensureAccount("bob");
  economy.reserve("race", ["alice", "bob"]);
  economy.settle("race", ["alice"]);
  economy.close();
  economy = new Economy(path);
  economy.recover();
  assert.throws(() => economy.cancel("race"), /settled/i);
  assert.deepEqual(economy.account("alice").pending, [
    { matchId: "race", amount: 10_000 },
  ]);
  assert.equal(economy.claim("alice", "race").amount, 10_000);
  assertConserved(economy);
  economy.close();
});

test("tax injection floors two percent and rejects overflow and idempotency conflicts", () => {
  const economy = new Economy(database());
  const receipt = economy.injectTax("trade-1", 199);
  assert.equal(receipt.amount, 3);
  assert.deepEqual(economy.injectTax("trade-1", 199), receipt);
  assert.throws(() => economy.injectTax("trade-1", 200), /conflict/i);
  assert.equal(
    economy.injectTax("maximum", Number.MAX_SAFE_INTEGER).amount,
    180_143_985_094_819,
  );
  assert.throws(
    () => economy.injectTax("unsafe", Number.MAX_SAFE_INTEGER + 1),
    /safe|overflow/i,
  );
  assert.equal(economy.pool().received, 180_143_986_378_822);
  assertConserved(economy);
  economy.close();
});

test("tax injection rejects a pool total that would cease to be a safe integer", () => {
  const economy = new Economy(database());
  for (let i = 0; i < 49; i++)
    economy.injectTax(`large-${i}`, Number.MAX_SAFE_INTEGER);
  assert.equal(economy.pool().received, 8_827_055_270_930_131);
  assert.throws(
    () => economy.injectTax("large-49", Number.MAX_SAFE_INTEGER),
    /safe|overflow/i,
  );
  assert.equal(economy.pool().received, 8_827_055_270_930_131);
  assertConserved(economy);
  economy.close();
});

test("malformed identifiers, amounts, and unknown matches are rejected", () => {
  const economy = new Economy(database());
  for (const id of ["", " ", "../alice", "a\nline", "x".repeat(129)])
    assert.throws(() => economy.ensureAccount(id), /identifier/i);
  for (const volume of [-1, 1.2, NaN, Infinity])
    assert.throws(() => economy.injectTax("event", volume), /integer|amount/i);
  economy.ensureAccount("alice");
  economy.ensureAccount("bob");
  assert.throws(
    () => economy.reserve("race", ["alice", "alice"]),
    /distinct|duplicate/i,
  );
  assert.throws(() => economy.reserve("race", ["alice"]), /2.*4|players/i);
  assert.throws(() => economy.account("unknown"), /account/i);
  assert.throws(() => economy.settle("unknown", []), /match/i);
  assert.throws(() => economy.cancel("unknown"), /match/i);
  assert.throws(() => economy.claim("alice", "unknown"), /match/i);
  economy.close();
});
