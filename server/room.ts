import { Room, type Client } from "@colyseus/core";
import {
  spawnCar,
  stepCar,
  sanitizeInput,
  EMPTY_INPUT,
  separateCars,
  type Car,
  type Input,
} from "../shared/race.ts";
import type {
  Snapshot,
  PlayerInfo,
  RaceResult,
  Phase,
} from "../shared/protocol.ts";
import type { Economy } from "./economy.ts";
import type { Auth } from "./auth.ts";
import { randomBytes } from "node:crypto";
import { getTrack } from "../shared/track.ts";
import { validateMatch, type MatchConfig } from "../shared/gameplay.ts";
import { createItems, stepItems, type ItemWorld } from "../shared/items.ts";
import {
  VERSIONS,
  RACE_RULES,
  classify,
  InputInbox,
  raceDeadline,
} from "../shared/rules.ts";
import type { RaceRecords } from "./race-records.ts";
interface Seat {
  inbox: InputInbox;
  progressAt: number;
  dnfReason: string;
  info: PlayerInfo;
  account: string;
  car: Car;
  input: Input;
  seq: number;
  lastInput: number;
  bucket: number;
  bucketStart: number;
}
export class KartRoom extends Room {
  static economy: Economy;
  static auth: Auth;
  static records: RaceRecords;
  serverTick = 0;
  waitTime = 0;
  firstFinish = false;
  resultDigest = "";
  private stepSamples: number[] = [];
  private stepP95 = 0;
  private stepP99 = 0;
  private eventSeq = 0;
  private startedAt = "";
  private log(type: string, payload: unknown = {}) {
    try {
      KartRoom.records?.event(this.roomId, String(++this.eventSeq), {
        eventId: this.eventSeq,
        serverTick: this.serverTick,
        rulesVersion: VERSIONS.rulesVersion,
        type,
        payload,
      });
    } catch {
      this.reason = "审计日志写入失败，请保留房间码联系维护";
    }
  }
  maxClients = 4;
  seats = new Map<string, Seat>();
  phase: Phase = "waiting";
  countdown = 3;
  elapsed = 0;
  results: RaceResult[] = [];
  reason = "";
  private snapshotTicks = 0;
  private finishDeadline = 180;
  config: MatchConfig = validateMatch();
  items: ItemWorld | null = null;
  onCreate(options: Record<string, unknown> = {}) {
    this.config = Object.freeze(validateMatch(options));
    this.maxClients = this.config.free ? 8 : 4;
    this.finishDeadline = RACE_RULES.hardLimit;
    this.roomId = randomBytes(4).toString("hex").toUpperCase();
    this.maxMessagesPerSecond = 90;
    this.onMessage("ready", (client, value) => {
      const s = this.seats.get(client.sessionId);
      if (!s || this.phase !== "waiting") return;
      s.info.ready = value === true;
      this.tryStart();
      this.publish();
    });
    this.onMessage("input", (client, packet) => {
      const s = this.seats.get(client.sessionId);
      if (
        !s ||
        this.phase !== "racing" ||
        s.info.dnf ||
        !packet ||
        typeof packet !== "object"
      )
        return;
      const now = Date.now();
      if (now - s.bucketStart > 1000) {
        s.bucket = 0;
        s.bucketStart = now;
      }
      if (++s.bucket > 75) return;
      if (
        !Number.isSafeInteger(packet.seq) ||
        packet.seq <= s.seq ||
        packet.seq > s.seq + 600
      )
        return;
      if (packet.raceId !== undefined && packet.raceId !== this.roomId) return;
      if (!s.inbox.push(packet, this.serverTick, performance.now())) return;
      s.seq = s.inbox.seq;
      s.lastInput = now;
    });
    this.onMessage("ping", (client) => client.send("pong", Date.now()));
    this.setFixedTimestep(({ dt }) => {
      const start = performance.now();
      this.tick(dt);
      this.stepSamples.push(performance.now() - start);
      if (this.stepSamples.length > 600) this.stepSamples.shift();
      if (this.serverTick % 60 === 0) {
        const sorted = [...this.stepSamples].sort((a, b) => a - b);
        this.stepP95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        this.stepP99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
      }
    }, 60);
    this.patchRate = null;
  }
  onAuth(_client: Client, options: Record<string, unknown>) {
    return KartRoom.auth.resolve(options.token);
  }
  onJoin(client: Client, options: Record<string, unknown>, account: string) {
    if (
      this.phase !== "waiting" ||
      [...this.seats.values()].some((s) => s.account === account)
    )
      throw Error("该账户已在房间中，或比赛已开始");
    const slot = Array.from({ length: this.maxClients }, (_, i) => i).find(
      (n) => ![...this.seats.values()].some((s) => s.info.slot === n),
    )!;
    const name =
      typeof options.name === "string"
        ? options.name
            .replace(/[<>\x00-\x1f]/g, "")
            .slice(0, 16)
            .trim()
        : "车手";
    this.seats.set(client.sessionId, {
      inbox: new InputInbox(),
      progressAt: 0,
      dnfReason: "",
      info: {
        id: client.sessionId,
        name: name || "逐浪车手",
        ready: false,
        connected: true,
        slot,
        dnf: false,
      },
      account,
      car: spawnCar(slot, client.sessionId, getTrack(this.config.trackId)),
      input: { ...EMPTY_INPUT },
      seq: 0,
      lastInput: 0,
      bucket: 0,
      bucketStart: 0,
    });
    this.publish();
  }
  private tryStart() {
    const seats = [...this.seats.values()];
    if (
      seats.length < 2 ||
      !seats.every((s) => s.info.ready && s.info.connected)
    )
      return;
    try {
      if (!this.config.free)
        KartRoom.economy.reserve(
          this.roomId,
          seats.map((s) => s.account),
        );
      if (this.config.mode === "items")
        this.items = createItems(
          seats.map((s) => s.info.id),
          getTrack(this.config.trackId),
          randomBytes(4).readUInt32LE(),
        );
      this.startedAt = new Date().toISOString();
      this.log("start", {
        config: this.config,
        ...VERSIONS,
        players: seats.map((s) => s.account),
      });
      this.phase = "countdown";
      this.lock();
      this.countdown = 3;
    } catch (e) {
      this.reason = (e as Error).message;
      for (const s of seats) s.info.ready = false;
      this.broadcast("notice", this.reason);
    }
  }
  private tick(dt: number) {
    this.serverTick++;
    if (this.phase === "waiting") {
      this.waitTime += dt;
      if (this.waitTime >= RACE_RULES.readyTimeout)
        this.abort("准备超过30秒，本场已取消；请创建新房间重试");
    }
    if (this.phase === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = "racing";
        this.countdown = 0;
      }
    } else if (this.phase === "racing") {
      dt = Math.min(dt, Math.max(0, this.finishDeadline - this.elapsed));
      this.elapsed += dt;
      for (const s of this.seats.values()) {
        if (s.info.dnf || s.car.finished) continue;
        const input = s.info.connected
          ? s.inbox.take(performance.now())
          : EMPTY_INPUT;
        s.input = input;
        const before = s.car.progress,
          oldCp = s.car.checkpoint;
        stepCar(s.car, input, dt, getTrack(this.config.trackId));
        if (!s.info.connected && s.car.speed < 2)
          s.car.ghostTime = Math.max(s.car.ghostTime, 0.1);
        // Timestamp arrival at the current position, including a reverse/reset
        // arrival; stopping retains that timestamp for a tied DNF comparison.
        if (s.car.progress !== before) s.progressAt = this.elapsed;
        if (s.car.checkpoint !== oldCp)
          this.log("checkpoint", {
            playerId: s.account,
            checkpoint: s.car.checkpoint,
          });
        s.car.ack = s.seq;
        if (s.car.lap >= this.config.laps) {
          s.car.finished = true;
          s.car.time = s.car.lastLapTime || this.elapsed;
          stepCar(s.car, EMPTY_INPUT, 0, getTrack(this.config.trackId));
          this.log("finish", { playerId: s.account, time: s.car.time });
        }
      }
      if (
        !this.firstFinish &&
        [...this.seats.values()].some((s) => s.car.finished)
      ) {
        this.firstFinish = true;
        this.finishDeadline = raceDeadline(
          [...this.seats.values()].map((s) => s.car),
        );
      }
      const activeSeats = [...this.seats.values()].filter((s) => !s.info.dnf);
      separateCars(
        activeSeats.map((s) => s.car),
        getTrack(this.config.trackId),
      );
      if (this.items)
        stepItems(
          this.items,
          activeSeats.map((s) => s.car),
          Object.fromEntries(
            activeSeats.map((s) => [
              s.info.id,
              s.info.connected ? s.input : EMPTY_INPUT,
            ]),
          ),
          dt,
          getTrack(this.config.trackId),
        );
      if (
        this.elapsed >= this.finishDeadline ||
        [...this.seats.values()].every((s) => s.car.finished || s.info.dnf)
      )
        this.finish();
    }
    if (++this.snapshotTicks % 3 === 0) this.publish();
  }
  private finish() {
    if (this.phase !== "racing") return;
    const seats = [...this.seats.values()];
    const ranked = classify(
      seats.map((s) => s.car),
      Object.fromEntries(seats.map((s) => [s.car.id, s.progressAt])),
    );
    const finishers = ranked.filter((r) => r.car.finished);
    try {
      if (!this.config.free)
        KartRoom.economy.settle(
          this.roomId,
          finishers.map(
            (r) => seats.find((s) => s.car.id === r.car.id)!.account,
          ),
          finishers.map((r) => r.rank),
        );
      this.results = ranked.map((r) => {
        const s = seats.find((s) => s.car.id === r.car.id)!;
        if (!r.car.finished) {
          s.info.dnf = true;
          s.dnfReason ||=
            this.elapsed >= this.finishDeadline ? "截止时间内未完赛" : "已退出";
        }
        return {
          id: s.info.id,
          name: s.info.name,
          time: r.car.finished ? r.car.time : null,
          rank: r.rank,
          status: r.car.finished ? ("FINISHED" as const) : ("DNF" as const),
          reason: s.dnfReason,
          award: this.config.free
            ? 0
            : (KartRoom.economy
                .account(s.account)
                .pending.find((a) => a.matchId === this.roomId)?.amount ?? 0),
        };
      });
      try {
        this.resultDigest =
          KartRoom.records?.freeze(this.roomId, {
            raceId: this.roomId,
            ...VERSIONS,
            config: this.config,
            startedAt: this.startedAt,
            endedAt: new Date().toISOString(),
            results: this.results,
          }) || "";
      } catch {
        this.reason = "比赛已结算，审计记录写入失败；请保留房间码联系维护";
      }
      this.log("result-frozen", { digest: this.resultDigest });
      for (const r of this.results) Object.freeze(r);
      Object.freeze(this.results);
      this.phase = "finished";
      this.publish();
    } catch (e) {
      this.abort("结算异常，门票已退回：" + (e as Error).message);
    }
  }
  private abort(reason: string) {
    if (this.phase === "finished" || this.phase === "cancelled") return;
    if (
      !this.config.free &&
      (this.phase === "countdown" || this.phase === "racing")
    )
      KartRoom.economy.cancel(this.roomId);
    this.phase = "cancelled";
    this.reason = reason;
    this.log("cancelled", { reason });
    this.publish();
  }
  async onDrop(client: Client) {
    const s = this.seats.get(client.sessionId);
    if (!s) return;
    s.info.connected = false;
    s.input = { ...EMPTY_INPUT };
    s.inbox.clear();
    if (this.phase === "countdown")
      this.abort("起跑前连接中断，本场已取消；模拟门票已退回");
    this.publish();
    try {
      await this.allowReconnection(client, RACE_RULES.reconnectSeconds);
    } catch {
      /* onLeave applies final departure after expiry. */
    }
  }
  onReconnect(client: Client) {
    const s = this.seats.get(client.sessionId);
    if (s) {
      s.info.connected = true;
      s.lastInput = 0;
      s.inbox.clear();
      this.publish();
    }
  }
  onLeave(client: Client) {
    const s = this.seats.get(client.sessionId);
    if (!s) return;
    if (this.phase === "countdown") {
      this.abort("起跑前有车手离开，本场已取消并退票");
    }
    if (this.phase === "waiting") {
      this.seats.delete(client.sessionId);
      for (const seat of this.seats.values()) seat.info.ready = false;
    } else {
      s.info.connected = false;
      if (!s.car.finished) s.info.dnf = true;
      s.dnfReason = "已退出或重连超时";
      s.input = { ...EMPTY_INPUT };
    }
    if (
      this.phase === "racing" &&
      [...this.seats.values()].every(
        (seat) => seat.info.dnf || seat.car.finished,
      )
    )
      this.finish();
    this.publish();
  }
  onDispose() {
    if (
      !this.config.free &&
      (this.phase === "countdown" || this.phase === "racing")
    )
      KartRoom.economy.cancel(this.roomId);
  }
  snapshot(): Snapshot {
    return {
      ...VERSIONS,
      serverTick: this.serverTick,
      raceId: this.roomId,
      free: !!this.config.free,
      maxPlayers: this.maxClients,
      deadline: this.finishDeadline,
      resultDigest: this.resultDigest,
      diagnostics: { stepP95: this.stepP95, stepP99: this.stepP99 },
      stage:
        this.phase === "waiting"
          ? "LOBBY"
          : this.phase === "countdown"
            ? "COUNTDOWN"
            : this.phase === "racing"
              ? this.firstFinish
                ? "FINISH_WINDOW"
                : "RACING"
              : this.phase === "finished"
                ? "RESULTS"
                : "CANCELLED",
      roomId: this.roomId,
      phase: this.phase,
      players: [...this.seats.values()].map((s) => s.info),
      cars: [...this.seats.values()].map((s) => s.car),
      countdown: this.countdown,
      elapsed: this.elapsed,
      laps: this.config.laps,
      trackId: this.config.trackId,
      raceMode: this.config.mode,
      items: this.items ? { ...this.items, seed: 0 } : null,
      results: this.results,
      reason: this.reason,
    };
  }
  private publish() {
    this.broadcast("snapshot", this.snapshot());
  }
}
