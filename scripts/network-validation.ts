import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "../shared/protocol.ts";
import { aiInput } from "../shared/ai.ts";
import { getTrack } from "../shared/track.ts";
import { stepCar, type Car, type Input } from "../shared/race.ts";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = "http://127.0.0.1:2587";
let log = "";
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: "2587",
    PONS_DATA_DIR: mkdtempSync(path.join(tmpdir(), "pons-validation-")),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));
const report: any[] = [];
let rooms: Room[] = [];
const queued = new Set<ReturnType<typeof setTimeout>>();
const later = (f: () => void, ms: number) => {
  const t = setTimeout(() => {
    queued.delete(t);
    f();
  }, ms);
  queued.add(t);
};
async function until(f: () => boolean, timeout = 10000) {
  const start = Date.now();
  while (!f()) {
    if (Date.now() - start > timeout)
      throw Error("validation timeout " + log.slice(-1000));
    await delay(25);
  }
}
try {
  await until(() => log.includes("server ready"));
  const users = await Promise.all(
    Array.from(
      { length: 8 },
      async () =>
        await (await fetch(base + "/api/account", { method: "POST" })).json(),
    ),
  );
  for (const scenario of [
    { count: 4, rtt: 0, loss: 0 },
    { count: 4, rtt: 80, loss: 0 },
    { count: 4, rtt: 150, loss: 0.02 },
    { count: 8, rtt: 150, loss: 0.02 },
  ]) {
    const snapshots: (Snapshot | undefined)[] = [],
      predicted: (Car | undefined)[] = [],
      pending: { seq: number; input: Input }[][] = Array.from(
        { length: scenario.count },
        () => [],
      ),
      seq = Array(scenario.count).fill(0),
      corrections: number[] = [];
    let bytes = 0,
      sent = 0,
      dropped = 0,
      seed = 100,
      disconnectDone = false,
      reconnectOK = false,
      closed = false;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const attach = (r: Room, i: number) => {
      r.onMessage("notice", () => {});
      r.onMessage("snapshot", (s: Snapshot) => {
        bytes += JSON.stringify(s).length;
        if (random() < scenario.loss) {
          dropped++;
          return;
        }
        later(() => {
          if (closed || s.serverTick <= (snapshots[i]?.serverTick ?? -1))
            return;
          snapshots[i] = s;
          const c = s.cars.find((c) => c.id === r.sessionId);
          if (!c) return;
          pending[i] = pending[i].filter((p) => p.seq > c.ack);
          const fresh = structuredClone(c);
          for (const p of pending[i])
            stepCar(fresh, p.input, 1 / 60, getTrack(s.trackId));
          if (predicted[i])
            corrections.push(
              Math.hypot(predicted[i]!.x - fresh.x, predicted[i]!.z - fresh.z),
            );
          predicted[i] = fresh;
        }, scenario.rtt / 2);
      });
    };
    rooms = [
      await new Client(base).create("kart", {
        token: users[0].token,
        name: "V0",
        trackId: "tide-coast-v1",
        mode: "race",
        laps: 1,
        free: true,
      }),
    ];
    attach(rooms[0], 0);
    for (let i = 1; i < scenario.count; i++) {
      const r = await new Client(base).joinById(rooms[0].roomId, {
        token: users[i].token,
        name: "V" + i,
      });
      rooms.push(r);
      attach(r, i);
    }
    await until(
      () =>
        snapshots.every((s) => s?.players.length === scenario.count) &&
        snapshots.length === scenario.count,
    );
    const roomId = rooms[0].roomId,
      start = Date.now();
    rooms.forEach((r) => r.send("ready", true));
    const timer = setInterval(() => {
      for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i],
          s = snapshots[i],
          c = s?.cars.find((c) => c.id === r.sessionId);
        if (
          !s ||
          s.phase !== "racing" ||
          !c ||
          c.finished ||
          !r.connection.isOpen
        )
          continue;
        const input = aiInput(
          c,
          getTrack(s.trackId),
          "hard",
          s.elapsed,
          s.cars,
        );
        const packet = {
          ...input,
          seq: ++seq[i],
          raceId: roomId,
          clientTick: s.serverTick,
        };
        sent++;
        pending[i].push({ seq: seq[i], input });
        if (pending[i].length > 120) pending[i].shift();
        if (predicted[i])
          stepCar(predicted[i]!, input, 1 / 60, getTrack(s.trackId));
        if (random() < scenario.loss) {
          dropped++;
          continue;
        }
        later(() => {
          if (!closed && r.connection.isOpen) r.send("input", packet);
        }, scenario.rtt / 2);
      }
    }, 1000 / 60);
    try {
      await until(() => snapshots[0]?.phase === "racing");
      if (scenario.count === 8) {
        await until(() => (snapshots[0]?.elapsed ?? 0) > 5);
        const old = rooms[0],
          token = old.reconnectionToken,
          id = old.sessionId,
          prior = snapshots[0]!.elapsed;
        old.reconnection.enabled = false;
        old.connection.close(4010, "five second validation outage");
        disconnectDone = true;
        await delay(5000);
        const r = await new Client(base).reconnect(token);
        rooms[0] = r;
        attach(r, 0);
        await until(
          () =>
            snapshots[0]?.players.find((p) => p.id === id)?.connected ===
              true && (snapshots[0]?.elapsed ?? 0) > prior + 4,
        );
        assert.equal(r.sessionId, id);
        reconnectOK = true;
      }
      await until(
        () =>
          snapshots.length === scenario.count &&
          snapshots.every((s) => s?.phase === "finished"),
        100000,
      );
      const result = snapshots[0]!.results;
      for (const s of snapshots) assert.deepEqual(s!.results, result);
      assert.equal(
        result.filter((r) => r.time !== null).length,
        scenario.count,
        "all independent clients complete a legal lap",
      );
      assert.ok(result.every((r) => r.award === 0));
      assert.ok(snapshots.every((s) => s!.free && s!.maxPlayers === 8));
      const sort = [...corrections].sort((a, b) => a - b),
        wall = (Date.now() - start) / 1000;
      report.push({
        ...scenario,
        roomId,
        wall,
        results: result,
        applicationBytesPerSecond: Math.round(bytes / wall),
        sent,
        dropped,
        correctionP95: sort[Math.floor(sort.length * 0.95)] || 0,
        correctionMax: Math.max(...sort),
        server: snapshots[0]!.diagnostics,
        disconnectDone,
        reconnectOK,
        allResultsAgree: true,
      });
      console.log(
        "PASS",
        scenario,
        wall.toFixed(2),
        result.map((r) => r.time),
      );
    } finally {
      closed = true;
      clearInterval(timer);
      for (const t of queued) clearTimeout(t);
      queued.clear();
      await Promise.allSettled(rooms.map((r) => r.leave()));
      rooms = [];
    }
  }
  // Ten fresh rooms exercise SDK listener and authoritative state cleanup without funds.
  for (let n = 0; n < 10; n++) {
    const r = await new Client(base).create("kart", {
      token: users[0].token,
      name: "Cycle",
      free: true,
    });
    let s: Snapshot | undefined;
    r.onMessage("snapshot", (x) => (s = x));
    await until(() => !!s);
    assert.equal(s!.cars[0].energy, 0);
    assert.equal(s!.cars[0].boostTime, 0);
    assert.equal(s!.cars[0].lap, 0);
    await r.leave();
  }
  const accounts = await Promise.all(
    users.map(
      async (u) =>
        await (
          await fetch(base + "/api/account", {
            headers: { Authorization: "Bearer " + u.token },
          })
        ).json(),
    ),
  );
  assert.ok(accounts.every((a) => a.tickets === 100000 && a.pons === 0));
  writeFileSync(
    "artifacts/network-validation.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        conditions:
          "real local SDK transports; delay/loss applied to application input and snapshot delivery, not OS packets",
        report,
        tenRoomCycles: "passed",
        balancesUnchanged: true,
      },
      null,
      2,
    ),
  );
  console.log("PASS ten room cycles and unchanged free-race balances");
} finally {
  for (const t of queued) clearTimeout(t);
  await Promise.allSettled(rooms.map((r) => r.leave()));
  child.kill();
}
