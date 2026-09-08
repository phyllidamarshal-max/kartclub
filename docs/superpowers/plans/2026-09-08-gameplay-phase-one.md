# KART CLUB gameplay phase one implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent driving, AI and item tasks; integrate career and training in the current session. Track progress below. User approved phase one on 2026-09-08.

**Goal:** Deliver skillful driving, calibrated AI, nine distinct career events, tactical items and actionable training feedback.

**Architecture:** Keep physics and items in shared modules used by client and server. Add pure career objective evaluation and client practice/telemetry controllers. Preserve existing progress while versioning changed records.

**Tech Stack:** TypeScript, Three.js, Colyseus, node:test / tsx, Vite.

## Global constraints
- Preserve all pre-existing uncommitted changes and route aliases. No commits or deployment in this task.
- Six languages (English default, French, Hindi, Spanish, Arabic RTL, Chinese).
- Ordinary collisions never drain charge; drift-slide collisions only drain the current gauge, retain bottles and use contact cooldown.
- AI use ordinary driving inputs, identical vehicle/resource rules, and pre-race fixed tiers. No player-gap speed boost.
- Preserve simulated tickets/pool. Team modes, cups and elimination remain phase two.
- Existing route/physics version is the benchmark context; historical player 80 seconds is not a current measured benchmark.

## Task 1: Driving skill and telemetry
Files: shared/race.ts, shared/driving-config.ts, shared/driving-skills.ts, tests/driving-skills.test.ts.
- [x] Write and run failing behavioral tests for successful short/long/chained drift recovery and invalid low-speed/contact farming.
- [x] Refine shared resource logic where needed, add a pure exported drift-efficiency helper, preserve collision rules and stable integration.
- [x] Expose additive initialized Car counters for cleanDrifts, driftChains, driftAttempts, miniOpportunities, missedMini, lastDriftGain and lastDriftKind (short/long/chain/none). Keep fields serializable.
- [x] Run driving, training and collision regression tests; provide exact rules and integration contract.

## Task 2: AI competence and calibration
Files: shared/ai.ts, shared/ai-profiles.ts, scripts/measure-gameplay-ai.ts, tests/ai-profiles.test.ts, docs/gameplay-ai-calibration.md.
- [x] Add fixed tier/personality tests: identical rules, input-only AI, deterministic profile, no live rubber banding.
- [x] Implement measurable stable/attacking/technical profiles with braking, lane/overlap, drift recovery, mini/nitro timing and route choices; retain safety.
- [x] Measure all nine current routes on identical three-lap conditions, record finishes/collisions/nitro/mini, compare tiers and existing baseline. Fix stalls and regressions.
- [x] Report simulated benchmark context and limits; do not claim human parity without current player samples.

## Task 3: Tactical four-item races
Files: shared/items.ts, shared/item-strategy.ts, tests/item-strategy.test.ts.
- [x] Test position/distance-weighted loot, deterministic seed, reverse/respawn exclusion and sustained-hit protection.
- [x] Implement bounded weights for the four existing items, same shared logic online/offline; preserve pressing semantics and shield rules.
- [x] Add usefulHits, blocks counters to ItemState and exported incomingThreat(world, car) for UI warning (seconds or null).
- [x] Run item and AI-item regressions, report interfaces.

## Task 4: Nine event objectives and independent stars
Files: shared/gameplay.ts, shared/challenge-events.ts, client/main.ts, tests/challenge-events.test.ts.
- [x] Test ordinary event qualification without forced drift/item quotas; technique events explicitly require actual techniques; optional medals independent.
- [x] Keep nine stable event IDs and access, give each an explicit objective: introduction, sector deadlines, useful item attack, pursuit, precise drift, defense, clean race, technical endurance, expert final.
- [x] Runtime pursuit delay freezes player while rivals drive; segment deadlines use actual progress crossings, have clear failure UI; objective counters visible during race and results.
- [x] Include objective version in career time context; preserve old earned access and historical times.

## Task 5: Practice, feedback and languages
Files: client/training.ts, client/practice.ts, client/race-feedback.ts, client/main.ts, client/locales/gameplay.ts, client/locales/catalog.ts, client/gameplay.css, tests/practice-feedback.test.ts.
- [x] Test reusable corner practice resets velocity/resources and never creates career/ghost records; sector comparison uses matching lap context.
- [x] Add pause/start access to corner practice with bend selector and retry, preserve existing five-step lesson.
- [x] Show live drift efficiency/mini-window, sector deltas, incoming item warning, current event objectives; results explain skill and misses.
- [x] Translate all new UI and challenge copy into six languages with matching placeholders; check Arabic RTL layout.

## Verification and review
- [x] Typecheck/build, targeted behavioral tests, full bounded-concurrency suite, AI benchmark.
- [ ] Browser exercise career start/pursuit/sector challenge, practice retry, items warning, pause/results and languages. Partial: career start, practice selection/retry, pause/input isolation, actual DNF result/locked progression and English/Arabic switching verified. Locked pursuit/sector chapters and live warning timings are covered by engine tests/simulations; exhaustive manual browser playthrough remains pending.
- [x] Independent review of this phase's changes; fix important findings and rerun affected checks.
- [x] Record results and remaining limits in docs/gameplay-phase-one-report.md.


