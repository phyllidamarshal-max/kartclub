# Public multiplayer implementation plan

**Goal:** Deliver a deployable browser multiplayer game for friends on different networks. No hosting account is available; delivery includes tested code and deployment instructions, not a claimed live URL.

**Architecture:** Keep the existing Colyseus authoritative simulation. Use one configurable HTTP(S) origin for account APIs and matchmaking, and its WS(S) transport for races. The production Node server serves the built client too; Netlify can alternatively use `VITE_GAME_SERVER_URL`. Preserve the current uncommitted art/gameplay work.

**Tech stack:** Node 24+, TypeScript, Vite, Express 5, Colyseus 0.18, SQLite, Docker.

- [x] Connection contract: test same-origin development/prod and split-host HTTPS endpoints, invite parsing, transport errors, concurrent initialization and cancellation; implement focused client helpers and integrate Network.
- [x] Friend rooms: test free-room invitation window, paid timeout preservation, version compatibility, disconnect/readiness, server-owned shared next-room creation; implement server behavior with real SDK integration verification.
- [x] UI: preserve room input; consume `?room=` invitations; copy codes/links with clipboard fallback; show service status and room time remaining; offer a shared next race on results.
- [x] Deployment: serve `dist` from the existing Node process; support allowed browser origins, bounded API requests and JSON failures; add start script, Dockerfile, Render manifest and Netlify build variable. Keep SQLite on a persistent disk and use one server instance.
- [x] Verification: run focused tests first and confirm failures before fixes, then project tests/build, real 8-client/reconnect/rematch tests and production HTTP/WS checks. Inspect the browser UI. Document exact results, deployment steps and the unverified public/multi-device boundary.

## Acceptance

Friends use one HTTPS page URL, create a free 2–8 player room, share an invite, join with distinct sessions, ready, drive from authoritative snapshots, recover a short transport drop, see results, and join the same next room. Invalid/expired/full rooms and unavailable/misconfigured services produce useful messages. API tokens are never embedded in invites. A static-only deployment reports the missing service. Existing paid accounting, single-player modes and local art changes stay compatible.


