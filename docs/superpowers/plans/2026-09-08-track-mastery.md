# Track mastery and race duration implementation plan

> **For agentic workers:** Use superpowers:executing-plans, implement sequentially in this workspace. The user instructed us to continue after the diagnostic and candidate design; proceed with default three-lap duration classes. No additional approval or delegation is required.

**Goal:** Nine individually composed routes with drivable V/S/U bends and approximately three/five-minute three-lap races.

**Architecture:** Author shared route geometry and bend metadata; retain the legacy route. Sample by distance, use the same route and duration definitions in client/server, and derive practice and career targets from the actual geometry. Validate with ordinary driving inputs.

**Tech Stack:** TypeScript, Three.js, Colyseus, node:test, Vite.

## Global constraints
- Preserve current unrelated scene/music changes. No commits or deployment.
- Default three-lap targets: coast/harbor/city/forest/ice 180 seconds; desert/factory/space/mine 300 seconds. Calibration bands 165–195 and 275–325 seconds.
- Preserve physics, controls, camera, variable road widths, original logo, six languages and simulated economy.
- Keep existing race modes, career access, branch collision union and progress integrity. Records must be versioned.

## 1. Shared geometry and bends
Files: shared/route-course.ts (new), shared/track.ts, shared/road-design.ts, tests/track-mastery.test.ts (new).
- [x] Add failing assertions: each route exposes V/S/U sections, sampling <= 2 m, no inner edge folding, target duration metadata, distinct layouts.
- [x] Implement rounded route corners with controlled radius, extend different exterior segments per route with a U section, preserve original route silhouettes and S/V sequences. Resample `count = Math.max(720, Math.ceil(length / 2))` and use `track.points.length` in interpolation.
- [x] Derive section ranges from actual travelled distances. Give corner exits a recovery width before narrowing. Rebuild tangent-continuous shortcuts, check their branch savings/clearance and remove unsafe obstacle placements.
- [x] Run geometry plus shortcut/boundary regressions. Current layouts use geometric queries; exact historical reproductions retain routes-0.4.0 fixtures without relaxing their assertions.

## 2. Duration and career/practice integration
Files: shared/rules.ts, shared/gameplay.ts, shared/challenge-events.ts, client/practice.ts, client/main.ts, server/room.ts, relevant locales/tests.
- [x] Test duration-dependent deadlines and first-finisher window independently, both one/three laps; preserve legacy 300-second fallback.
- [x] Add `raceHardLimit(trackId, laps)` and optional route/laps context to `raceDeadline`; pass actual context on client/server. Bump route/rule versions.
- [x] Practice references authored sections and uses fixed metre approach/recovery distances. Technique events target real section locations.
- [x] Recalibrate per-sector budgets, gold times and career deadlines with measured normal-input runs. Preserve earned progression.
- [x] Add compact translated duration/bend information to existing selectors and practice controls.

## 3. Calibration and verification
Files: scripts/measure-track-mastery.ts (new), measurement artifacts, tests, docs/track-mastery-report.md (new).
- [x] Simulate nine routes, three fixed AI tiers, three personalities. Tune route extension lengths using actual times, never player-gap speed boosts.
- [x] Exercise V/S/U passages with legal braking/drift/recovery and measure wall contacts, clean drifts and reset-free completion.
- [x] Re-run all nine career events and recalibrate deadlines; 27 policies finish and eight events have verified qualifying policies. Exercise branch merges and forest exit continuity. Final-event victory remains a separate open validation item below.
- [x] Typecheck/build, full bounded-concurrency suite, real client/server smoke. Browser check training, HUD, pause, settings, duration labels and responsive layout. Result state and career grades are covered in engine/network tests; browser full-run results and locked-event play remain explicitly unverified.
- [x] Save baseline/candidate comparison, actual screenshots and remaining limitations. Mark checkboxes only after validation.

## Outstanding human validation
- [ ] Expert mine finale victory and full-star difficulty against a skilled human benchmark. Best fixed policy is second; do not label all nine events cleared.
- [ ] Full keyboard career playthrough, live ghost chase and item battle feedback screenshots without changing saved unlocks.

Actual measurements, screenshots and test limitations: [delivery report](../../track-mastery-report.md).
