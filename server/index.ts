import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Economy } from "./economy.ts";
import { Auth } from "./auth.ts";
import {RaceRecords} from "./race-records.ts";
import { KartRoom } from "./room.ts";
import { VERSIONS } from "../shared/rules.ts";
import { configureHttp, serveClient } from './http.ts';
const data =
  process.env.PONS_DATA_DIR ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../data");
mkdirSync(data, { recursive: true });
export const economy = new Economy(path.join(data, "economy.sqlite"));
economy.recover();
const auth = new Auth(path.join(data, "auth.sqlite"));
KartRoom.economy = economy;
KartRoom.auth = auth;
KartRoom.records = new RaceRecords(path.join(data,"races.sqlite"));
const server = new Server({
  transport: new WebSocketTransport({ maxPayload: 8192 }),
  greet: false,
  express: (app) => {
    configureHttp(app);
    app.get("/api/health", (_req, res) =>
      res.json({ ok: true, mode: "simulation", version: "0.3.0", ...VERSIONS }),
    );
    app.get("/api/pool", (_req, res) => res.json(economy.pool()));
    app.post("/api/account", (_req, res) => {
      try {
        const session = auth.issue();
        economy.ensureAccount(session.id);
        res.json({ ...session, account: economy.account(session.id) });
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
      }
    });
    app.get("/api/account", (req, res) => {
      try {
        res.json(
          economy.account(
            auth.resolve(req.headers.authorization?.replace(/^Bearer /, "")),
          ),
        );
      } catch (e) {
        res.status(401).json({ error: (e as Error).message });
      }
    });
    app.post("/api/claim/:matchId", (req, res) => {
      try {
        res.json(
          economy.claim(
            auth.resolve(req.headers.authorization?.replace(/^Bearer /, "")),
            String(req.params.matchId),
          ),
        );
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
      }
    });
    app.post("/api/tax/:eventId", (req, res) => {
      try {
        auth.resolve(req.headers.authorization?.replace(/^Bearer /, ""));
        const eventId = String(req.params.eventId);
        if (!/^[\w-]{1,80}$/.test(eventId)) throw Error("无效模拟事件");
        economy.injectTax(eventId, 500000);
        res.json(economy.pool());
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
      }
    });
    serveClient(app);
  },
});
server.define("kart", KartRoom);
await server.listen(Number(process.env.PORT || 2567), "0.0.0.0");
console.log(
  `PONS simulation server ready: http://localhost:${process.env.PORT || 2567}`,
);
