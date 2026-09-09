import { Room, matchMaker, type Client } from "@colyseus/core";
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
  raceHardLimit,
} from "../shared/rules.ts";
import type { RaceRecords } from "./race-records.ts";
import { sanitizeKartId } from "../shared/karts.ts";
import { sanitizeDriverAppearance } from '../shared/drivers.ts';
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
  private inputAuditAt = new Map<string, number>();
  private startedAt = "";
  private log(type: string, payload: unknown = {}) {
    try {
      KartRoom.records?.event(this.roomId, String(++this.eventSeq), {
        raceId: this.roomId,
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
  private logInvalidInput(seat: Seat, reason: string, now: number) {
    const last = this.inputAuditAt.get(seat.account) ?? -Infinity;
    if (now - last < 1000) return;
    this.inputAuditAt.set(seat.account, now);
    // Only a fixed reason code and internal identity; never retain the packet.
    this.log("invalid-input", { playerId: seat.account, reason });
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
  private nextRoomId = "";
  private nextRoomPromise: Promise<string> | null = null;
  private get waitingLimit() {
    return this.config.free ? RACE_RULES.friendRoomTimeout : RACE_RULES.readyTimeout;
  }
  onCreate(options: Record<string, unknown> = {}) {
    this.config = Object.freeze(validateMatch(options));
    this.maxClients = this.config.free ? 8 : 4;
    this.finishDeadline = raceHardLimit(this.config.trackId, this.config.laps);
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
      if (!s) return;
      const now = Date.now();
      if (this.phase !== "racing") {
        this.logInvalidInput(s, "not-racing", now);
        return;
      }
      if (s.info.dnf) {
        this.logInvalidInput(s, "player-ineligible", now);
        return;
      }
      if (!packet || typeof packet !== "object") {
        this.logInvalidInput(s, "invalid-packet", now);
        return;
      }
      if (now - s.bucketStart > 1000) {
        s.bucket = 0;
        s.bucketStart = now;
      }
      if (++s.bucket > 75) {
        this.logInvalidInput(s, "rate-limit", now);
        return;
      }
      if (
        !Number.isSafeInteger(packet.seq) ||
        packet.seq <= s.seq ||
        packet.seq > s.seq + 600
      ) {
        this.logInvalidInput(s, "invalid-sequence", now);
        return;
      }
      if (packet.raceId !== undefined && packet.raceId !== this.roomId) {
        this.logInvalidInput(s, "wrong-race", now);
        return;
      }
      if (!s.inbox.push(packet, this.serverTick, performance.now())) {
        this.logInvalidInput(s, "invalid-client-tick", now);
        return;
      }
      const clean = sanitizeInput(packet);
      if (
        (
          ["throttle", "steer", "drift", "boost", "reset", "item"] as const
        ).some((key) => packet[key] !== undefined && packet[key] !== clean[key])
      )
        this.logInvalidInput(s, "sanitized-controls", now);
      s.seq = s.inbox.seq;
      s.lastInput = now;
    });
    this.onMessage("ping", (client) => client.send("pong", Date.now()));
    this.onMessage("rematch", async (client) => {
      if (!this.seats.has(client.sessionId) || !['finished', 'cancelled'].includes(this.phase)) return;
      try {
        // All finishers opt into the same successor; each race keeps a distinct ledger ID.
        this.nextRoomPromise ??= this.prepareNextRoom().finally(() => { this.nextRoomPromise = null; });
        const roomId = await this.nextRoomPromise;
        client.send('rematch', { roomId });
      } catch (error) {
        client.send('rematch', { error: (error as Error).message });
      }
    });
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
    if (options.versions !== undefined && (!options.versions || typeof options.versions !== 'object' ||
      Object.entries(VERSIONS).some(([key, value]) => (options.versions as Record<string, unknown>)[key] !== value)))
      throw Error('游戏版本已更新，请刷新页面后重新加入');
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
      car: spawnCar(slot, client.sessionId, getTrack(this.config.trackId), sanitizeKartId(options.kartId), options.driver === undefined ? undefined : sanitizeDriverAppearance(options.driver)),
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
        itemSeed: this.items?.seed ?? null,
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
  private async prepareNextRoom(): Promise<string> {
    if (this.nextRoomId) {
      const existing = await matchMaker.query({ roomId: this.nextRoomId });
      if (existing.length) {
        const phase = await matchMaker.remoteRoomCall(this.nextRoomId, 'phase');
        if (phase === 'finished' || phase === 'cancelled')
          throw Error('下一场已结束，请返回大厅创建房间');
        if (existing[0].locked) throw Error('下一场已满或已经开始，请返回大厅创建房间');
        return this.nextRoomId;
      }
    }
    const room = await matchMaker.createRoom('kart', { ...this.config });
    this.nextRoomId = room.roomId;
    this.publish();
    return this.nextRoomId;
  }
  private tick(dt: number) {
    this.serverTick++;
    if (this.phase === "waiting") {
      this.waitTime += dt;
      if (this.waitTime >= this.waitingLimit)
        this.abort(this.config.free ? '房间等待超过10分钟，请创建新房间邀请好友' : "准备超过30秒，本场已取消；请创建新房间重试");
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
      const resourcesBefore = [...this.seats.values()].map((seat) => ({
        seat,
        storedNitro: seat.car.storedNitro,
        nitroUses: seat.car.nitroUses,
        miniUses: seat.car.miniUses,
        item: this.items?.players[seat.car.id]?.held ?? null,
        itemUses: this.items?.players[seat.car.id]?.uses ?? 0,
      }));
      for (const s of this.seats.values()) {
        if (s.info.dnf || s.car.finished) continue;
        const input = s.info.connected
          ? s.inbox.take(performance.now())
          : EMPTY_INPUT;
        s.input = input;
        const before = s.car.progress,
          oldCp = s.car.checkpoint,
          oldReset = s.car.resetTime;
        stepCar(s.car, input, dt, getTrack(this.config.trackId), this.elapsed - dt);
        if (oldReset <= 0 && s.car.resetTime > 0)
          this.log("reset-start", {
            playerId: s.account,
            progress: s.car.progress,
            targetProgress: s.car.resetProgress,
          });
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
          true, this.config.trackId, this.config.laps,
        );
      }
      const activeSeats = [...this.seats.values()].filter((s) => !s.info.dnf);
      separateCars(
        activeSeats.map((s) => s.car),
        getTrack(this.config.trackId),
        this.elapsed,
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
      // Discrete transitions only: countdown timers and per-tick energy gains
      // never generate audit rows. Include item changes after stepItems.
      for (const before of resourcesBefore) {
        const s = before.seat,
          car = s.car,
          item = this.items?.players[car.id];
        if (before.storedNitro !== car.storedNitro)
          this.log("inventory-changed", {
            playerId: s.account,
            resource: "nitro",
            previous: before.storedNitro,
            current: car.storedNitro,
          });
        if (before.nitroUses !== car.nitroUses)
          this.log("nitro-use", {
            playerId: s.account,
            count: car.nitroUses,
            storedNitro: car.storedNitro,
          });
        if (before.miniUses !== car.miniUses)
          this.log("mini-use", { playerId: s.account, count: car.miniUses });
        if (before.item !== (item?.held ?? null))
          this.log("inventory-changed", {
            playerId: s.account,
            resource: "item",
            previous: before.item,
            current: item?.held ?? null,
          });
        if (before.itemUses !== (item?.uses ?? 0))
          this.log("item-use", {
            playerId: s.account,
            item: before.item,
            count: item?.uses,
          });
      }
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
      this.abort("比赛结果暂时无法保存，请稍后重试");
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
    if (this.phase === 'waiting') s.info.ready = false;
    s.input = { ...EMPTY_INPUT };
    s.inbox.clear();
    if (this.phase === "countdown")
      this.abort("起跑前连接中断，本场已取消");
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
      this.abort("起跑前有车手离开，本场已取消");
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
      waitingRemaining: Math.max(0, this.waitingLimit - this.waitTime),
      nextRoomId: this.nextRoomId,
    };
  }
  private publish() {
    this.broadcast("snapshot", this.snapshot());
  }
}
