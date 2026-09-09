import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gameEndpoint,
  transportUrl,
  parseRoomCode,
  invitationUrl,
  multiplayerError,
} from "../client/multiplayer.ts";

test("one configurable origin serves accounts, matchmaking and secure sockets", () => {
  assert.equal(
    gameEndpoint("https://race.example/play", ""),
    "https://race.example",
  );
  assert.equal(
    gameEndpoint("http://localhost:5173", ""),
    "http://localhost:5173",
  );
  assert.equal(
    gameEndpoint("https://club.netlify.app", "wss://race.example/"),
    "https://race.example",
  );
  assert.equal(
    gameEndpoint("https://club.netlify.app", "https://race.example/game/"),
    "https://race.example/game",
  );
  assert.throws(
    () => gameEndpoint("https://club.example", "http://race.example"),
    /HTTPS/,
  );
  for (const bad of [
    "ftp://race.example",
    "https://user:password@race.example",
    "https://race.example?token=x",
  ]) {
    assert.throws(() => gameEndpoint("https://club.example", bad));
  }
});

test("development websocket proxy uses the page port, production connects directly", () => {
  assert.equal(
    transportUrl(
      new URL("ws://localhost:5173/process/ABCDEF12?sessionId=a"),
      true,
    ),
    "ws://localhost:5173/socket/process/ABCDEF12?sessionId=a",
  );
  assert.equal(
    transportUrl(new URL("http://localhost:5173/matchmake/create/kart"), true),
    "http://localhost:5173/matchmake/create/kart",
  );
  assert.equal(
    transportUrl(new URL("wss://race.example/process/ABCDEF12"), false),
    "wss://race.example/process/ABCDEF12",
  );
});

test("friends can paste a code or invite and invitations contain no inherited private query", () => {
  assert.equal(parseRoomCode("  abcd1234 "), "ABCD1234");
  assert.equal(
    parseRoomCode("https://club.example/?room=abcd1234"),
    "ABCD1234",
  );
  assert.equal(
    invitationUrl(
      "https://club.example/?token=secret&autostart=1#debug",
      "ABCD1234",
    ),
    "https://club.example/?room=ABCD1234",
  );
  for (const bad of [
    "",
    "<script>",
    "https://example.com",
    "ZZZZZZZZ",
    "ABCD1234/..",
  ])
    assert.throws(() => parseRoomCode(bad));
});

test("common service and room failures are actionable to players", () => {
  assert.match(multiplayerError(new TypeError("Failed to fetch")), /服务器/);
  assert.match(
    multiplayerError({ code: 4212, message: "room not found" }),
    /房间/,
  );
  assert.match(
    multiplayerError({ code: 4210, message: "room is locked" }),
    /已满|开始/,
  );
  assert.equal(multiplayerError(new Error("自定义提示")), "自定义提示");
});
