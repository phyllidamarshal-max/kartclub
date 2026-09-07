import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "../shared/protocol.ts";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
test(
  "force-killed server recovers paid unfinished race and preserves account identity",
  { timeout: 15000 },
  async () => {
    const data = mkdtempSync(path.join(tmpdir(), "pons-recovery-")),
      port = 2583,
      base = `http://127.0.0.1:${port}`;
    let child: ChildProcess | undefined;
    const rooms: Room[] = [];
    async function start() {
      let output = "";
      child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
        env: { ...process.env, PORT: String(port), PONS_DATA_DIR: data },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout!.on("data", (d) => (output += String(d)));
      child.stderr!.on("data", (d) => (output += String(d)));
      const started = Date.now();
      while (!output.includes("server ready")) {
        if (Date.now() - started > 5000)
          throw Error(output || "Server start timed out");
        await delay(25);
      }
    }
    async function kill() {
      if (child && child.exitCode === null) {
        const stopped = new Promise<void>((resolve) =>
          child!.once("exit", () => resolve()),
        );
        child.kill("SIGKILL");
        await stopped;
      }
    }
    try {
      await start();
      const create = async () =>
        (await (
          await fetch(base + "/api/account", { method: "POST" })
        ).json()) as { token: string; account: { tickets: number } };
      const users = await Promise.all([create(), create()]);
      const r1 = await new Client(base).create("kart", {
        token: users[0].token,
        name: "Recovery A",
      });
      rooms.push(r1);
      let state: Snapshot | undefined;
      r1.onMessage("snapshot", (s: Snapshot) => (state = s));
      const r2 = await new Client(base).joinById(r1.roomId, {
        token: users[1].token,
        name: "Recovery B",
      });
      rooms.push(r2);
      r2.onMessage("snapshot", () => {});
      rooms.forEach((r) => (r.reconnection.enabled = false));
      r1.send("ready", true);
      r2.send("ready", true);
      const readyAt = Date.now();
      while (state?.phase !== "countdown") {
        if (Date.now() - readyAt > 3000) throw Error("Not ready");
        await delay(20);
      }
      const headers = { Authorization: "Bearer " + users[0].token };
      const paid = await (
        await fetch(base + "/api/account", { headers })
      ).json();
      assert.equal(paid.tickets, 99000);
      await kill();
      await start();
      for (const user of users) {
        const restored = await (
          await fetch(base + "/api/account", {
            headers: { Authorization: "Bearer " + user.token },
          })
        ).json();
        assert.equal(restored.tickets, 100000);
        assert.equal(restored.pending.length, 0);
      }
      const pool = await (await fetch(base + "/api/pool")).json();
      assert.equal(pool.reserved, 0);
      assert.equal(pool.ticketRevenue, 0);
      assert.equal(pool.available, pool.received);
    } finally {
      rooms.forEach((r) => (r.reconnection.enabled = false));
      await kill();
    }
  },
);
