import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "../shared/protocol.ts";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, timeout = 7000) {
  const start = Date.now();
  while (!f()) {
    if (Date.now() - start > timeout)
      throw Error("expiry validation timed out");
    await delay(25);
  }
}
test(
  "AC20 real SDK disconnect expires after ten seconds and cannot create a second race identity",
  { timeout: 30000 },
  async () => {
    const base = "http://127.0.0.1:2588";
    let log = "";
    const server = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        env: {
          ...process.env,
          PORT: "2588",
          PONS_DATA_DIR: mkdtempSync(path.join(tmpdir(), "pons-expiry-")),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.on("data", (d) => (log += d));
    server.stderr.on("data", (d) => (log += d));
    const rooms: Room[] = [];
    try {
      await until(() => log.includes("server ready"));
      const account = async () =>
        await (await fetch(base + "/api/account", { method: "POST" })).json();
      const [a, b] = await Promise.all([account(), account()]);
      const r1 = await new Client(base).create("kart", {
        token: a.token,
        name: "Drop",
        free: true,
      });
      rooms.push(r1);
      r1.onMessage("snapshot", () => {});
      r1.onMessage("notice", () => {});
      const r2 = await new Client(base).joinById(r1.roomId, {
        token: b.token,
        name: "Observer",
      });
      rooms.push(r2);
      let snap: Snapshot | undefined;
      r2.onMessage("snapshot", (s) => (snap = s));
      r2.onMessage("notice", () => {});
      await until(() => snap?.players.length === 2);
      r1.send("ready", true);
      r2.send("ready", true);
      await until(() => snap?.phase === "racing");
      const token = r1.reconnectionToken,
        id = r1.sessionId,
        start = snap!.elapsed;
      r1.reconnection.enabled = false;
      r1.connection.close(4010, "expiry test");
      await until(
        () => snap?.players.find((p) => p.id === id)?.connected === false,
      );
      await assert.rejects(() =>
        new Client(base).joinById(r1.roomId, {
          token: a.token,
          name: "Duplicate",
        }),
      );
      await delay(8000);
      assert.equal(
        snap!.players.find((p) => p.id === id)!.dnf,
        false,
        "seat remains during original window",
      );
      await assert.rejects(() =>
        new Client(base).joinById(r1.roomId, {
          token: a.token,
          name: "ExtendAttempt",
        }),
      );
      await until(
        () => snap?.players.find((p) => p.id === id)?.dnf === true,
        4500,
      );
      assert.ok(snap!.elapsed > start + 9.5, "clock continues through outage");
      await assert.rejects(() => new Client(base).reconnect(token));
      assert.equal(snap!.players.length, 2);
      assert.equal(new Set(snap!.players.map((p) => p.id)).size, 2);
      assert.equal(snap!.cars.find((c) => c.id === id)!.storedNitro, 0);
      console.log(
        "expired identity rejected at",
        snap!.elapsed - start,
        "race seconds",
      );
    } finally {
      try {
        await Promise.race([
          Promise.allSettled(
            rooms.filter((r) => r.connection.isOpen).map((r) => r.leave()),
          ),
          delay(1000),
        ]);
      } finally {
        server.kill();
      }
    }
  },
);
