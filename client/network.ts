import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot, Account, Pool } from "../shared/protocol.ts";
import type { Input } from "../shared/race.ts";
export class Network {
  token = sessionStorage.getItem("pons-token") || "";
  account: Account | null = null;
  pool: Pool | null = null;
  room: Room | null = null;
  snapshot: Snapshot | null = null;
  seq = 0;
  connected = true;
  ping = 0;
  private pingStart = 0;
  onSnapshot: (s: Snapshot) => void = () => {};
  onNotice: (s: string) => void = () => {};
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
  async join(name: string, roomId?: string) {
    if (!this.account) await this.init();
    const endpoint =
      location.port === "5173"
        ? `${location.protocol}//${location.hostname}:2567`
        : location.origin;
    const client = new Client(endpoint);
    this.room = roomId
      ? await client.joinById(roomId, { token: this.token, name })
      : await client.create("kart", { token: this.token, name });
    this.seq = 0;
    this.room.reconnection.minUptime = 0;
    this.connected = true;
    const currentRoom = this.room;
    this.room.onMessage("snapshot", (s: Snapshot) => {
      if (this.room !== currentRoom) return;
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
      this.onNotice("连接中断，正在尝试重连（30 秒）");
    });
    this.room.onReconnect(() => {
      if (this.room !== currentRoom) {
        void currentRoom.leave();
        return;
      }
      this.connected = true;
      this.onNotice("已重连，比赛状态已恢复");
    });
    this.room.onLeave(() => {
      if (this.room !== currentRoom) return;
      this.connected = false;
      this.onNotice("已离开联机房间");
    });
    this.room.onError((_code, message) =>
      this.onNotice(message || "联机连接异常"),
    );
    return this.room;
  }
  input(input: Input) {
    if (this.room && this.connected)
      this.room.send("input", { ...input, seq: ++this.seq });
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
