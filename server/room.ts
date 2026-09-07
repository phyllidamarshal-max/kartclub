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
interface Seat {
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
  maxClients = 4;
  seats = new Map<string, Seat>();
  phase: Phase = "waiting";
  countdown = 3;
  elapsed = 0;
  results: RaceResult[] = [];
  reason = "";
  private snapshotTicks = 0;
  private finishDeadline = 180;
  onCreate() {
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
      s.seq = packet.seq;
      s.input = sanitizeInput(packet);
      s.lastInput = now;
    });
    this.onMessage("ping", (client) => client.send("pong", Date.now()));
    this.setFixedTimestep(({ dt }) => this.tick(dt), 60);
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
    const slot = [0, 1, 2, 3].find(
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
      info: {
        id: client.sessionId,
        name: name || "逐浪车手",
        ready: false,
        connected: true,
        slot,
        dnf: false,
      },
      account,
      car: spawnCar(slot, client.sessionId),
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
      KartRoom.economy.reserve(
        this.roomId,
        seats.map((s) => s.account),
      );
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
    if (this.phase === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = "racing";
        this.countdown = 0;
      }
    } else if (this.phase === "racing") {
      this.elapsed += dt;
      for (const s of this.seats.values()) {
        if (s.info.dnf || s.car.finished) continue;
        const input =
          Date.now() - s.lastInput < 250 && s.info.connected
            ? s.input
            : EMPTY_INPUT;
        stepCar(s.car, input, dt);
        s.car.ack = s.seq;
        if (s.car.lap >= 1) {
          s.car.finished = true;
          s.car.time = this.elapsed;
          this.finishDeadline = Math.min(
            this.finishDeadline,
            this.elapsed + 35,
          );
        }
      }
      separateCars([...this.seats.values()].map((s) => s.car));
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
    const seats = [...this.seats.values()],
      finishers = seats
        .filter((s) => s.car.finished)
        .sort((a, b) => a.car.time - b.car.time);
    try {
      KartRoom.economy.settle(
        this.roomId,
        finishers.map((s) => s.account),
      );
      const ranked = [
        ...finishers,
        ...seats
          .filter((s) => !s.car.finished)
          .sort((a, b) => b.car.progress - a.car.progress),
      ];
      this.results = ranked.map((s, i) => ({
        id: s.info.id,
        name: s.info.name,
        time: s.car.finished ? s.car.time : null,
        rank: s.car.finished ? i + 1 : 0,
        award:
          KartRoom.economy
            .account(s.account)
            .pending.find((a) => a.matchId === this.roomId)?.amount ?? 0,
      }));
      this.phase = "finished";
      this.publish();
    } catch (e) {
      this.abort("结算异常，门票已退回：" + (e as Error).message);
    }
  }
  private abort(reason: string) {
    if (this.phase === "finished" || this.phase === "cancelled") return;
    if (this.phase === "countdown" || this.phase === "racing")
      KartRoom.economy.cancel(this.roomId);
    this.phase = "cancelled";
    this.reason = reason;
    this.publish();
  }
  async onDrop(client: Client) {
    const s = this.seats.get(client.sessionId);
    if (!s) return;
    s.info.connected = false;
    s.input = { ...EMPTY_INPUT };
    this.publish();
    try {
      await this.allowReconnection(client, 30);
    } catch {
      /* onLeave applies final departure after expiry. */
    }
  }
  onReconnect(client: Client) {
    const s = this.seats.get(client.sessionId);
    if (s) {
      s.info.connected = true;
      s.lastInput = 0;
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
      s.info.dnf = true;
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
    if (this.phase === "countdown" || this.phase === "racing")
      KartRoom.economy.cancel(this.roomId);
  }
  snapshot(): Snapshot {
    return {
      roomId: this.roomId,
      phase: this.phase,
      players: [...this.seats.values()].map((s) => s.info),
      cars: [...this.seats.values()].map((s) => s.car),
      countdown: this.countdown,
      elapsed: this.elapsed,
      laps: 1,
      results: this.results,
      reason: this.reason,
    };
  }
  private publish() {
    this.broadcast("snapshot", this.snapshot());
  }
}
