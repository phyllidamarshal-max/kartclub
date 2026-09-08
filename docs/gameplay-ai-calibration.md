# Phase-one AI calibration — 2026-09-08

The fixed novice/intermediate/expert tiers retain the preceding legal-input driving controller. Personalities are deterministic from slot modulo three: stable (0), technical (1), attacking (2). `aiProfile(slot, difficulty)` is exported from `shared/ai-profiles.ts` and re-exported from `shared/ai.ts`; `name` is a stable English ID for localization, and `tier` is novice/intermediate/expert. Profiles are frozen. No player ranking or gap changes a profile or cruising policy.

## Rules and distinct behavior

- All controllers return ordinary throttle, steer, drift, boost, item and reset inputs. They do not change position, velocity, route branch, charge, inventory, grip, acceleration or resource rules.
- Difficulty sets requested cruise at 92% / 99% / 100% of ordinary maximum, corner turning targets 1.1 / 1.4 / 1.55 radians/second (expert slightly more conservative on narrow road), and legal drift entry above 24 / 24 / 21 world units/second. Active earned boosts use the same increased legal speed limits as human inputs.
- Stable anticipates traffic 28 units ahead, requests 3.5-unit passing clearance and saves nitro until upcoming curvature is below 0.019. Technical uses the preceding competent controller's 24-unit traffic horizon, 3-unit passing clearance and 0.021 boost curvature. Attacking uses a 22-unit horizon, 2.8-unit passing offset and smooth shortcut selection at intermediate/expert difficulty. All retain close-traffic braking, obstacle and trap avoidance, no boosting into an occupied line, and narrow-exit recovery.
- Drift release, physical grip recovery, throttle release/repress for mini boosts and earned nitro buffering are retained. The technical controller retains its legal driving core, including earning drift charge during nitro; the expert technical profile additionally chooses bounded real drift chains as detailed below. Different personalities have measurable route, traffic and boost decisions; no random steering error or hidden speed/resource grants.
- Shortcut selection steers through the physical mouth; only the common physics engine can admit a kart to the branch. Reject entry heading discontinuities >=0.35 radians. The original mountain branch has a 0.835-radian discontinuity and is deliberately not proactively selected; smooth coastal/industrial shortcuts are selected. If already on any branch, the previous physical-distance lookahead and safe rejoin behavior remain available.

## Final verification context

Measured 2026-09-08T07:41:18.738Z. Rules `pons-rules-0.4.1`; routes `routes-0.4.0`; physics `driving-v3.2`. Configuration SHA256 prefix `512a7ba440c9d114`; complete route geometry SHA256 prefix `f959176ff647fc5d`. The JSON includes full source SHA256s and confirmed `sourcesUnchanged: true` throughout the run.

Run `npx tsx scripts/measure-gameplay-ai.ts --all --profiles > docs/gameplay-ai-candidate.json`. This one serial process compares the frozen pre-phase-one controller (`tests/fixtures/ai-before-phase-one.ts`) with the candidate on the **same current physics**, geometry and spawn slot: 60 Hz, zero granted initial resources, three legal laps, 300-second cap. No other cars or item world are supplied. `--before` / `--after` select one controller; omit `--profiles` for reference slot 1. The command fails for an unfinished car, reset, >10-second progress stall, or a changed benchmark source file.

All 162 measurements completed: 81 current-controller combinations and 81 same-context reference combinations. All finished three laps with zero resets; candidate maximum no-progress interval was 0.68 seconds (includes launch and a 0.002-lap threshold). Easy/normal technical behavior still matches the preceding controller. Expert technical now deliberately recovers and chains on suitable wide continuing bends; all other tier/personality solo metrics remain unchanged by this chain revision.

## All-route tier/personality totals

Each row sums nine three-lap runs; all finished without resets. Delta compares identical spawn slot/tier against the frozen pre-phase-one controller re-executed with final physics.

| Tier | Personality | Seconds | Delta seconds | Collisions (before → after) | Nitro | Mini | Chains |
|---|---|---:|---:|---:|---:|---:|---:|
| easy | stable | 1290.800 | 0.301 | 27 → 28 | 36 | 359 | 0 |
| easy | technical | 1294.551 | 0.000 | 29 → 29 | 35 | 362 | 0 |
| easy | attacking | 1291.851 | 0.000 | 28 → 28 | 36 | 357 | 0 |
| normal | stable | 1195.784 | -0.782 | 28 → 29 | 67 | 280 | 0 |
| normal | technical | 1199.767 | 0.000 | 33 → 33 | 64 | 294 | 0 |
| normal | attacking | 1164.434 | -32.767 | 28 → 27 | 63 | 264 | 0 |
| hard | stable | 1161.983 | 0.533 | 25 → 26 | 82 | 257 | 0 |
| hard | technical | 1163.116 | -2.501 | 24 → 24 | 81 | 262 | 16 |
| hard | attacking | 1139.017 | -24.667 | 26 → 24 | 81 | 233 | 0 |

Attacking intermediate remains 2.74% faster than the same-slot preceding controller, with collisions 28 → 27; attacking expert remains 2.12% faster, with collisions 26 → 24. Stable has one additional aggregate collision per tier versus its preceding same-slot controller; the larger traffic horizon is a policy distinction, not a collision-free guarantee.

## Every route and profile, final three-lap results

Actual elapsed seconds, contact events, mini/nitro activations and physically completed chains. The JSON also retains earned charge, drift/boost overlap, shortcut time, stall interval and all matched baseline records.

| Tier | Route | Profile | Seconds | Collisions | Nitro | Mini | Chains |
|---|---|---|---:|---:|---:|---:|---:|
| easy | coast | stable | 100.117 | 0 | 3 | 20 | 0 |
| easy | coast | technical | 100.367 | 0 | 3 | 20 | 0 |
| easy | coast | attacking | 100.250 | 0 | 3 | 20 | 0 |
| easy | coast-harbor | stable | 117.517 | 0 | 4 | 27 | 0 |
| easy | coast-harbor | technical | 118.417 | 0 | 3 | 31 | 0 |
| easy | coast-harbor | attacking | 117.667 | 0 | 4 | 26 | 0 |
| easy | coast-breakwater | stable | 124.567 | 1 | 3 | 41 | 0 |
| easy | coast-breakwater | technical | 124.650 | 2 | 3 | 42 | 0 |
| easy | coast-breakwater | attacking | 124.650 | 1 | 3 | 39 | 0 |
| easy | city | stable | 144.400 | 0 | 5 | 45 | 0 |
| easy | city | technical | 144.700 | 0 | 5 | 44 | 0 |
| easy | city | attacking | 144.467 | 0 | 5 | 44 | 0 |
| easy | city-factory | stable | 165.683 | 3 | 4 | 60 | 0 |
| easy | city-factory | technical | 165.717 | 3 | 4 | 59 | 0 |
| easy | city-factory | attacking | 165.350 | 3 | 4 | 61 | 0 |
| easy | city-nightshift | stable | 161.400 | 3 | 7 | 35 | 0 |
| easy | city-nightshift | technical | 161.550 | 3 | 7 | 35 | 0 |
| easy | city-nightshift | attacking | 161.567 | 3 | 7 | 35 | 0 |
| easy | mountain | stable | 148.383 | 0 | 4 | 44 | 0 |
| easy | mountain | technical | 149.000 | 0 | 4 | 44 | 0 |
| easy | mountain | attacking | 148.967 | 0 | 4 | 45 | 0 |
| easy | mountain-pass | stable | 159.000 | 12 | 3 | 41 | 0 |
| easy | mountain-pass | technical | 160.000 | 12 | 3 | 41 | 0 |
| easy | mountain-pass | attacking | 159.083 | 12 | 3 | 41 | 0 |
| easy | mountain-summit | stable | 169.733 | 9 | 3 | 46 | 0 |
| easy | mountain-summit | technical | 170.150 | 9 | 3 | 46 | 0 |
| easy | mountain-summit | attacking | 169.850 | 9 | 3 | 46 | 0 |
| normal | coast | stable | 91.283 | 0 | 5 | 16 | 0 |
| normal | coast | technical | 91.433 | 0 | 5 | 15 | 0 |
| normal | coast | attacking | 91.383 | 0 | 5 | 17 | 0 |
| normal | coast-harbor | stable | 109.283 | 0 | 6 | 27 | 0 |
| normal | coast-harbor | technical | 110.300 | 0 | 5 | 30 | 0 |
| normal | coast-harbor | attacking | 102.033 | 0 | 5 | 15 | 0 |
| normal | coast-breakwater | stable | 117.300 | 1 | 5 | 39 | 0 |
| normal | coast-breakwater | technical | 117.433 | 3 | 5 | 40 | 0 |
| normal | coast-breakwater | attacking | 105.767 | 0 | 5 | 33 | 0 |
| normal | city | stable | 131.917 | 0 | 10 | 34 | 0 |
| normal | city | technical | 131.933 | 0 | 10 | 35 | 0 |
| normal | city | attacking | 132.017 | 0 | 10 | 33 | 0 |
| normal | city-factory | stable | 151.717 | 4 | 11 | 38 | 0 |
| normal | city-factory | technical | 152.517 | 3 | 10 | 44 | 0 |
| normal | city-factory | attacking | 146.067 | 3 | 9 | 38 | 0 |
| normal | city-nightshift | stable | 148.867 | 3 | 11 | 25 | 0 |
| normal | city-nightshift | technical | 149.050 | 6 | 11 | 28 | 0 |
| normal | city-nightshift | attacking | 141.000 | 3 | 10 | 25 | 0 |
| normal | mountain | stable | 136.067 | 0 | 7 | 27 | 0 |
| normal | mountain | technical | 136.217 | 0 | 7 | 27 | 0 |
| normal | mountain | attacking | 136.133 | 0 | 7 | 27 | 0 |
| normal | mountain-pass | stable | 150.767 | 12 | 5 | 32 | 0 |
| normal | mountain-pass | technical | 151.817 | 12 | 4 | 35 | 0 |
| normal | mountain-pass | attacking | 151.267 | 12 | 5 | 34 | 0 |
| normal | mountain-summit | stable | 158.583 | 9 | 7 | 42 | 0 |
| normal | mountain-summit | technical | 159.067 | 9 | 7 | 40 | 0 |
| normal | mountain-summit | attacking | 158.767 | 9 | 7 | 42 | 0 |
| hard | coast | stable | 89.417 | 0 | 6 | 14 | 0 |
| hard | coast | technical | 89.500 | 0 | 6 | 16 | 3 |
| hard | coast | attacking | 89.567 | 0 | 6 | 14 | 0 |
| hard | coast-harbor | stable | 107.850 | 0 | 7 | 23 | 0 |
| hard | coast-harbor | technical | 108.000 | 0 | 7 | 27 | 0 |
| hard | coast-harbor | attacking | 100.283 | 0 | 7 | 14 | 0 |
| hard | coast-breakwater | stable | 113.283 | 0 | 7 | 39 | 0 |
| hard | coast-breakwater | technical | 113.283 | 0 | 7 | 38 | 6 |
| hard | coast-breakwater | attacking | 103.567 | 0 | 7 | 28 | 0 |
| hard | city | stable | 128.200 | 0 | 12 | 33 | 0 |
| hard | city | technical | 126.950 | 0 | 12 | 33 | 3 |
| hard | city | attacking | 128.800 | 0 | 12 | 29 | 0 |
| hard | city-factory | stable | 147.500 | 5 | 13 | 30 | 0 |
| hard | city-factory | technical | 147.850 | 3 | 13 | 31 | 0 |
| hard | city-factory | attacking | 147.200 | 5 | 13 | 33 | 0 |
| hard | city-nightshift | stable | 143.883 | 4 | 13 | 30 | 0 |
| hard | city-nightshift | technical | 144.600 | 6 | 13 | 27 | 0 |
| hard | city-nightshift | attacking | 137.583 | 3 | 12 | 29 | 0 |
| hard | mountain | stable | 133.417 | 2 | 8 | 22 | 0 |
| hard | mountain | technical | 133.617 | 0 | 8 | 21 | 0 |
| hard | mountain | attacking | 133.617 | 1 | 8 | 21 | 0 |
| hard | mountain-pass | stable | 145.433 | 9 | 7 | 29 | 0 |
| hard | mountain-pass | technical | 146.683 | 9 | 6 | 28 | 2 |
| hard | mountain-pass | attacking | 145.583 | 9 | 7 | 28 | 0 |
| hard | mountain-summit | stable | 153.000 | 6 | 9 | 37 | 0 |
| hard | mountain-summit | technical | 152.633 | 6 | 9 | 41 | 2 |
| hard | mountain-summit | attacking | 152.817 | 6 | 9 | 37 | 0 |

## Historical baseline comparison

`docs/gameplay-ai-baseline.json` remains unchanged. Its 27 older reference-slot runs have only the tag `phase-one-current`, without source/config hashes. These deltas mix driving changes and AI changes; use the same-context comparison above for controlled evidence.

| Tier | Historical seconds | Final technical seconds | Delta | Historical → final collisions | Nitro | Mini |
|---|---:|---:|---:|---:|---:|---:|
| easy | 1294.099 | 1294.551 | 0.452 | 27 → 29 | 36 → 35 | 360 → 362 |
| normal | 1198.783 | 1199.767 | 0.984 | 33 → 33 | 66 → 64 | 295 → 294 |
| hard | 1165.084 | 1163.116 | -1.968 | 24 → 24 | 83 → 81 | 260 → 262 |

## Expert technical chain correction

The old controller could never intentionally chain: every drift required an expired/consumed mini window, whereas common physics requires starting the next valid drift inside an earned window. A new three-lap coast test first failed with zero chains; it now completes three real chains, keeps 16 mini boosts and records zero collisions. A second test reaches a naturally earned chain decision and verifies rejection at low speed, reset/contact/energy lock, on a straight, for stable personality and normal difficulty, plus non-mutation of car/resources.

Only the expert technical profile changes. On a clean continuing bend with at least 18 units of width, it recovers after 0.55 seconds of valid drift while useful curvature remains ahead. It may then enter another ordinary drift within the earned window. Throttle stays held during this decision so a release/repress cannot consume the chosen window as a mini first. A completed chain defaults back to a mini instead of repeated chaining. Existing obstacle/traffic/trap, speed, grip, charge and exit safety checks still apply; the controller never writes windows, eligibility, resources or counters.

The final nine-route technical expert sample completed 16 chains on five routes. Aggregate time improved by 2.501 seconds (0.21%) versus the pre-chain technical controller, with collisions unchanged at 24, nitro unchanged at 81 and minis 264 → 262. Largest slower route: city-nightshift +0.417 seconds (0.29%), where preparation did not yield a completed chain. Other profiles/tiers are unchanged. The policy is selective: harbor/factory/nightshift/mountain record zero chains in this independent sample. It does not prove every optional career chain medal is attainable by this particular reference policy.

## Targeted checks and limits

Final serial run of ai, ai-profiles, ai-pace, ai-mastery, ai-items, ai-course and ai-corner-safety tests: **43/43 passed**, zero failures (36.61 seconds), including final shared item-target/threat fixes. Output: `output/gameplay-ai-final-tests.txt`. These include ordinary resource earning, narrow exits, obstacle/trap and traffic handling, immutable profiles, distant-gap independence, shortcut legality and real chain completion.

All nine four-car normal item samples finished (96.1–167.9 seconds); the eight-expert summit sample finished in 166.5 seconds. The 162-run solo benchmark was regenerated afterward against final stable sources and rules 0.4.1, with `sourcesUnchanged: true`. The parent owns final full-suite/browser integration verification after the chain change.

These are deterministic simulated samples, not a statistical traffic study or proof of human parity. Tighter routes retain collisions and traffic can alter tier finishing order. No current-version human sample was supplied; the historical roughly 80-second three-lap run is not comparable evidence. No browser, build, full-suite, commit or deployment was performed by this AI worker.

## Independent career/practice review

Read-only review covered `shared/gameplay.ts`, `shared/challenge-events.ts`, `client/main.ts`, `client/practice.ts`, `client/race-feedback.ts` and `scripts/measure-career-events.ts` after the events-v2 update. Qualification, pace and skill are independent; two designated technique bends require distinct clean recoveries; pursuit freezes player physics and omits the frozen player from kart separation; career/practice/training are excluded from ghost record writes, and corner retry recreates clean state. Minimap targets are wired for technique, sector gates and practice completion.

One validation discrepancy was reported and fixed by the parent: career measurements now reuse the runtime hard cap, first-finisher window and clipped final tick instead of an independent 290-second loop. The corrected script was reviewed. No further important runtime defect was identified in this bounded source pass. This is source-review signoff, not browser or full-suite verification; those remain the parent’s checks.

