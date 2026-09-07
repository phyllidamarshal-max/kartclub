import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "../shared/protocol.ts";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, timeout = 7000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout)
      throw Error("Timed out waiting for condition");
    await delay(25);
  }
}
test(
  "two actual clients start a paid race, server owns movement, cancellation refunds",
  { timeout: 20000 },
  async () => {
    const port = 2581,
      base = `http://127.0.0.1:${port}`,
      dir = mkdtempSync(path.join(tmpdir(), "pons-network-"));
    let log = "",
      stage = "startup";
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        env: { ...process.env, PORT: String(port), PONS_DATA_DIR: dir },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (d) => (log += String(d)));
    child.stderr.on("data", (d) => (log += String(d)));
    const rooms: Room[] = [];
    try {
      await until(() => log.includes("server ready"));
      const account = async () =>
        (await (
          await fetch(base + "/api/account", { method: "POST" })
        ).json()) as {
          token: string;
          account: { id: string; tickets: number };
        };
      const [a, b] = await Promise.all([account(), account()]);
      const cl = new Client(base);
      await assert.rejects(() =>
        cl.create("kart", { token: "forged", name: "bad" }),
      );
      await assert.rejects(() =>
        cl.create("kart", { token: a.token, trackId: "fake" }),
      );
      await assert.rejects(() =>
        cl.create("kart", {
          token: a.token,
          trackId: "coast",
          mode: "items",
          laps: 99,
        }),
      );
      stage = "create valid players";
      const r1 = await cl.create("kart", {
        token: a.token,
        name: "Alpha",
        trackId: "city",
        mode: "items",
        laps: 3,
      });
      rooms.push(r1);
      let s1: Snapshot | undefined, s2: Snapshot | undefined;
      r1.onMessage("snapshot", (s: Snapshot) => {
        s1 = s;
        stage = "player 1 snapshot " + s.players.length + " " + s.phase;
      });
      r1.onMessage("notice", (s) => (log += "notice: " + s));
      const r2 = await new Client(base).joinById(r1.roomId, {
        token: b.token,
        name: "Beta",
      });
      rooms.push(r2);
      r2.onMessage("snapshot", (s: Snapshot) => {
        s2 = s;
        stage = "player 2 snapshot " + s.players.length + " " + s.phase;
      });
      r2.onMessage("notice", (s) => (log += "notice: " + s));
      await until(() => s1?.players.length === 2 && s2?.players.length === 2);
      assert.equal(s1?.phase, "waiting");
      assert.equal(s1?.trackId, "city");
      assert.equal(s2?.raceMode, "items");
      assert.equal(s2?.laps, 3);
      // All four advertised seats accept distinct accounts; a fifth cannot enter.
      const extras = await Promise.all([account(), account(), account()]);
      const rExtra1 = await new Client(base).joinById(r1.roomId, {
        token: extras[0].token,
        name: "Gamma",
      });
      rooms.push(rExtra1);
      rExtra1.onMessage("snapshot", () => {});
      const rExtra2 = await new Client(base).joinById(r1.roomId, {
        token: extras[1].token,
        name: "Delta",
      });
      rooms.push(rExtra2);
      rExtra2.onMessage("snapshot", () => {});
      await until(() => s1?.players.length === 4);
      assert.equal(new Set(s1!.players.map((p) => p.slot)).size, 4);
      await assert.rejects(() =>
        new Client(base).joinById(r1.roomId, {
          token: extras[2].token,
          name: "Fifth",
        }),
      );
      await Promise.all([rExtra1.leave(), rExtra2.leave()]);
      rooms.splice(2, 2);
      await until(() => s1?.players.length === 2);
      r1.send("ready", true);
      r2.send("ready", true);
      await until(() => s1?.phase === "countdown");
      const paid = await (
        await fetch(base + "/api/account", {
          headers: { Authorization: "Bearer " + a.token },
        })
      ).json();
      assert.equal(paid.tickets, a.account.tickets - 1000);
      r2.leave();
      await until(() => s1?.phase === "cancelled");
      const refunded = await (
        await fetch(base + "/api/account", {
          headers: { Authorization: "Bearer " + a.token },
        })
      ).json();
      assert.equal(refunded.tickets, a.account.tickets);
      await r1.leave();
      rooms.length = 0;
      // Second room makes a real server-owned movement run.
      const r3 = await cl.create("kart", {
        token: a.token,
        name: "Alpha",
        trackId: "city",
        mode: "items",
        laps: 3,
      });
      rooms.push(r3);
      let snap: Snapshot | undefined;
      r3.onMessage("snapshot", (s: Snapshot) => {
        snap = s;
        stage = "second " + s.phase + " " + s.players.length;
      });
      r3.onMessage("notice", (s) => (log += "notice " + s));
      const r4 = await new Client(base).joinById(r3.roomId, {
        token: b.token,
        name: "Beta",
      });
      rooms.push(r4);
      r4.onMessage("snapshot", () => {});
      r4.onMessage("notice", () => {});
      await until(() => snap?.players.length === 2);
      r3.send("ready", true);
      r4.send("ready", true);
      await until(() => snap?.phase === "racing");
      const original = snap!.cars.find((c) => c.id === r3.sessionId)!;
      let seq = 0;
      for (let i = 0; i < 20; i++) {
        r3.send("input", {
          seq: ++seq,
          throttle: 1,
          steer: 0,
          drift: false,
          boost: false,
          reset: false,
          x: 999999,
          lap: 100,
          finished: true,
          held: "missile",
          shield: 999,
          item: true,
        });
        await delay(30);
      }
      await delay(100);
      const moved = snap!.cars.find((c) => c.id === r3.sessionId)!;
      assert.ok(Math.hypot(moved.x - original.x, moved.z - original.z) > 1);
      assert.ok(moved.speed > 5);
      assert.equal(moved.lap, 0);
      assert.equal(moved.finished, false);
      assert.equal(snap!.items!.players[r3.sessionId].held, null);
      assert.equal(snap!.items!.players[r3.sessionId].shield, 0);
      assert.ok(Math.abs(moved.x) < 200);
      // An interrupted transport must retain the same paid seat and recover.
      let reconnected = false;
      r3.onReconnect(() => {
        reconnected = true;
      });
      r3.reconnection.minUptime = 0;
      r3.connection.close(4010, "network integration test");
      await until(() => reconnected, 7000);
      await until(
        () =>
          snap?.players.find((p) => p.id === r3.sessionId)?.connected === true,
      );
      const afterReconnect = await (
        await fetch(base + "/api/account", {
          headers: { Authorization: "Bearer " + a.token },
        })
      ).json();
      assert.equal(afterReconnect.tickets, a.account.tickets - 1000);
      // Voluntary departures after the start do not turn a loss into a refund.
      await Promise.all([r3.leave(), r4.leave()]);
      rooms.length = 0;
      await delay(100);
      const departed = await (
        await fetch(base + "/api/account", {
          headers: { Authorization: "Bearer " + a.token },
        })
      ).json();
      assert.equal(departed.tickets, a.account.tickets - 1000);
      const finalPool = await (await fetch(base + "/api/pool")).json();
      assert.equal(finalPool.reserved, 0);
      assert.equal(finalPool.ticketRevenue, 2000);
    } catch (e) {
      throw Error(String(e) + " at " + stage + "\nServer: " + log);
    } finally {
      await Promise.race([
        Promise.allSettled(rooms.map((r) => r.leave())),
        delay(300),
      ]);
      child.kill();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once("exit", () => resolve());
      });
    }
  },
);
