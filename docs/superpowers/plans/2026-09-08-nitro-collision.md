# Nitro, impact penalties and collision sound implementation plan

> Use subagent-driven-development: root owns shared driving and integration; an independent implementer owns collision audio.

**Goal:** Make nitro require controlled, sustained driving, visibly penalize impacts, and give collisions a rounded arcade sound.

**Architecture:** Shared deterministic resource/collision rules for humans, AI and server. Browser audio consumes collision event count and strength, never drives physics. Extend existing HUD and six-language catalog for full-gauge collection and loss feedback.

**Tech Stack:** Existing TypeScript / Web Audio / node:test; no new dependencies or downloaded samples.

## Global constraints

- Preserve unrelated uncommitted UI/model/AI work. No commits, publishing, account changes or saved-score deletion.
- Only collisions during a real drift (including its not-yet-straightened recovery slide) remove current 0–100 gauge charge. Ordinary collisions retain gauge; stored nitro bottles are retained in both cases. Active nitro keeps its existing clock and physical collision slows the car.
- Reference publicly described drift/point-drift/interrupt-to-collect principles. Do not present our numbers as a proprietary KartRider formula.
- All physics parameters apply equally to AI and player, offline and server. Existing saves remain accessible.
- Use legal input simulations to verify charge difficulty, collision penalties, training completion, AI track completion and render-frame determinism.

## Task 1 — shared resources and impacts (root)

- [x] Add failing regressions: short clean drift earns a modest fraction of one gauge; holding a full-gauge drift cannot mint repeated bottles; release converts once; severe wall collision reduces current gauge more than light contact; sustained scraping cannot collect; solver overlap corrections and zero-dt calls cannot repeatedly drain energy; stored bottles survive; player/AI obey identical rules.
- [x] Lower base charge rate from 300 to an initial 120 points/sec; weight by existing actual speed, forward movement and side-slip, with low starting efficiency rising during sustained valid drift. Keep 100-point capacity and two bottle slots. Measure actual 40-tick clean drift against the former 50–100 point fixture.
- [x] Full gauge converts only after ending active drift/recovering, rather than automatically minting multiple bottles while holding drift. Adapt AI to deliberately collect a full gauge through legal inputs.
- [x] Record meaningful wall/obstacle/kart impact events in shared Car (collisionCount, lastCollisionStrength, lastCollisionKind). Capture actual drift before contact impulse changes velocity, then deduct 12–60 gauge points only for drift contacts; debounce one contact episode, interrupt drift/mini eligibility, and block gathering briefly after a drift contact. Straight-driving contact retains physical and audio feedback. Each kart is evaluated independently. Impact feedback is independent of continuous render shake.
- [x] Run resources/collision/AI/training regressions and tune using actual simulation evidence. Keep progression goals attainable.

## Task 2 — collision audio (independent implementer)

Owned files: client/audio.ts, optional client/collision-audio.ts, tests/collision-audio.test.ts, docs/collision-audio-report.md. Do not edit main.ts or shared physics.

Expose `GameAudio.collision(strength: number, kind: "wall" | "obstacle" | "kart")` and `GameAudio.resetCollisionSound()`.

- [x] Build an original Web Audio effect: short low-frequency body thump, softly filtered contact/noise transient, lighter scrape for weak impacts; stronger collisions sound heavier but are not piercing. Kart contact can be slightly softer than wall/obstacle. No borrowed character voices or external audio.
- [x] Use current SFX bus/volume/mute; no sound when context is absent or suspended. Clamp invalid strength safely. Debounce calls (roughly 120 ms); bounded duration and cleanup/disconnection of created nodes; never produce a new collision sound every render tick.
- [x] Meaningful tests for absent/suspended context, cooldown, finite scheduling, volume routing and cleanup (Web Audio doubles only where platform requires). If useful provide a deterministic pure sound profile helper and validate its strength scaling.
- [x] Run focused tests and typecheck; self-review and write report with exact files/commands/results. Return concise status. Root will integrate event consumption and validate combined behavior.

## Task 3 — integration and verification (root)

- [x] Feed local collision events to audio once; reset observer on new races/replays/menu/pause to avoid stale sounds. Display energy loss and full-gauge collection prompt through existing localized HUD.
- [x] Update relevant help/training copy in all six languages and document rule revision without deleting existing achievements.
- [x] Full test suite and production build; actual multi-car career simulations; browser smoke; scoped independent final review. Record measured resource gain and test results.

Reference: official-account driving tutorial https://www.taptap.cn/moment/294849901282461006 (2022); project-specific penalty amounts and timings are tuning choices.

