# Detailed obstacle collection and approach HUD

User clarified HUD on 2026-09-09: refined HD 3D obstacle models plus in-game approach warnings. This authorizes implementation in the existing game, not replacing 3D objects with flat overlays.

## Design

Add three different mechanisms: a continuously rotating padded arm (`spinner`), a bidirectional rail minecart (`minecart`) with pauses at each end, and a lateral cargo carrier (`hauler`) with a slower stop/cross cycle. Place spinner challenges on broad advanced city/space road, minecarts alongside existing mine pendulums, and haulers in the harbor. Preserve first-batch animals and pendulums. Refine every existing dynamic family and the current static track obstacle models with coherent material response, bevels, functional construction and restrained surface detail. More tessellation alone is not the art goal.

HUD is one compact noninteractive warning on the existing race HUD, anchored above the minimap/under rank region so the driving centre remains clear. Show actual upcoming obstacle type, road distance, movement direction and an advisory risk based on predicted arrival on the current line. Suppress passed/distant obstacles, wrong branches, other elevations, lobby/countdown/pause/results/reset. Do not claim guaranteed safe passage. All labels support existing six languages, default English. Use existing warm cream/forest green/lime variables, muted amber only for real risk. No added audio, full-screen blur, camera change, particle clutter or large permanent labels.

## Shared contracts

- `MovingObstacleSpec.kind` adds spinner/minecart/hauler. Existing fields/IDs and pure `movingObstaclesAt` remain.
- Spinner: fixed x/z, facing=heading+clock*2pi/period+phase, yawRate=2pi/period, no lift; full radius about3.5m, capsule halfLength=.80r, flank radius=.20r. Solid padded arm at kart-contact height, central bearing included in that capsule. Art cannot assume a solid full disc.
- Minecart: lateral quintic travel with end dwells, fixed facing=heading+pi/2 (reverses on rails, no turning); capsule halfLength=.45r, radius=.55r, nominalr2.1m. Shared pose.stride/offset drive wheel roll.
- Hauler: lateral quintic travel with longer dwells, fixed facing=heading+pi/2; capsule halfLength=.30r, radius=.70r, nominalr2.4m. Real broad low rounded impact deck with seated cargo.
- Preserve exact kart polygon contact, continuous translation/rotation handling, deterministic replay and curb recovery. Motion and model share fitted footprints. Author moderate angular speed to avoid launching karts.
- HUD computes from actual Car/Track/raceClock and `movingObstacleClearance`; static obstacles use their real static circles. Rendering reuses fixed DOM nodes and updates text only when changed. No new gameplay/network state is required.

## Tasks / ledger

- [x] 1. Extend shared motion/collision and add meaningful new-kind regressions.
- [x] 2. Refine all dynamic model families and static obstacle models; build all three new models with footprint/resource/inverse-clearance checks.
- [x] 3. Implement pure approach-warning selection and reusable localized HUD component with state, lifecycle and layout tests.
- [x] 4. Root integration: authored placements, AI capsule-aware prediction, static builder/World wiring, HUD/main wiring, six-language map metadata, preview collection update, versions.
- [x] 5. Review, build, relevant regression, real game/inspection screenshots at 1280x720 and1440x900 plus narrow viewport layout.

Ruling: continue in the current live checkout, preserving unrelated changes. No staging, commits, resets or publication. The approved definition of HUD resolves the task ambiguity; no additional design-approval pause is needed.

| Shared boundary | Checked contract |
| --- | --- |
| Motion/model | kind IDs, world facing, capsule dimensions and ground height above |
| Motion/AI/HUD | same pose and actual capsule clearance, no separate guessed phases |
| Model/World | retain dynamic flags through real static batching; reuse/dispose resources |
| HUD/main | public update input, root wires after world render with same race clock |
| Placement/tests | authored sight distance, whole-kart passing space, no join obstructions |

Previously reported full-suite failure: coastal cottage path-count assertion. Recheck current state; do not weaken unrelated tests to claim green.

Final placement decision: city-factory has no qualifying straight/wide slots. Two spinners are on city-switchback, one on space-interchange, one minecart on mine-transit, and one hauler replaces the first harbor shuttle. The harbor retains its second shuttle because only one site meets the 96m sight criterion. 16 encounters across seven maps; other twelve maps stay free of dynamic obstacles. Final suite833/833passed; previous unrelated coastal assertion now passes in current shared checkout without changes to that test by this task. Independent review approved after correcting same-road slope suppression. See docs/obstacle-detail-hud-2026-09-09.md for final validation boundaries and images.
