import { test } from "node:test";
import assert from "node:assert/strict";
import { Network } from "../client/network.ts";

function setup(
  t: import("node:test").TestContext,
  reply: (url: string, method: string) => Response | Promise<Response>,
) {
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url, options) =>
    reply(String(url), options?.method || "GET")) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previous;
  });
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  return {
    net: new Network({
      pageUrl: "https://club.example",
      serverUrl: "https://race.example",
      storage,
    }),
    values,
  };
}

test("concurrent boot and join initialization creates exactly one identity on the configured server", async (t) => {
  let issued = 0;
  const urls: string[] = [];
  const { net } = setup(t, async (url, method) => {
    urls.push(url);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json(
      method === "POST"
        ? { token: `token-${++issued}`, account: { id: "driver" } }
        : {},
    );
  });
  await Promise.all([net.init(), net.init(), net.init()]);
  assert.equal(issued, 1);
  assert.ok(urls.every((url) => url.startsWith("https://race.example/api/")));
  assert.equal(net.serviceState, "online");
});

test("a static hosting HTML fallback produces a service configuration error", async (t) => {
  const { net } = setup(
    t,
    () =>
      new Response("<html>game</html>", {
        headers: { "content-type": "text/html" },
      }),
  );
  await assert.rejects(() => net.init(), /赛事服务|服务器/);
  assert.equal(net.serviceState, "offline");
  assert.equal(net.account, null);
});

test("only a rejected identity is replaced, and service identities are isolated", async (t) => {
  let issued = 0;
  const { net, values } = setup(t, (_url, method) => {
    if (method === "POST")
      return Response.json({
        token: `new-${++issued}`,
        account: { id: "new" },
      });
    if (net.token === "expired")
      return Response.json({ error: "Session expired" }, { status: 401 });
    return Response.json({});
  });
  net.token = "expired";
  await net.init();
  assert.equal(issued, 1);
  assert.equal(net.token, "new-1");
  assert.equal(values.get("pons-token"), undefined);
  const other = new Network({
    pageUrl: "https://club.example",
    serverUrl: "https://other.example",
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem() {},
      removeItem() {},
    },
  });
  assert.equal(other.token, "");
});

test("leaving during identity setup cancels a pending join before any matchmaking request", async (t) => {
  const urls: string[] = [];
  const { net } = setup(t, async (url, method) => {
    urls.push(url);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json(
      method === "POST" ? { token: "new", account: { id: "new" } } : {},
    );
  });
  const joining = net.join("Cancelled host");
  const rejected = assert.rejects(joining, /取消/);
  await net.leave(false);
  await rejected;
  assert.equal(net.room, null);
  assert.ok(urls.every((url) => url.includes("/api/")));
});

test("a bad configured endpoint keeps construction safe and shows an offline error", async () => {
  const net = new Network({
    pageUrl: "https://club.example",
    serverUrl: "http://race.example",
  });
  await assert.rejects(() => net.init(), /HTTPS/);
  assert.equal(net.serviceState, "offline");
});

test("exiting while a rematch leaves its old room cancels the successor join", async (t) => {
  const { net } = setup(t, () => Response.json({}));
  let releaseLeave!: () => void;
  let observeLeave!: () => void;
  const leaveStarted = new Promise<void>((resolve) => {
    observeLeave = resolve;
  });
  const oldRoom = {
    roomId: "ABCD1234",
    connection: { isOpen: true },
    reconnection: { enabled: true },
    send() {
      (net as any).rematchResponse({ roomId: "1234ABCD" });
    },
    leave() {
      observeLeave();
      return new Promise<void>((resolve) => {
        releaseLeave = resolve;
      });
    },
  };
  net.room = oldRoom as any;
  net.snapshot = { phase: "finished" } as any;
  let joins = 0;
  net.join = async () => {
    joins++;
    return oldRoom as any;
  };
  const rematch = net.nextRace("Driver", "club");
  const cancelled = assert.rejects(rematch, /取消/);
  await leaveStarted;
  await net.leave(false);
  releaseLeave();
  await cancelled;
  assert.equal(joins, 0);
});
