import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "../shared/protocol.ts";
import { aiInput } from "../shared/ai.ts";
import { stepCar } from "../shared/race.ts";
import { getTrack, nearestTrack } from "../shared/track.ts";
import {
  movingObstaclesAt,
  MOVING_OBSTACLE_KART_RADIUS,
} from "../shared/moving-obstacles.ts";

const port = 2595,
  base = `http://127.0.0.1:${port}`;
const track = getTrack("harbor-dual");
const obstacles = (track.movingObstacles ?? [])
  .map((spec) => ({
    spec,
    progress: nearestTrack(spec.x, spec.z, track).t,
  }))
  .sort((a, b) => a.progress - b.progress);
const first = obstacles[0];
if (!first) throw Error("harbor-dual has no moving obstacle to verify");
const passProgress =
  first.progress +
  (first.spec.radius + MOVING_OBSTACLE_KART_RADIUS + 8) / track.length;
const dataDir = mkdtempSync(path.join(tmpdir(), "kart-map-network-"));
const startedAt = new Date().toISOString();
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: String(port), PONS_DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let log = "",
  childError = "",
  snapshot: Snapshot | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let frames = 0,
  eligibleSamples = 0,
  predictionSamples = 0,
  peerComparisons = 0;
let maxClockError = 0,
  maxOverlap = 0,
  minGap = Infinity;
let acceptedMap = false;
const rooms: Room[] = [],
  sequences = [0, 0],
  clientFrames = [0, 0];
const passed: (number | null)[] = [null, null];
const closestFirst = [Infinity, Infinity],
  greatestProgress = [-Infinity, -Infinity];
const failures: string[] = [];
const overlapExamples: unknown[] = [];
const peerStates = new Map<number, { client: number; value: string }>();
const fail = (message: string) => {
  if (!failures.includes(message) && failures.length < 20)
    failures.push(message);
};
child.stdout.on("data", (d) => {
  log += String(d);
});
child.stderr.on("data", (d) => {
  log += String(d);
});
child.on("error", (error) => {
  childError = error.message;
});

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout: number) {
  const start = Date.now();
  while (!check()) {
    if (childError) throw Error(childError);
    if (child.exitCode !== null)
      throw Error(
        `Isolated server exited (${child.exitCode}): ${log.slice(-600)}`,
      );
    if (Date.now() - start > timeout)
      throw Error(`Verification timed out after ${timeout} ms`);
    await delay(25);
  }
}

function receive(s: Snapshot, client: number) {
  clientFrames[client]++;
  const digest = JSON.stringify({
    elapsed: s.elapsed,
    trackId: s.trackId,
    cars: s.cars,
  });
  const peer = peerStates.get(s.serverTick);
  if (peer && peer.client !== client) {
    peerComparisons++;
    if (peer.value !== digest)
      fail(`Clients received different authority at tick ${s.serverTick}`);
    peerStates.delete(s.serverTick);
  } else peerStates.set(s.serverTick, { client, value: digest });
  if (peerStates.size > 120) peerStates.delete(peerStates.keys().next().value!);
  if (client !== 0) return;
  snapshot = s;
  if (s.trackId !== track.id)
    fail(`Server selected ${s.trackId}, expected ${track.id}`);
  else acceptedMap = true;
  if (s.phase !== "racing") return;
  frames++;
  const poses = movingObstaclesAt(track, s.elapsed);
  for (const authority of s.cars) {
    const index = rooms.findIndex((room) => room.sessionId === authority.id);
    if (index < 0) continue;
    greatestProgress[index] = Math.max(
      greatestProgress[index],
      authority.progress,
    );
    const firstPose = poses.find((pose) => pose.id === first.spec.id)!;
    const firstDistance = Math.hypot(
      authority.x - firstPose.x,
      authority.z - firstPose.z,
    );
    closestFirst[index] = Math.min(closestFirst[index], firstDistance);
    if (
      passed[index] === null &&
      authority.progress >= passProgress &&
      closestFirst[index] < 25
    )
      passed[index] = s.elapsed;
    if (
      authority.finished ||
      s.players.find((player) => player.id === authority.id)?.dnf
    )
      continue;
    const clockError = Math.abs(authority.time - s.elapsed);
    maxClockError = Math.max(maxClockError, clockError);
    if (clockError > 1e-8)
      fail(`Car ${index + 1} clock differs from authority by ${clockError} s`);

    if (authority.ghostTime <= 0 && authority.resetTime <= 0) {
      eligibleSamples++;
      for (const pose of poses) {
        const gap =
          Math.hypot(authority.x - pose.x, authority.z - pose.z) -
          pose.radius -
          MOVING_OBSTACLE_KART_RADIUS;
        minGap = Math.min(minGap, gap);
        maxOverlap = Math.max(maxOverlap, -gap);
        if (gap < -1e-5) {
          fail(
            "Authoritative snapshot contains a kart/moving-obstacle overlap",
          );
          if (overlapExamples.length < 8)
            overlapExamples.push({
              tick: s.serverTick,
              clock: s.elapsed,
              slot: authority.slot,
              obstacle: pose.id,
              overlapMetres: -gap,
              kart: {
                x: authority.x,
                z: authority.z,
                progress: authority.progress,
              },
              pose: { x: pose.x, z: pose.z, radius: pose.radius },
            });
        }
      }
    }

    // Evaluate a real prediction tick on two independent clones. The received
    // authoritative object and shared pose clock must remain unchanged.
    if (frames % 4 === 0 && authority.resetTime <= 0) {
      const before = JSON.stringify(authority);
      const predicted = structuredClone(authority),
        replay = structuredClone(authority);
      const command = aiInput(predicted, track, "normal", s.elapsed, s.cars);
      stepCar(predicted, command, 1 / 60, track, s.elapsed);
      stepCar(replay, command, 1 / 60, track, s.elapsed);
      predictionSamples++;
      if (JSON.stringify(authority) !== before)
        fail("Client prediction mutated its authority snapshot");
      if (JSON.stringify(predicted) !== JSON.stringify(replay))
        fail("Prediction replay diverged with identical clock and controls");
      if (Math.abs(predicted.time - (s.elapsed + 1 / 60)) > 1e-8)
        fail("Prediction did not advance from the authoritative common clock");
      if (
        JSON.stringify(movingObstaclesAt(track, s.elapsed)) !==
        JSON.stringify(poses)
      )
        fail("Prediction changed the obstacle pose for an existing clock");
    }
  }
}

try {
  await until(() => log.includes("server ready"), 10000);
  const users = await Promise.all(
    [0, 1].map(async () => {
      const response = await fetch(base + "/api/account", { method: "POST" });
      if (!response.ok)
        throw Error(`Account setup returned HTTP ${response.status}`);
      return (await response.json()) as { token: string };
    }),
  );
  rooms.push(
    await new Client(base).create("kart", {
      token: users[0].token,
      name: "Map Verify 1",
      trackId: track.id,
      mode: "race",
      laps: 1,
    }),
  );
  rooms[0].onMessage("snapshot", (s: Snapshot) => receive(s, 0));
  rooms[0].onMessage("notice", () => {});
  rooms.push(
    await new Client(base).joinById(rooms[0].roomId, {
      token: users[1].token,
      name: "Map Verify 2",
    }),
  );
  rooms[1].onMessage("snapshot", (s: Snapshot) => receive(s, 1));
  rooms[1].onMessage("notice", () => {});
  for (const room of rooms) room.send("ready", true);
  await until(() => snapshot?.phase === "racing", 15000);
  timer = setInterval(() => {
    const s = snapshot;
    if (!s || s.phase !== "racing") return;
    rooms.forEach((room, index) => {
      const authority = s.cars.find((car) => car.id === room.sessionId);
      if (!authority || authority.finished) return;
      const command = aiInput(
        structuredClone(authority),
        track,
        "normal",
        s.elapsed,
        s.cars,
      );
      room.send("input", {
        ...command,
        seq: ++sequences[index],
        raceId: room.roomId,
      });
    });
  }, 1000 / 25);
  await until(
    () =>
      passed.every((time) => time !== null) || (snapshot?.elapsed ?? 0) >= 45,
    55000,
  );
  if (!passed.every((time) => time !== null))
    fail(
      "Both clients did not pass the first moving obstacle within 45 racing seconds",
    );
  if (!acceptedMap) fail("New-map configuration was not acknowledged");
  if (frames < 100 || eligibleSamples < 100)
    fail("Insufficient authoritative racing coverage");
  if (peerComparisons < 50)
    fail("Insufficient matching snapshots between both clients");
  if (predictionSamples < 20)
    fail("Insufficient local prediction replay coverage");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (timer) clearInterval(timer);
  await Promise.allSettled(rooms.map((room) => room.leave()));
  // This is the subprocess created above; never terminate another server.
  child.kill();
}

const report = {
  status: failures.length ? "FAIL" : "PASS",
  startedAt,
  isolatedServer: { port, pid: child.pid, dataDir, windowsHide: true },
  trackId: track.id,
  acceptedMap,
  clients: 2,
  controlFrequencyHz: 25,
  obstacleKartRadiusMetres: MOVING_OBSTACLE_KART_RADIUS,
  firstObstacle: {
    id: first.spec.id,
    progress: first.progress,
    requiredPassProgress: passProgress,
  },
  racingSeconds: snapshot?.elapsed ?? 0,
  racingSnapshots: frames,
  clientSnapshots: clientFrames,
  matchingPeerSnapshots: peerComparisons,
  eligibleKartSnapshots: eligibleSamples,
  predictionReplays: predictionSamples,
  maxClockErrorSeconds: maxClockError,
  maxObstacleOverlapMetres: maxOverlap,
  minimumObstacleGapMetres: Number.isFinite(minGap) ? minGap : null,
  clientsPassedFirstObstacleAtSeconds: passed,
  closestFirstObstacleMetres: closestFirst.map((value) =>
    Number.isFinite(value) ? value : null,
  ),
  greatestProgress: greatestProgress.map((value) =>
    Number.isFinite(value) ? value : null,
  ),
  inputsSent: sequences,
  lastCars: snapshot?.cars.map((car) => ({
    slot: car.slot,
    progress: car.progress,
    time: car.time,
    ack: car.ack,
    collisions: car.collisionCount,
    lastCollisionKind: car.lastCollisionKind,
    ghostTime: car.ghostTime,
    resetTime: car.resetTime,
  })),
  overlapExamples,
  failures,
  ...(failures.length ? { serverLogTail: log.slice(-1500) } : {}),
};
mkdirSync("output/map-expansion-20260908", { recursive: true });
writeFileSync(
  "output/map-expansion-20260908/network.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
