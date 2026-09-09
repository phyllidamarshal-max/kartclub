# Map tiers and new mechanics implementation plan

**Goal:** Classify all maps by driving difficulty, add at least TEN playable circuits (19 total), A/B routes and deterministic moving obstacles. User expanded the new-map minimum to ten after the initial plan.
**Architecture:** Shared map profiles set width/radius floors independently of AI tiers. Existing main/shortcut topology represents A/B physical routes with explicit A/B metadata and signage. Deterministic obstacle poses derive from the race clock and are shared by rendering, collision and AI. Preserve all game modes, original nine career levels, brand UI, six-language switching, ~3/~5 minute race classes and existing player controls.
**Tech stack:** Existing TypeScript, Three.js, Vite, Colyseus and node:test. No new dependency.

Reference: https://popkart.tiancity.com/homepage/guide/guide_theme_all.html provides the theme catalog; the official mine guide https://mpopkart.tiancity.com/homepage/article2019/2022/03/31/1315.html illustrates narrow precision routes and railway hazards. Designs here are original circuits using existing scenery assets.

## Contracts

- `shared/map-profiles.ts`: `MapRating = 1|2|3|4`, `mapProfile(id)` returns immutable `{rating, minWidth, tightRadius, bendRadius, layout:'circuit'|'ab', mechanic:'flow'|'precision'|'surface'|'traffic'|'timing', isNew}`. New IDs: `forest-orchard` (1, flow, 3 min), `coast-causeway` (1, flow, 3 min), `city-switchback` (2, precision, 3 min), `forest-ridge` (2, ab/precision, 3 min), `desert-canyon` (3, surface, 5 min), `ice-lagoon` (3, surface, 3 min), `harbor-dual` (3, ab/traffic, 3 min), `factory-shift` (4, timing, 5 min), `space-interchange` (4, ab/traffic, 5 min), `mine-transit` (4, timing, 5 min). Labels: Beginner, Club, Advanced, Expert. These are circuit ratings, not rival difficulty.
- `Track.layout?: 'circuit'|'ab'`; existing `main` branch is route A, existing `shortcut` branch is route B on A/B maps. Both feed the same lap/checkpoint progression. Original shortcuts retain their labels/risk design.
- `shared/moving-obstacles.ts`: `MovingObstacleSpec` readonly `{id,kind:'shuttle'|'sweeper',x,y,z,heading,radius,amplitude,period,phase}`. `Track.movingObstacles?: readonly MovingObstacleSpec[]`. `movingObstaclesAt(track, clock)` yields deterministic world poses and velocities. No random or wall-clock inputs. All motion is along the local road normal.
- Collision module exports `resolveMovingObstacles(body, track, startClock, dt, previousX, previousZ): number[]`; body is a structural subset `{x,z,vx,vz,speed,heading}`; returned numbers are impact strengths [0,1]. It uses relative continuous collision and updates the body, leaving event/resource registration to `race.ts`.
- Client module exports `buildMovingObstacles(scene, track): {update(clock:number):void}`. Meshes remain in scene for existing resource disposal; update changes transforms/indicator state only.

## Work

- [x] Test and implement map profiles and TEN original geometries; adjust road widths/radii by rating. Maintain original map IDs and career structure.
- [x] Build true A/B joins, entry guidance and branch feedback; verify each line is independently drivable through entry and exit with no progress exploits.
- [x] Test and implement obstacle motion, relative swept collision, visible geometry and AI avoidance. Place only on new maps' sufficiently wide straight sections; reserve a viable lane throughout each cycle.
- [x] Add difficulty filters, rating/mechanic tags, dynamic map counts, new-map localization and existing-theme music fallback in current UI.
- [x] Integrate shared race time across solo, server, prediction/reconciliation and render; preserve pause, reset and countdown behavior.
- [x] Verify geometry, clean driving, both A/B routes, hazard phases/contact/crowds, deterministic authority, major existing regressions and production build. Capture actual game views and record measured limits.

## Completion evidence

See `docs/map-expansion-2026-09-08.md` and `output/map-expansion-20260908/`. Production build passes; full suite has 603 passing tests and no failures/skips. All ten additions complete three laps on both measured AI tiers without reset. One of twenty full runs makes a legitimate obstacle contact. Three A/B maps pass both-route physics tests and browser B-route driving; factory/mine moving sections pass browser driving. Two real network clients pass the first new harbor obstacle with consistent snapshots, clock and prediction replay. All ten new maps were switched through the actual game menu without runtime errors; Mine Transit starts, pauses with a frozen timer, and returns to the lobby. Reused one thumbnail canvas after reproducing WebGL context exhaustion in the expanded catalog. New geometry reuses existing biome art/music; human pace, a full eight-player latency matrix, all device sizes and GPU performance remain outside measured coverage.

Ownership: root handles shared map geometry/A-B/core integration. Under the applicable subagent-driven-development workflow, bounded UI and obstacle modules may be delegated with separate file ownership. Do not reset others' files, stage, commit, deploy or create another user task.
