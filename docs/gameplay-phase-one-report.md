# KART CLUB phase-one gameplay delivery — 2026-09-08

Implemented in the existing game. Phase two (teams, cups, elimination) remains out of scope. The KART CLUB interface, six-language switching with English default, current courses/vehicles/camera, and simulated ticket/reward services are retained. This report covers gameplay work; a separate task is editing scene artwork in the shared workspace.

## Driving and opponents

- Charge depends on useful speed, slip angle and drift duration; overdrifting loses speed. Short/long/linked drifts, recovery mini boosts and stored nitro use the common client/server vehicle rules.
- Ordinary contact does not drain charge. Contact during drift or its remaining slide removes 12–60 current gauge points according to impact, with contact cooldown and a charging interruption. Stored bottles remain intact.
- Fixed chain telemetry: entering a valid next drift consumes the prior mini opportunity, so it is not also recorded as a missed mini boost.
- Rookie/advanced/expert profiles are fixed before the race. Stable, technical and attacking policies differ in traffic anticipation, passing, boost timing and safe shortcut decisions. They return ordinary inputs and do not grant speed, charge or inventory based on player position.
- Technical experts now deliberately recover and chain on suitable wide continuing bends, returning to mini boosts after the chain. The final benchmark records **16 completed chains on five routes**, **2.501 seconds less aggregate time**, and **unchanged 24 collisions** across nine expert technical runs. Largest individual regression: 0.417 seconds (0.29%).

## Nine distinct career events

Qualification grants the first star. Pace and the optional skill objective independently grant the other two. Only designated attack/technique/clean-control events require their corresponding action for qualification. Stable IDs and earned access are preserved.

| Event | Qualification | Optional pace target | Other star |
|---|---|---:|---|
| Coastal Start | 3 laps, top 3 | 96 s | At most 2 collisions |
| Harbor Clock | 1 lap; sector allowances 17 / 16 / 17 s | 40 s | At most 2 collisions |
| Desert Counterattack | 2 laps, top 3, at least 1 useful attack; starts with one missile | 84 s | 3 useful attacks |
| City Pursuit | Rivals leave 4 s earlier; catch top 3 in 2 laps | 96 s | At most 2 collisions |
| Industrial License | 2 laps within 130 s; clean recovery at both designated bends plus 2 mini boosts | 106 s | One linked drift |
| Star Ring Defense | 2 laps, top 4; starts with one shield | 108 s | One successful shield block |
| Forest Trial | 3 laps, top 3, at most 8 collisions | 146 s | At most 2 collisions |
| Glacier Endurance | 4 laps within 240 s | 204 s | One linked drift |
| Mine Final | 3 laps, win against 7 experts | 160 s | 2 useful attacks or 2 blocks |

The pursuit opponents use the fixed rookie tier: the prior advanced tier's two-lap gap left almost no room to recover the authored four-second head start. Forest uses three advanced rivals to focus the event on clean control, while the final retains seven experts. Pace targets now use current measured runs rather than route length divided by an assumed speed.

Technique targets are actual factory bends at roughly 24% and 61% of the lap. Clean recovery is accepted from 3.5% before to 8.5% after each bend; each distinct target counts once. Repeating drifts in one place cannot satisfy both. Target bends and sector gates appear on the real minimap and their status appears in HUD/results. Reversing or resetting does not restore sector time. The pursuit freeze and collision separation now use the same tick-start release state.

## Items and training

- Four existing items only. Bounded deterministic loot weights use current rank and signed race-progress distance to both the rival ahead and the pursuer behind. Race metres use canonical progress times current track length, including the existing shortcut progress mapping; they are not a Euclidean chord across a hairpin.
- Targeting, AI decisions and impact warnings share the target/impact helpers. Warnings continuously estimate arrival from the current pose. Shield expiry and repeated-hit protection are resolved in actual within-frame impact order.
- Fixed expired attacks, protected respawn usage, cross-section pickups, layered-road trap contact, and self-hit farming of useful-hit/block counters. Reverse/respawn driving cannot farm pickups.
- Existing five-step tutorial is retained. Corner practice offers five real bends on every route, from a standing start; retry resets movement/resources and preserves the chosen bend. Practice does not save career or ghost records.
- Feedback shows actual drift efficiency, mini window, impacts, useful attacks and driving advice. Sector comparison now reports the individual section interval against the matching reference section; ghost data remains cumulative and resets per lap.

## Verification

- **299/299 tests passed** with bounded concurrency: `npx tsx --test --test-concurrency=3 tests/*.test.ts` (31.24 s). Log: `output/gameplay-phase-one-tests.txt`.
- **Build and typecheck passed**: `npm run build`; final script typecheck also passed. Build log: `output/gameplay-phase-one-build.txt`.
- **162 controlled three-lap AI runs**: nine routes × three tiers × three personalities × before/after controller. All finished; all 81 candidate combinations had zero resets and no-progress intervals at most 0.68 s. See `docs/gameplay-ai-candidate.json` and `docs/gameplay-ai-calibration.md` for all rows and hashes.
- **27 career simulations**: each event with three fixed expert input policies, retaining the same physical player starting grid, vehicle, authored starting item, rivals, runtime deadline and first-finisher window. All finished; 23 qualified. **Every event has at least one qualifying policy sample.** All successes/failures are retained in `output/gameplay-career-profiles.json`; `output/gameplay-career-validation.json` is its stable-policy subset. This is a playability check, not a claim that every strategy wins.
- **45/45 offered corner segments** completed from their standing starts using ordinary inputs (`tests/practice-driving.test.ts`).
- **Two-client server item-race smoke passed**, including actual item use, matching results, finish/payout bookkeeping, idempotent claims and pool conservation in an isolated temporary simulation database. Log: `output/gameplay-phase-one-smoke.txt`. The smoke controller was corrected to receive the actual cars/item snapshot; its earlier missing item context could not exercise item usage.
- The server audit test was updated for the intended respawn rule: protected item presses produce no use/audit event; a new press after protection expires produces exactly one event.
- Independent review found and resolved the pursuit boundary-separation issue and a career benchmark/runtime finish-deadline mismatch. The latter script now uses the same `raceDeadline` and `soloRaceComplete` functions and clipped final timestep as the application.

## Browser checks and evidence

Verified the existing app at `http://127.0.0.1:5173/?track=coast`: career cards and locked progression, training entry, selecting the second corner, real acceleration response, pause input isolation, reverse-Tab focus containment, retry to zero time/speed/gauge/bottles with the same bend, and return to career without adding stars. English → Arabic RTL → English switching retained the existing high quality/audio/key settings. Arabic training controls fit the viewport.

The first career race also reached its actual DNF result: the leading AI finished at 01:31.42 and the result appeared at 01:51.42, matching the 20-second finish window. The displayed player review contained 4 clean drifts, 1 mini boost and 2 missed windows from that run. Returning to career left all eight later chapters locked; the failed run did not award access. Result controls remained onscreen. Temporary viewport overrides were reset and English restored.

Final race HUD rectangle checks at 1280×720, 1440×900, 1920×1080 and 2560×1270 found no offscreen modules, horizontal overflow or overlap among the rank, title/time, objective, minimap and instruments. Data: `output/gameplay-phase-one-20260908/hud-responsive.json`. This check does not represent every possible translated dynamic message at every instant.

Actual screenshots (not generated mockups):

- `output/gameplay-phase-one-20260908/career.png`
- `output/gameplay-phase-one-20260908/practice-select.png`
- `output/gameplay-phase-one-20260908/practice-hud.png`
- `output/gameplay-phase-one-20260908/practice-rtl.png`
- `output/gameplay-phase-one-20260908/result.png`

## Versions and remaining limits

Physics/resource version: `driving-v3.2`; record rules: `pons-rules-0.4.1`; route geometry: `routes-0.4.0`; career objectives: `events-v2`. Changed timing contexts do not compare incompatible best times. Historical times and earned stars remain available.

No current-version human lap sample was supplied, so advanced/expert parity with human skill remains unverified. The older roughly 80-second three-lap run is not used as a present benchmark. The authored precision and item goals deliberately fail some reference strategies; not every event's three-star result was demonstrated. Narrow routes still cause AI collisions.

Later career chapters remain locked in the browser test profile. Their pursuit/gate/technique/item logic was exercised through the real shared simulation and tests, not by injecting browser progress. They have not all been manually driven to completion in the browser; live incoming-warning timing and the entire multi-lap ghost UI have not received exhaustive browser playtesting. These limits are separate from the passing engine, server and input tests.

The existing large production bundle remains about 1.18 MB uncompressed (348.4 kB gzip); no rendering quality was reduced to pass UI checks. No commits, deployment, real-money transactions, new UI sounds or phase-two modes were introduced.
