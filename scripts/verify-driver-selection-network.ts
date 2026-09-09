import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "../shared/protocol.ts";
import { VERSIONS } from "../shared/rules.ts";

const port = 2597,
  base = `http://127.0.0.1:${port}`;
const data = mkdtempSync(path.join(tmpdir(), "kart-driver-network-"));
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: String(port), PONS_DATA_DIR: data },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += String(d)));
server.stderr.on("data", (d) => (log += String(d)));
const rooms: Room[] = [],
  snapshots = new Map<number, Snapshot>(),
  seen = [0, 0, 0],
  resetSeen = [false, false, false],
  maxAck = [0, 0, 0],
  maxSpeed = [0, 0, 0];
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean) {
  const start = Date.now();
  while (!check()) {
    if (server.exitCode !== null) throw Error(log.slice(-1200));
    if (Date.now() - start > 18000)
      throw Error("Driver network verification timed out: " + log.slice(-700));
    await delay(30);
  }
}
let timer: ReturnType<typeof setInterval> | undefined;
try {
  await until(() => log.includes("server ready"));
  const requested = [
    { outfitId: "neko", colorId: "coral" },
    { outfitId: "rally", colorId: "gold" },
    { outfitId: "invalid", colorId: "url(external)" },
  ];
  for (let i = 0; i < 3; i++) {
    const account = (await fetch(`${base}/api/account`, {
      method: "POST",
    }).then((r) => r.json())) as { token: string };
    const client = new Client(base),
      options = {
        token: account.token,
        name: `Driver check ${i + 1}`,
        kartId: "apex",
        versions: VERSIONS,
        driver: requested[i],
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
    room.onMessage("snapshot", (s: Snapshot) => {
      snapshots.set(i, s);
      seen[i]++;
      const local = s.cars.find((c) => c.id === room.sessionId);
      if (local) {
        resetSeen[i] ||= local.resetTime > 0;
        maxAck[i] = Math.max(maxAck[i], local.ack);
        maxSpeed[i] = Math.max(maxSpeed[i], local.speed);
      }
    });
  }
  await until(
    () =>
      [...snapshots.values()].filter((s) => s.cars.length === 3).length === 3,
  );
  const expected = [
    { outfitId: "neko", colorId: "coral" },
    { outfitId: "rally", colorId: "gold" },
    { outfitId: "club", colorId: "lime" },
  ];
  function check(s: Snapshot) {
    rooms.forEach((r, i) => {
      const c = s.cars.find((c) => c.id === r.sessionId)!;
      assert.equal(c.driverOutfit, expected[i].outfitId);
      assert.equal(c.driverColor, expected[i].colorId);
      assert.equal(c.kartId, "apex");
      assert.ok(c.speed < 100);
    });
  }
  for (const s of snapshots.values()) check(s);
  rooms.forEach((r) => r.send("ready", true));
  await until(() => snapshots.get(0)?.phase === "racing");
  const seq = [0, 0, 0];
  timer = setInterval(
    () =>
      rooms.forEach((r, i) =>
        r.send("input", {
          seq: ++seq[i],
          raceId: r.roomId,
          clientTick: snapshots.get(i)?.serverTick,
          throttle: 1,
          steer: 0,
          drift: false,
          boost: false,
          reset: seq[i] === 35,
          driverOutfit: "street",
          driverColor: "red",
          kartId: "rallye",
          speed: 9999,
        }),
      ),
    33,
  );
  await until(() => (snapshots.get(0)?.elapsed ?? 0) > 3);
  for (const s of snapshots.values()) check(s);
  assert.ok(resetSeen.every(Boolean), "each client actually entered reset");
  assert.ok(
    maxAck.every((ack) => ack > 35),
    "server acknowledged input after reset",
  );
  assert.ok(
    maxSpeed.every((speed) => speed > 1),
    "throttle advanced all cars",
  );
  const report = {
    status: "PASS",
    createdAt: new Date().toISOString(),
    clients: 3,
    requested,
    accepted: expected,
    snapshotsSeen: seen,
    resetSeen,
    maxAck,
    maxSpeed,
    racingSeconds: snapshots.get(0)!.elapsed,
    cosmeticInputMutationRejected: true,
    physicsInputMutationRejected: true,
    resetPreservesAppearance: true,
  };
  mkdirSync("output/driver-wardrobe-20260909", { recursive: true });
  writeFileSync(
    "output/driver-wardrobe-20260909/network.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (timer) clearInterval(timer);
  await Promise.allSettled(rooms.map((r) => r.leave()));
  server.kill();
}
