import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "../shared/protocol.ts";

const port = 2596;
const base = `http://127.0.0.1:${port}`;
const data = mkdtempSync(path.join(tmpdir(), "kart-collection-network-"));
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: String(port), PONS_DATA_DIR: data },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => {
  log += String(d);
});
server.stderr.on("data", (d) => {
  log += String(d);
});
const rooms: Room[] = [];
const snapshots = new Map<number, Snapshot>();
const snapshotsSeen = [0, 0, 0];
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, ms = 12000) {
  const began = Date.now();
  while (!check()) {
    if (server.exitCode !== null)
      throw Error(`Isolated server exited: ${log.slice(-600)}`);
    if (Date.now() - began > ms) throw Error("Network verification timed out");
    await delay(30);
  }
}
let timer: ReturnType<typeof setInterval> | undefined;
try {
  await until(() => log.includes("server ready"));
  const requested = ["apex", "vesper", "invalid-client-model"];
  for (let i = 0; i < requested.length; i++) {
    const account = (await fetch(`${base}/api/account`, {
      method: "POST",
    }).then((r) => r.json())) as { token: string };
    const client = new Client(base);
    const options = {
      token: account.token,
      name: `Model check ${i + 1}`,
      kartId: requested[i],
    };
    const room =
      i === 0
        ? await client.create("kart", {
            ...options,
            free: true,
            trackId: "city",
            mode: "race",
            laps: 1,
          })
        : await client.joinById(rooms[0].roomId, options);
    rooms.push(room);
    room.onMessage("snapshot", (snapshot: Snapshot) => {
      snapshots.set(i, snapshot);
      snapshotsSeen[i]++;
    });
  }
  await until(
    () =>
      [...snapshots.values()].filter((s) => s.cars.length === 3).length === 3,
  );
  const expected = ["apex", "vesper", "club"];
  const checkModels = (snapshot: Snapshot) =>
    rooms.forEach((room, index) =>
      assert.equal(
        snapshot.cars.find((c) => c.id === room.sessionId)?.kartId,
        expected[index],
      ),
    );
  for (const s of snapshots.values()) checkModels(s);
  rooms.forEach((r) => r.send("ready", true));
  await until(() => snapshots.get(0)?.phase === "racing");
  const seq = [0, 0, 0];
  timer = setInterval(
    () =>
      rooms.forEach((room, i) =>
        room.send("input", {
          seq: ++seq[i],
          raceId: room.roomId,
          clientTick: snapshots.get(i)?.serverTick,
          throttle: 1,
          steer: 0,
          drift: false,
          boost: false,
          reset: seq[i] === 35,
          kartId: "rallye",
          speed: 9999,
        }),
      ),
    33,
  );
  await until(() => (snapshots.get(0)?.elapsed ?? 0) > 3);
  for (const s of snapshots.values()) {
    checkModels(s);
    for (const c of s.cars)
      assert.ok(c.speed < 100, "cosmetic packets cannot set speed");
  }
  const report = {
    status: "PASS",
    createdAt: new Date().toISOString(),
    clients: 3,
    requested,
    accepted: expected,
    snapshotsSeen,
    racingSeconds: snapshots.get(0)!.elapsed,
    modelMutationRejected: true,
    physicsMutationRejected: true,
    resetPreservesModel: true,
  };
  mkdirSync("output/kart-collection-20260908", { recursive: true });
  writeFileSync(
    "output/kart-collection-20260908/network.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (timer) clearInterval(timer);
  await Promise.allSettled(rooms.map((r) => r.leave()));
  server.kill();
}
