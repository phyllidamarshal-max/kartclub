import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Network } from "../client/network.ts";
import { VERSIONS } from "../shared/rules.ts";
import { EMPTY_INPUT } from "../shared/race.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 9000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout)
      throw Error("Multiplayer condition timed out");
    await delay(25);
  }
}

test(
  "production service serves client/API and eight real game clients reconnect and share a rematch",
  { timeout: 65000 },
  async () => {
    const base = "http://127.0.0.1:2597";
    const dir = mkdtempSync(path.join(tmpdir(), "kart-public-"));
    writeFileSync(
      path.join(dir, "index.html"),
      "<!doctype html><title>KART PUBLIC TEST</title>",
    );
    const server = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        env: {
          ...process.env,
          PORT: "2597",
          PONS_DATA_DIR: dir,
          PONS_CLIENT_DIR: dir,
          NODE_ENV: "production",
          ALLOWED_ORIGINS: "https://club.example",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let log = "";
    server.stdout.on("data", (data) => {
      log += data;
    });
    server.stderr.on("data", (data) => {
      log += data;
    });
    const clients: Network[] = [];
    try {
      await until(() => log.includes("server ready"));
      assert.match(
        await (await fetch(base + "/?room=ABCD1234")).text(),
        /KART PUBLIC TEST/,
      );
      const health = await (await fetch(base + "/api/health")).json();
      assert.equal(health.trackVersion, VERSIONS.trackVersion);
      assert.equal((await fetch(base + "/missing.js")).status, 404);
      const missingApi = await fetch(base + "/api/missing");
      assert.equal(missingApi.status, 404);
      assert.match(missingApi.headers.get("content-type")!, /json/);
      const preflight = await fetch(base + "/api/account", {
        method: "OPTIONS",
        headers: {
          Origin: "https://club.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization",
        },
      });
      assert.equal(preflight.status, 204);
      assert.equal(
        preflight.headers.get("access-control-allow-origin"),
        "https://club.example",
      );
      assert.equal(
        (
          await fetch(base + "/api/account", {
            method: "POST",
            headers: { Origin: "https://untrusted.example" },
          })
        ).status,
        403,
      );
      const cors = await fetch(base + "/matchmake/joinById/ABCD1234", {
        method: "OPTIONS",
        headers: {
          Origin: "https://club.example",
          "Access-Control-Request-Method": "POST",
        },
      });
      assert.equal(
        cors.headers.get("access-control-allow-origin"),
        "https://club.example",
      );
      for (let i = 0; i < 9; i++) {
        clients.push(
          new Network({
            pageUrl: base,
            serverUrl: base,
            storage: { getItem: () => null, setItem() {}, removeItem() {} },
          }),
        );
      }
      await Promise.all(clients.map((client) => client.init()));
      assert.equal(
        new Set(clients.map((client) => client.account!.id)).size,
        9,
      );
      const config = {
        free: true,
        trackId: "coast",
        mode: "items" as const,
        laps: 1,
      };
      await clients[0].join("Host", undefined, config);
      const firstId = clients[0].room!.roomId;
      await Promise.all(
        clients
          .slice(1, 8)
          .map((client, i) => client.join(`Friend ${i}`, firstId)),
      );
      await until(() =>
        clients
          .slice(0, 8)
          .every((client) => client.snapshot?.players.length === 8),
      );
      await assert.rejects(
        () => clients[8].join("Ninth", firstId),
        /已满|开始/,
      );
      assert.equal(
        new Set(clients[0].snapshot!.players.map((player) => player.slot)).size,
        8,
      );
      clients.slice(0, 8).forEach((client) => client.ready(true));
      await until(() => clients[0].snapshot?.phase === "countdown");
      // A departure before the start cancels; seven remaining friends can opt into one new room.
      await clients[7].leave();
      await until(() => clients[0].snapshot?.phase === "cancelled");
      await Promise.all(
        clients
          .slice(0, 7)
          .map((client, i) => client.nextRace(`Rematch ${i}`, "club")),
      );
      const nextId = clients[0].room!.roomId;
      assert.notEqual(nextId, firstId);
      assert.ok(
        clients.slice(0, 7).every((client) => client.room?.roomId === nextId),
      );
      await until(() =>
        clients
          .slice(0, 7)
          .every((client) => client.snapshot?.players.length === 7),
      );
      assert.ok(clients[0].snapshot!.players.every((player) => !player.ready));
      clients.slice(0, 7).forEach((client) => client.ready(true));
      await until(() => clients[0].snapshot?.phase === "racing");
      const before = clients[0].snapshot!.cars.find(
        (car) => car.id === clients[0].room!.sessionId,
      )!;
      for (let i = 0; i < 24; i++) {
        clients[0].input({ ...EMPTY_INPUT, throttle: 1 });
        await delay(25);
      }
      await until(
        () =>
          clients[0].snapshot!.cars.find(
            (car) => car.id === clients[0].room!.sessionId,
          )!.ack >= 24,
      );
      const moved = clients[0].snapshot!.cars.find(
        (car) => car.id === clients[0].room!.sessionId,
      )!;
      assert.ok(Math.hypot(moved.x - before.x, moved.z - before.z) > 1);
      const identity = clients[0].room!.sessionId;
      clients[0].room!.connection.close(4010, "public regression reconnect");
      await until(() => clients[0].connectionState === "reconnecting");
      await until(() => clients[0].connectionState === "connected");
      assert.equal(clients[0].room!.sessionId, identity);
      await until(
        () =>
          clients[1].snapshot!.players.find((player) => player.id === identity)!
            .connected,
      );
      assert.equal(clients[0].account!.tickets, 100000);
      await Promise.all(clients.map((client) => client.leave(false)));
      await clients[0].join("Paid host", undefined, { ...config, free: false });
      const paidId = clients[0].room!.roomId;
      await Promise.all(
        clients
          .slice(1, 3)
          .map((client, i) => client.join(`Paid friend ${i}`, paidId)),
      );
      await until(() =>
        clients
          .slice(0, 3)
          .every((client) => client.snapshot?.players.length === 3),
      );
      clients.slice(0, 3).forEach((client) => client.ready(true));
      await until(() => clients[0].snapshot?.phase === "countdown");
      await clients[2].leave(false);
      await until(
        () =>
          clients[0].snapshot?.phase === "cancelled" &&
          clients[1].snapshot?.phase === "cancelled",
      );
      await clients[0].nextRace("First rematcher", "club");
      await until(() => clients[0].snapshot?.phase === "cancelled", 35_000);
      await assert.rejects(
        () => clients[1].nextRace("Late rematcher", "club"),
        /下一场已结束/,
      );
      assert.equal(
        clients[1].room?.roomId,
        paidId,
        "an expired successor must not evict the waiting friend",
      );
    } catch (error) {
      throw Error(String(error) + "\n" + log);
    } finally {
      await Promise.allSettled(clients.map((client) => client.leave()));
      server.kill();
      if (server.exitCode === null)
        await new Promise((resolve) => server.once("exit", resolve));
    }
  },
);
