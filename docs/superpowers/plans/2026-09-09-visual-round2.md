# Visual round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the user's accepted coastal/HUD material finish and coherent architectural joints, plus requested offshore breaching whales and walking desert camels, in the real game.

**Architecture:** Preserve existing World, course layouts and authored GLB loading. Regenerate only three cottage assets through the existing Blender pipeline; add isolated reusable structural geometry and fauna modules. World owns integration, quality and cleanup; scene animations have no physics, rewards, gameplay-event VFX or audio responsibilities.

**Tech Stack:** Three.js 0.185.1, TypeScript, Vite, Blender 4.2.23 Python, GLB/PBR.

## Global Constraints

- Reference previews: output/visual-round2-20260909/coastal-hud-visual-target.png and architectural-junction-study.png. User approved this direction, then requested ambient whale jumps and camel walking.
- No editing track layouts, colliders, input, networking, economy or event VFX/audio. Decorative animals stay outside every drivable branch.
- Current shared branch is codex/pons-kart; preserve concurrent work and do not commit unrelated changes. Before snapshot is output/visual-round2-20260909/baseline.
- Root owns World integration, industrial/other structural junctions, lighting, coast path grounding, browser/GPU validation and final packaging.
- Cottage worker exclusively owns scripts/scene-assets/architecture.py, three cottage Blender/GLB/atlas/meta files, architecture manifest entries and a focused asset validation script/report.
- Fauna worker exclusively owns new client/ambient-fauna.ts, client/fauna-models.ts, tests/ambient-fauna.test.ts, editable animal source/export files and report. It must not modify World or scene layout modules.
- Shader/code changes and runtime shots are distinguished from generated concept images. No claim of pixel identity or unmeasured FPS.

## Task 1: Baseline and cottage joins

Brief: output/visual-round2-20260909/reports/cottages-brief.md.

- [x] Freeze current client/shared/public before edits.
- [x] Root runs actual game/harness and saves identical-camera baseline coast/causeway/factory/desert frames plus resource counts before baking starts.
- [x] Worker fixes unsupported porch geometry, door steps, roof/wall intersections and foundations, reusing current footprint envelopes. Add fascia, gutters and grounded porch shoes with meaningful support.
- [x] Rebuild only cottage-hero/gable/low through build.py; preserve existing atlas resolutions and 16 samples. Validate finite normals/UVs, footprint radius, named source-part contacts, GLB PBR channels and actual counts. Pack only those files and replace only those manifest entries.
- [x] Review task report, inspect real GLB in game, rectify material/geometry mismatches before accepting.

## Task 2: Structural integration and finish

Files: client/architecture-joints.ts (new), client/level-scenery.ts, client/coast-gardens.ts, tests/architecture-joints.test.ts (new), existing coast scenery tests.

- [x] Root adds reusable steel column/beam joints, saddles/flanges, realistic base plates and concrete feet within existing support clearances. Use the scene-local `ArchitectureJoints` reusable kit returning supported portal groups; no object enters the road corridor.
- [x] Connect repeated route portals with supported longitudinal beams/pipes following actual successive tangents; avoid changing original emitter names/transforms or road physics.
- [x] Replace the arbitrary cottage approach start with asset-specific step endpoint; continuous path slabs land on actual house/ground levels and stop before curb. Attach only within existing loader ownership.
- [x] Test finite geometry, lower-bound support contact, unchanged course clearance, bounded material/geometry counts and disposal. Run `node --import tsx --test tests/architecture-joints.test.ts tests/coast-scenery.test.ts tests/level-scenery.test.ts`.

## Task 3: Ambient animated animals

Brief: output/visual-round2-20260909/reports/fauna-brief.md.

- [x] Build recognizable stylized whale/camel editable meshes with real articulated transforms and restrained PBR, no event particle effects.
- [x] Provide constructor `new AmbientFauna(scene, track, {groundHeight?})`, `update(seconds, cameraPosition, low, reducedMotion?)`, `dispose()`, and `root`/audit metadata. Exact absolute seconds gives reproducible poses; no global listeners/timers.
- [x] Coast whales use validated offshore positions and infrequent short arcs with tail/flipper motion. Desert camel caravan uses a closed safe route, feet grounded on actual terrain and alternating gait. Extend the user's music direction across all19maps with forest birds and seven scenic machinery types.
- [x] High/low quality bounds and distance clipping avoid hidden animation work; reduced motion keeps static plausible poses. Explicit scene-local resource ownership and idempotent disposal.
- [x] Tests cover main/shortcut clearance across coast/causeway and desert/canyon, deterministic loop endpoints, bounded counts, quality/reduced motion and resource cleanup. Root integrates with World render/quality/dispose.

## Task 4: Real validation and delivery

- [x] Capture same-camera architecture before/after plus actual close-ups; record whale and camel animation clips from runtime.
- [x] Measure before/after GPU/CPU at identical 1280x720, eight cars, fixed pose/time, high/low, with bake jobs stopped. State harness timing limits and device details.
- [x] Check normal game entry, HUD, switching maps, repeated lifecycle, no console shader errors; run focused tests and `npm run build`.
- [x] Obtain independent scoped review, fix actionable findings, publish local review page with real runtime evidence, source/asset counts, scope and unverified items. Preserve prior review pages.

## Progress ledger

2026-09-09: implementation integrated and independently reviewed. Three cottage assets rebuilt; architecture/stair joins fixed; 19 ambient profiles, three animals and seven machinery types delivered. Full789tests passed; finalGLcontext fix passed51focusedtests/build. 19maps passed8car/360step smoke and framebuffer health; four repeated coast rebuilds stable; five clips decoded197–231frames at1280x720. Normal main UI and3desktopHUDsizes checked. Frozen matched control and active hidden/shown timing captured. Final review page packaged separately from concept targets; mobile/live multiplayer/fullrace/long-duration heap stability remain explicitly unverified.
