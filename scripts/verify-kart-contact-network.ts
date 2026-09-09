import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "../shared/protocol.ts";
import { kartContact } from "../shared/kart-contact.ts";
import { getTrack, trackPoint } from "../shared/track.ts";

const port = 2594,
  base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: {
    ...process.env,
    PORT: String(port),
    PONS_DATA_DIR: mkdtempSync(path.join(tmpdir(), "kart-contact-network-")),
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let log = "",
  snapshot: Snapshot | undefined,
  timer: ReturnType<typeof setInterval> | undefined;
let frames = 0,
  maxOverlap = 0,
  collisionEvents = 0;
child.stdout.on("data", (d) => (log += String(d)));
child.stderr.on("data", (d) => (log += String(d)));
const rooms: Room[] = [],
  seq = [0, 0, 0, 0];
async function until(check: () => boolean, timeout = 10000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout)
      throw Error("Verification timed out: " + log.slice(-500));
    await new Promise((r) => setTimeout(r, 25));
  }
}
try {
  await until(() => log.includes("server ready"));
  const users = await Promise.all(
    Array.from(
      { length: 4 },
      async () =>
        (await (
          await fetch(base + "/api/account", { method: "POST" })
        ).json()) as { token: string },
    ),
  );
  rooms.push(
    await new Client(base).create("kart", {
      token: users[0].token,
      name: "Contact 1",
      trackId: "coast",
      mode: "race",
      laps: 1,
    }),
  );
  rooms[0].onMessage("snapshot", (s: Snapshot) => {
    snapshot = s;
    if (s.phase !== "racing") return;
    frames++;
    collisionEvents = Math.max(
      collisionEvents,
      s.cars.reduce((n, c) => n + c.collisionCount, 0),
    );
    for (let i = 0; i < s.cars.length; i++)
      for (let j = i + 1; j < s.cars.length; j++) {
        const a = s.cars[i],
          b = s.cars[j];
        if (
          a.finished ||
          b.finished ||
          a.ghostTime > 0 ||
          b.ghostTime > 0 ||
          a.resetTime > 0 ||
          b.resetTime > 0
        )
          continue;
        maxOverlap = Math.max(maxOverlap, kartContact(a, b)?.depth ?? 0);
      }
  });
  rooms[0].onMessage("notice", () => {});
  for (let i = 1; i < 4; i++) {
    const room = await new Client(base).joinById(rooms[0].roomId, {
      token: users[i].token,
      name: `Contact ${i + 1}`,
    });
    rooms.push(room);
    room.onMessage("snapshot", () => {});
    room.onMessage("notice", () => {});
  }
  for (const room of rooms) room.send("ready", true);
  await until(() => snapshot?.phase === "racing", 15000);
  const p = trackPoint(0, getTrack("coast"));
  timer = setInterval(
    () =>
      rooms.forEach((room, i) => {
        const car = snapshot?.cars.find((c) => c.id === room.sessionId);
        if (!car) return;
        const lateral =
          (car.x - p.x) * Math.cos(p.heading) -
          (car.z - p.z) * Math.sin(p.heading);
        const error = Math.atan2(
          Math.sin(car.heading - p.heading),
          Math.cos(car.heading - p.heading),
        );
        // Legal steering commands converge on the same line to provoke actual contacts.
        const steer = Math.max(-1, Math.min(1, -lateral * 0.32 - error * 2));
        room.send("input", {
          throttle: 1,
          steer,
          drift: false,
          boost: false,
          reset: false,
          seq: ++seq[i],
        });
      }),
    1000 / 30,
  );
  await until(() => (snapshot?.elapsed ?? 0) >= 8, 15000);
  assert.ok(frames >= 100, `only ${frames} racing snapshots`);
  assert.ok(
    collisionEvents > 0,
    "the test must contain actual kart collisions",
  );
  assert.equal(
    maxOverlap,
    0,
    "authoritative snapshots must not contain overlapping kart footprints",
  );
  const report = {
    clients: 4,
    racingSnapshots: frames,
    collisionEvents,
    maxOverlapMetres: maxOverlap,
    seconds: snapshot!.elapsed,
    status: "PASS",
  };
  writeFileSync(
    "output/kart-contact-20260908/network.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (timer) clearInterval(timer);
  await Promise.allSettled(rooms.map((room) => room.leave()));
  child.kill();
}
