import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot, Account, Pool } from "../shared/protocol.ts";
import { pilot } from "./pilot.ts";
import { getTrack } from "../shared/track.ts";
import { aiInput } from "../shared/ai.ts";
const trackId = process.env.SMOKE_TRACK || "tide-coast-v1",
  raceMode = process.env.SMOKE_MODE || "race",
  laps = Number(process.env.SMOKE_LAPS || 1);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const port = 2582,
  base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: String(port),
    PONS_DATA_DIR: mkdtempSync(path.join(tmpdir(), "pons-smoke-")),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => (log += String(d)));
child.stderr.on("data", (d) => (log += String(d)));
let timer: ReturnType<typeof setInterval> | null = null;
const rooms: Room[] = [];
try {
  const readyStart = Date.now();
  while (!log.includes("server ready")) {
    if (Date.now() - readyStart > 7000) throw Error(log);
    await pause(40);
  }
  const account = async () =>
    (await (await fetch(base + "/api/account", { method: "POST" })).json()) as {
      token: string;
      account: Account;
    };
  const users = await Promise.all([account(), account()]);
  const r1 = await new Client(base).create("kart", {
    token: users[0].token,
    name: "Smoke Alpha",
    trackId,
    mode: raceMode,
    laps,
  });
  rooms.push(r1);
  const snapshots: (Snapshot | undefined)[] = [];
  r1.onMessage("snapshot", (s: Snapshot) => (snapshots[0] = s));
  r1.onMessage("notice", (s) => console.log(s));
  const r2 = await new Client(base).joinById(r1.roomId, {
    token: users[1].token,
    name: "Smoke Beta",
  });
  rooms.push(r2);
  r2.onMessage("snapshot", (s: Snapshot) => (snapshots[1] = s));
  r2.onMessage("notice", (s) => console.log(s));
  await pause(150);
  rooms.forEach((r) => r.send("ready", true));
  const seq = [0, 0];
  timer = setInterval(
    () =>
      rooms.forEach((r, i) => {
        const s = snapshots[i],
          c = s?.cars.find((c) => c.id === r.sessionId);
        if (c && s?.phase === "racing")
          r.send("input", {
            ...(trackId === "tide-coast-v1"
              ? pilot(c)
              : aiInput(c, getTrack(trackId), "normal", s.elapsed)),
            seq: ++seq[i],
          });
      }),
    1000 / 30,
  );
  const start = Date.now();
  let reported = 0;
  while (snapshots[0]?.phase !== "finished") {
    if (Date.now() - start > laps * 110000)
      throw Error("Full race timed out: " + JSON.stringify(snapshots[0]));
    if (Date.now() - start - reported > 10000) {
      reported = Date.now() - start;
      console.log(
        "Driving",
        snapshots[0]?.cars.map((c) => ({
          progress: c.progress,
          speed: c.speed,
        })),
      );
    }
    await pause(100);
  }
  clearInterval(timer);
  timer = null;
  await pause(100);
  assert.equal(snapshots[0]!.trackId, trackId);
  assert.equal(snapshots[0]!.raceMode, raceMode);
  assert.equal(snapshots[0]!.laps, laps);
  if (raceMode === "items")
    assert.ok(
      Object.values(snapshots[0]!.items!.players).some((p) => p.uses > 0),
    );
  const results = snapshots[0]!.results;
  assert.equal(results.filter((r) => r.rank > 0).length, 2);
  assert.deepEqual(snapshots[1]!.results, results);
  assert.equal(
    results.reduce((n, r) => n + r.award, 0),
    10000,
  );
  for (let i = 0; i < 2; i++) {
    const headers = { Authorization: "Bearer " + users[i].token };
    const url = base + "/api/claim/" + r1.roomId;
    const first = await (await fetch(url, { method: "POST", headers })).json(),
      again = await (await fetch(url, { method: "POST", headers })).json();
    assert.deepEqual(first, again);
    const a = (await (
      await fetch(base + "/api/account", { headers })
    ).json()) as Account;
    assert.equal(a.tickets, 99000);
    assert.equal(
      a.pons,
      results.find((r) => r.id === rooms[i].sessionId)!.award,
    );
    assert.equal(a.pending.length, 0);
  }
  const pool = (await (await fetch(base + "/api/pool")).json()) as Pool;
  assert.equal(
    pool.received,
    pool.available + pool.reserved + pool.pending + pool.paid,
  );
  assert.equal(pool.paid, 10000);
  console.log(
    "PASS: two real clients finished, rankings agree, 70/30 payout, duplicate claims paid once, pool conserved.",
  );
  console.log(
    JSON.stringify(
      { results, elapsedWallSeconds: (Date.now() - start) / 1000, pool },
      null,
      2,
    ),
  );
} finally {
  if (timer) clearInterval(timer);
  await Promise.allSettled(rooms.map((r) => r.leave()));
  child.kill();
}
