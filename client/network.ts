import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot, Account, Pool } from "../shared/protocol.ts";
import type { Input } from "../shared/race.ts";
import { acceptSnapshot, VERSIONS } from "../shared/rules.ts";
import { reconnectDeadline } from "./lifecycle.ts";
import { sanitizeKartId, type KartId } from "../shared/karts.ts";
import {
  sanitizeDriverAppearance,
  type DriverAppearance,
} from "../shared/drivers.ts";
import {
  gameEndpoint,
  transportUrl,
  parseRoomCode,
  multiplayerError,
} from "./multiplayer.ts";
type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export class Network {
  token = "";
  readonly endpoint: string;
  readonly devProxy: boolean;
  private readonly storage?: SessionStore;
  private readonly tokenKey: string;
  private initPromise: Promise<void> | null = null;
  private joinEpoch = 0;
  private joining = false;
  private configurationError = "";
  serviceState: "checking" | "online" | "offline" = "checking";
  serviceError = "";
  constructor(
    options: {
      pageUrl?: string;
      serverUrl?: string;
      devProxy?: boolean;
      storage?: SessionStore;
    } = {},
  ) {
    const pageUrl = options.pageUrl ?? location.href;
    const configured =
      options.serverUrl ?? import.meta.env?.VITE_GAME_SERVER_URL ?? "";
    try {
      this.endpoint = gameEndpoint(pageUrl, configured);
    } catch (error) {
      this.endpoint = new URL(pageUrl).origin;
      this.configurationError = (error as Error).message;
      this.serviceState = "offline";
      this.serviceError = this.configurationError;
    }
    this.devProxy =
      options.devProxy ?? (Boolean(import.meta.env?.DEV) && !configured.trim());
    this.tokenKey = "pons-token:" + this.endpoint;
    try {
      this.storage = options.storage ?? sessionStorage;
      this.token =
        this.storage.getItem(this.tokenKey) ||
        (this.endpoint === new URL(pageUrl).origin
          ? this.storage.getItem("pons-token")
          : "") ||
        "";
    } catch {
      /* Private browsing can disable storage; retain an in-memory session. */
    }
  }
  private saveToken() {
    try {
      this.storage?.setItem(this.tokenKey, this.token);
    } catch {
      /* In-memory session still works. */
    }
  }
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
    const r = await fetch(this.endpoint + "/api/" + path, {
      method,
      headers: { Authorization: "Bearer " + this.token },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.headers.get("content-type")?.includes("application/json"))
      throw new ServiceError(
        "赛事服务尚未配置，请联系房主检查服务器地址",
        r.status,
      );
    const data = await r.json();
    if (!r.ok)
      throw new ServiceError(data.error || "服务器暂时不可用", r.status);
    return data;
  }
  init(): Promise<void> {
    return (this.initPromise ??= this.initialize().finally(() => {
      this.initPromise = null;
    }));
  }
  private async initialize() {
    this.serviceState = "checking";
    try {
      if (this.configurationError) throw Error(this.configurationError);
      if (this.token) {
        try {
          this.account = await this.request<Account>("account");
        } catch (e) {
          if (e instanceof ServiceError && e.status === 401) this.token = "";
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
      }
      this.saveToken();
      await this.refresh();
      this.serviceState = "online";
      this.serviceError = "";
    } catch (error) {
      this.serviceState = "offline";
      this.serviceError = multiplayerError(error);
      this.account = null;
      throw Error(this.serviceError);
    }
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
    kartId: KartId = "club",
    driver?: DriverAppearance,
  ) {
    if (this.room || this.joining) throw Error("请先离开当前房间");
    const epoch = ++this.joinEpoch;
    this.joining = true;
    try {
      if (!this.account) await this.init();
      if (epoch !== this.joinEpoch) throw Error("已取消加入房间");
      const client = new Client(this.endpoint, {
        urlBuilder: (url) => transportUrl(url, this.devProxy),
      });
      const options = {
        token: this.token,
        name,
        kartId: sanitizeKartId(kartId),
        versions: VERSIONS,
        ...(driver ? { driver: sanitizeDriverAppearance(driver) } : {}),
      };
      const reservation = roomId
        ? client.joinById(parseRoomCode(roomId), options)
        : client.create("kart", { ...config, ...options });
      let expired = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const joined = await Promise.race([
        reservation.then((room) => {
          if (expired || epoch !== this.joinEpoch) {
            room.reconnection.enabled = false;
            void room.leave();
            throw Error("已取消加入房间");
          }
          return room;
        }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            expired = true;
            reject(Error("连接赛事服务器超时，请稍后重试"));
          }, 20_000);
        }),
      ]).finally(() => clearTimeout(timeout));
      this.room = joined;
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
        currentRoom.connection.close();
        this.onTerminal(finalSnapshot);
        void this.refresh().catch(() => {});
      };
      this.room.onMessage("snapshot", (s: Snapshot) => {
        if (
          this.room !== currentRoom ||
          !acceptSnapshot(currentRoom.roomId, this.lastTick, s)
        )
          return;
        if (
          Object.entries(VERSIONS).some(
            ([key, value]) => s[key as keyof typeof VERSIONS] !== value,
          )
        ) {
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
        if (this.room !== currentRoom) return;
        this.ping = Date.now() - this.pingStart;
      });
      // Registered at join time so late responses after a cancelled request are harmless.
      this.room.onMessage("rematch", (data) => this.rematchResponse?.(data));
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
    } catch (error) {
      throw Error(multiplayerError(error));
    } finally {
      this.joining = false;
    }
  }
  private rematchResponse:
    ((data: { roomId?: string; error?: string }) => void) | null = null;
  async nextRace(name: string, kartId: KartId, driver?: DriverAppearance) {
    const room = this.room;
    if (
      !room ||
      !this.connected ||
      !["finished", "cancelled"].includes(this.snapshot?.phase || "")
    )
      throw Error("连接已结束，请返回大厅创建房间");
    if (this.rematchResponse) throw Error("正在连接下一场比赛");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const roomId = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(Error("连接下一场超时，请重试")), 15_000);
      this.rematchResponse = (data) =>
        data.roomId
          ? resolve(data.roomId)
          : reject(Error(data.error || "无法创建下一场比赛"));
      room.send("rematch");
    }).finally(() => {
      clearTimeout(timer);
      this.rematchResponse = null;
    });
    if (this.room !== room) throw Error("已取消加入房间");
    const transferEpoch = this.joinEpoch + 1;
    await this.leave(false);
    if (this.joinEpoch !== transferEpoch) throw Error("已取消加入房间");
    return this.join(name, roomId, undefined, kartId, driver);
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
    if (this.connected && this.snapshot?.phase === "waiting")
      this.room?.send("ready", value);
  }
  measurePing() {
    if (this.room && this.connected) {
      this.pingStart = Date.now();
      this.room.send("ping");
    }
  }
  async leave(refresh = true) {
    ++this.joinEpoch;
    this.rematchResponse?.({ error: "已取消加入房间" });
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
    if (refresh) await this.refresh().catch(() => {});
  }
}
