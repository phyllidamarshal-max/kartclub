import express, { type Application } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRouter, matchMaker } from "@colyseus/core";

export function matchmakingRouter() {
  return createRouter({}, {
    onResponse(response) {
      // Colyseus domain codes 520–526 collide with Cloudflare's proxy errors.
      // Keep the SDK's JSON error payload, but use an ordinary HTTP failure.
      if (response.status >= 520 && response.status <= 526) {
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "no-store");
        return new Response(response.body, { status: 400, headers });
      }
    },
  });
}

export function configureHttp(app: Application) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
  const cors = (origin: string | null) => ({
    "Access-Control-Allow-Origin":
      origin && (!allowed.length || allowed.includes(origin)) ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  });
  matchMaker.controller.getCorsHeaders = (headers) =>
    cors(headers.get("origin"));
  app.disable("x-powered-by");
  app.use("/api", (req, res, next) => {
    const origin = req.get("Origin");
    if (origin && allowed.length && !allowed.includes(origin)) {
      res.status(403).json({ error: "该网页尚未获准连接赛事服务器" });
      return;
    }
    if (origin) res.set(cors(origin));
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

export function serveClient(app: Application) {
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "赛事接口不存在" });
  });
  if (process.env.SERVE_CLIENT !== "1" && !process.env.PONS_CLIENT_DIR) return;
  const directory = path.resolve(
    process.env.PONS_CLIENT_DIR ||
      fileURLToPath(new URL("../dist", import.meta.url)),
  );
  const index = path.join(directory, "index.html");
  if (!existsSync(index))
    throw Error("Client build missing. Run npm run build before npm start.");
  // An explicit root keeps Colyseus from installing its default version page.
  app.get("/", (_req, res) => {
    res.set("Cache-Control", "no-cache").sendFile(index);
  });
  app.use(
    express.static(directory, {
      index: false,
      setHeaders(res, file) {
        res.setHeader(
          "Cache-Control",
          file.includes(path.sep + "assets" + path.sep)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      },
    }),
  );
}
