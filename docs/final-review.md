# Final correctness review

Reviewed the implementation plan, verification record, whole-source diff and relevant current sources on 2026-09-07. This is a read-only implementation review; only this report was written. The existing 25-test run and real two-client settlement smoke were accepted as recorded and were not repeated. One small new legal-input simulation was run to investigate the progress concern.

## Findings

### P1 — Keep progress anchored to actual ordered checkpoint crossings

Location: `shared/race.ts:87` (also initialization at line 58 and reset at lines 98–106).

`advanceProgress` updates `lastT` while clamping negative accumulated progress to zero. Backing across the start therefore loses the negative distance but retains the new physical origin. Forward travel then awards progress from that origin rather than from the circuit start. The checkpoint counter uses this shifted progress, while reset places the car at the absolute track checkpoint. This awards checkpoints before they have actually been crossed and can teleport the car forward. The same error awards the second starting row a premature finish, affecting authoritative multiplayer classification and payouts as well as solo challenges.

Measured reproduction using only `stepCar` and legal inputs: reverse throttle for 180 fixed steps (3 seconds) from slot 0, then use the existing normal pilot until checkpoint 1. The checkpoint was awarded at physical track t=0.047222 instead of 1/12=0.083333; pressing reset moved the car forward 28.44 metres. Separately, a normal slot-2 lap completed at t=0.9930556, approximately 5.49 metres before the finish, whereas slot 0 completed at t=0.

Suggested fix: maintain signed, correctly initialized unwrapped track position separately from display progress and validate forward crossings of the expected absolute checkpoint/finish. Initialize rear-row cars from their actual track position, preserving their distance behind the line. Reset only to a physically validated checkpoint. Add focused regressions for reverse-then-forward at the start, reset after that maneuver, rear-row finishes, and multi-lap finish crossings.

### P2 — Do not let a previous solo result disable the multiplayer Escape menu

Location: `client/main.ts:461`, with multiplayer entry at line 269 and solo completion at line 236.

After finishing any solo session, `soloDone` remains true through `exitRace` and entry into multiplayer. The Escape handler requires `!soloDone` for every non-lobby mode. Consequently the advertised Escape menu stops working throughout the next multiplayer race. The on-screen menu remains available, but the documented keyboard flow depends on unrelated previous gameplay.

Suggested fix: scope the completion guard to solo mode, or explicitly reset the solo lifecycle fields on multiplayer entry. Check the transition complete solo → return home → join multiplayer → Escape, alongside Escape on an active solo run and on its result screen.

### P2 — Represent terminal connection failure separately from active reconnection

Location: `client/network.ts:91–95` and `client/main.ts:574`.

When reconnection expires or the room closes permanently, `onLeave` only sets `connected=false` and shows a short toast. It retains the dead `room` and last snapshot. The HUD maps every disconnected state to `RECONNECTING`, so a race remains frozen with a permanent reconnection message even after the 30-second window has ended. A waiting room likewise keeps a stale preparation panel. There is no terminal-state event for the UI, no automatic account refresh to expose restart refunds, and no durable explanation of whether the seat was lost. This differs materially from the intended clear reconnect/server-unavailable flow.

Suggested fix: expose a terminal connection state/event, clear or retire the dead room, and show a durable connection-ended panel with a return-to-lobby action. Refresh account/pool when reachable, while distinguishing transport loss from the authoritative eventual race/refund outcome. Preserve the current transient `onDrop` behavior during the actual grace window. Check expiry beyond 30 seconds and server termination, not only a successful short reconnect.

## Overall assessment

The prototype substantially implements the agreed local first-stage scope: Chinese desktop 3D driving, three persistent solo challenges, genuine authoritative 2–4-player rooms, bearer identity, transactional persistent simulated accounting, idempotent claims, and configured asset loading. The recorded network and ledger checks are substantive. No additional important ledger atomicity or forged-position acceptance issue was found in this review.

The ordered-checkpoint requirement is not yet met correctly because of P1. Resolve it and the two lifecycle/UI findings before declaring the planned prototype complete. Public-network performance, production abuse resistance, real funds and commercial-quality asset substitution remain outside the established local verification, as already documented.

## Re-review of fix commit 9f8cbd4

Reviewed `artifacts/review-fixes.diff`, `docs/review-fixes.md`, current network/UI/shared physics sources, and the installed SDK reconnection lifecycle. The initial findings above are retained as history. No full test suite was repeated.

- **P1 closed.** Signed progress and physical spawn initialization remove the lost-negative-distance offset. A new focused legal-input check drove all four starting slots through three laps each: all 12 lap increments occurred at physical track t=0, including the second lap's floating-point value 1.999999999999998. Reversing with straight negative throttle for 180 steps and then driving forward awarded checkpoint 1 at physical t=1/12. Reset displacement was only 1.12 metres, consistent with recentering instead of the previous 28.44-metre forward skip. Signed progress carries correctly across repeated wraps and validated checkpoints remain monotonic.
- **P2 Escape menu closed.** `canOpenPause` now applies `soloDone` only to solo mode. The multiplayer path no longer depends on a previous solo result.
- **P2 terminal connection handling partly fixed, still open.** Terminal state now retires the room/snapshot, clears client prediction, and presents a durable return action. Room identity checks prevent stale snapshots/notices/errors/leave callbacks from replacing a newer room, and a late successful reconnect attempts to leave the old room. However, the grace deadline is restarted on every failed reconnect attempt, as detailed below.

### Remaining P2 — Preserve the first-drop deadline across failed reconnect attempts

Location: `client/network.ts:99–105`.

The new `onDrop` handler always clears the existing timer and starts another 30-second timer. In installed `@colyseus/sdk` 0.18.2, every abnormal WebSocket close invokes `onDrop` before `handleReconnection`, including an unsuccessful retry connection (`node_modules/@colyseus/sdk/build/Room.mjs:129–136`). Thus stopping the server yields repeated drop notifications that renew the countdown. The default retry policy makes 15 attempts, with delays increasing to 5 seconds, so the UI can remain in reconnecting well past the promised first 30 seconds. This is a source-confirmed lifecycle issue; the initial successful short-reconnect test does not exercise it.

Only create the grace timer when entering reconnecting from connected, or record an absolute first-drop deadline and schedule the remaining interval. Failed retry drops must not extend it. Clear that deadline only on successful reconnect, intentional leave, or terminal cleanup. Add a focused repeated-drop/controlled-time regression proving terminal cleanup occurs 30 seconds after the first drop even when subsequent drops arrive. Also retain a check that a successful reconnect starts a fresh window for a later independent interruption.

**Current verdict:** progress and Escape findings are resolved; close the remaining reconnect-deadline issue before marking all three review items complete.

## Final re-review of deadline fix 101c95e

Reviewed `git diff 9f8cbd4 101c95e` without rerunning the complete suite. **The remaining reconnect-deadline finding is closed.**

`reconnectDeadlineAt` now preserves the first drop's absolute deadline. Subsequent SDK drops neither overwrite that deadline nor replace the active timer. Successful reconnect and terminal cleanup both clear the timer and deadline; intentional leave clears both as well. Existing room identity guards prevent stale room callbacks from clearing a newer room's active window. A subsequent independent interruption therefore receives its own fresh 30-second window.

The new regression checks the deadline calculation for initial drop, repeated drop, and a fresh interruption. This is a focused helper-level regression rather than an end-to-end timer/SDK test; the timer wiring and cleanup paths were verified by source review. The root task is responsible for the final complete test run.

**Final verdict:** all three actionable findings from this review are resolved. No remaining substantive correctness issue was identified within the reviewed scope. The documented local-verification and prototype limitations still apply.
