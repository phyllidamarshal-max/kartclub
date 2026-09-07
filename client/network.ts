import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot, Account, Pool } from "../shared/protocol.ts";
import type { Input } from "../shared/race.ts";
import { acceptSnapshot, VERSIONS } from "../shared/rules.ts";
import { reconnectDeadline } from "./lifecycle.ts";
export class Network {
  token = sessionStorage.getItem("pons-token") || "";
  account: Account | null = null;
  pool: Pool | null = null;
  room: Room | null = null;
  snapshot: Snapshot | null = null;
  seq = 0;
  connected = true;
  connectionState: "connected" | "reconnecting" | "ended" = "connected";
  ping = 0;
  private pingStart = 0;
  private lastTick = -1;
  onSnapshot: (s: Snapshot) => void = () => {};
  onNotice: (s: string) => void = () => {};
  onTerminal: (snapshot: Snapshot | null) => void = () => {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDeadlineAt: number | null = null;
  async request<T>(path: string, method = "GET"): Promise<T> {
    const r = await fetch("/api/" + path, {
      method,
      headers: { Authorization: "Bearer " + this.token },
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "服务器暂时不可用");
    return data;
  }
  async init() {
    if (this.token) {
      try {
        this.account = await this.request<Account>("account");
      } catch (e) {
        if ((e as Error).message.includes("身份")) this.token = "";
        else throw e;
      }
    }
    if (!this.token) {
      const data = await this.request<{ token: string; account: Account }>(
        "account",
        "POST",
      );
      this.token = data.token;
      this.account = data.account;
      sessionStorage.setItem("pons-token", this.token);
    }
    await this.refresh();
  }
  async refresh() {
    const [a, p] = await Promise.all([
      this.request<Account>("account"),
      this.request<Pool>("pool"),
    ]);
    this.account = a;
    this.pool = p;
  }
  async join(
    name: string,
    roomId?: string,
    config?: import("../shared/gameplay.ts").MatchConfig,
  ) {
    if (!this.account) await this.init();
    const endpoint =
      location.port === "5173"
        ? `${location.protocol}//${location.hostname}:2567`
        : location.origin;
    const client = new Client(endpoint);
    this.room = roomId
      ? await client.joinById(roomId, { token: this.token, name })
      : await client.create("kart", { token: this.token, name, ...config });
    this.seq = 0;
    this.lastTick = -1;
    this.snapshot = null;
    this.room.reconnection.minUptime = 0;
    this.connected = true;
    this.connectionState = "connected";
    const currentRoom = this.room;
    const clearReconnectTimer = () => {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.reconnectDeadlineAt = null;
    };
    const endConnection = () => {
      if (this.room !== currentRoom) return;
      clearReconnectTimer();
      const finalSnapshot = this.snapshot;
      this.room = null;
      this.snapshot = null;
      this.connected = false;
      this.connectionState = "ended";
      currentRoom.reconnection.enabled = false;
      if (!currentRoom.connection.isOpen) currentRoom.connection.close();
      this.onTerminal(finalSnapshot);
      void this.refresh().catch(() => {});
    };
    this.room.onMessage("snapshot", (s: Snapshot) => {
      if (
        this.room !== currentRoom ||
        !acceptSnapshot(currentRoom.roomId, this.lastTick, s)
      )
        return;
      if (s.rulesVersion !== VERSIONS.rulesVersion) {
        this.onNotice("游戏规则已更新，请刷新页面后重新加入");
        void this.leave();
        return;
      }
      this.lastTick = s.serverTick;
      this.seq = Math.max(
        this.seq,
        s.cars.find((c) => c.id === currentRoom.sessionId)?.ack || 0,
      );
      this.snapshot = s;
      this.onSnapshot(s);
    });
    this.room.onMessage("notice", (s: string) => {
      if (this.room === currentRoom) this.onNotice(s);
    });
    this.room.onMessage("pong", () => {
      this.ping = Date.now() - this.pingStart;
    });
    this.room.onDrop(() => {
      if (this.room !== currentRoom) return;
      this.connected = false;
      this.connectionState = "reconnecting";
      this.onNotice("连接中断，正在尝试重连（10 秒）");
      const now = Date.now();
      this.reconnectDeadlineAt = reconnectDeadline(
        this.reconnectDeadlineAt,
        now,
      );
      if (!this.reconnectTimer)
        this.reconnectTimer = setTimeout(
          endConnection,
          Math.max(0, this.reconnectDeadlineAt - now),
        );
    });
    this.room.onReconnect(() => {
      if (this.room !== currentRoom) {
        void currentRoom.leave();
        return;
      }
      this.connected = true;
      this.connectionState = "connected";
      clearReconnectTimer();
      this.onNotice("已重连，比赛状态已恢复");
    });
    this.room.onLeave(() => {
      endConnection();
    });
    this.room.onError((_code, message) => {
      if (this.room === currentRoom) this.onNotice(message || "联机连接异常");
    });
    return this.room;
  }
  input(input: Input) {
    if (this.room && this.connected)
      this.room.send("input", {
        ...input,
        seq: ++this.seq,
        raceId: this.room.roomId,
        clientTick: this.snapshot?.serverTick,
      });
  }
  ready(value: boolean) {
    this.room?.send("ready", value);
  }
  measurePing() {
    if (this.room && this.connected) {
      this.pingStart = Date.now();
      this.room.send("ping");
    }
  }
  async leave() {
    const r = this.room;
    this.room = null;
    this.snapshot = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectDeadlineAt = null;
    this.connected = false;
    this.connectionState = "ended";
    if (r) {
      r.reconnection.enabled = false;
      if (r.connection.isOpen)
        await Promise.race([
          r.leave(),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      else r.connection.close();
    }
    await this.refresh().catch(() => {});
  }
}
