# Ambient fauna implementation — 2026-09-09

Implemented the exact requested `AmbientFauna(scene, track, {groundHeight?})` API with `root`, absolute-seconds `update(seconds,cameraPosition,low,reducedMotion?)`, and idempotent `dispose()`. Root integration and browser/GPU validation belong to the coordinating task; this report does not claim measured frame rates or completed audio/event VFX work.

Actual editable assets are `client/fauna-models.ts` and `client/ambient-fauna.ts`. `scripts/fauna-assets/export.ts` produced the three valid binary glTF catalog files in `public/art/fauna/`; they are **catalog only, not runtime-loaded**, with calm static poses and no exported animation clips. `art/fauna/catalog.json` records export measurements and standalone placement metadata. No `.blend` was created.

| Species | Triangles / actor | Scene-local PBR materials | Nominal mesh submissions / actor | High / low cap |
|---|---:|---:|---:|---:|
| Whale | 4,616 | 4 | 5 | 2 / 1 |
| Camel | 5,496 | 4 | 22 | 3 / 2 |
| Bird | 1,122 | 4 | 6 | 3 / 1 |

Submission counts exclude shadow passes. Immutable body meshes are combined by material; articulated tail groups, bird wings and camel leg/knee/foot references remain intact. No per-frame geometry/material creation, global clocks/listeners, rAF, network requests or particle effects. Geometries/materials are shared only within one library and released once when the owning fauna scene is disposed.

Whales have a continuous tapered body, pale belly and throat pleats, horizontal paired flukes, swept paired flippers, dorsal fin and tail pivot. They breach for a five-second motion window every 34 seconds on coast / 40 seconds on causeway, with staggered actors and calm fully submerged reduced-motion poses. The water baseline matches existing `createSea` at Y=-7.2. The models are about 9.8m long rather than giant foreground obstacles.

Camels have a continuous two-hump torso, swept curved neck, small head, ears, muzzle, four articulated two-bone legs, knees, padded feet and a swaying tail. Their small oval caravan routes are checked outside all road ribbons; diagonal gait pairs leave two feet in stance, and each contact samples the supplied terrain callback. Leg lengths adapt to terrain triangulation. The upper hip attachment is Y=2.15, embedded above the measured torso underside around Y=1.970. Independent vertical raycasts verify all four upper-leg endpoints remain inside the actual rendered torso across seven poses. This is a procedural visual gait, not a physics or locomotion simulation. Canyons use the quieter profile amplitude and longer rest interval.

The three forest maps use small tapered birds with two articulated wings. Mountain gives occasional low glides, orchard short playful flights, and ridge longer higher arcs. Calm birds close their wings backward and their tiny feet meet terrain; no invisible elevated perch. Wing deployment/folding and body bank ease through the first/last 15% of each flight; all transform components are continuous through takeoff, landing and cycle wrap. Timing is an independent deterministic visual interpretation of `ambient-direction.ts`, with no beat/audio synchronization claim.

Placement uses a bounded 128-candidate search with 128 samples per small closed route. Every sample clears the full union of main and shortcut segments, expanded by conservative actor radius plus 3m. One metre of that margin covers the maximum intersample travel; independent tests verify actual animated vertex radii. Whales also clear `coastalShoreMargin` and must be outside the course polygon. Camels and birds exclude every positive authored scene footprint, including small cactus footprints; whales exclude large landmark footprints. No safe candidate means no actor, never an unsafe fallback. Unsupported/reference courses remain empty without calling `getLevel` for an unknown ID. Runtime coordinates can differ from the standalone catalog because actual scene props now influence the candidate search.

Finite XZ culling distances: whales 350m high / 250m low; camels 160m / 110m; birds 130m / 90m. Culled objects keep their last transforms and resume from absolute time. Reduced motion produces calm static poses for all species.

Standalone first-actor close-up coordinates (runtime scene landmarks may select another candidate; inspect `root.userData.paths` then):

| Track | Absolute seconds | Actor0 world XYZ |
|---|---:|---|
| coast | 2.5 | 180.825, -3.000, -468.221 |
| coast-causeway | 2.5 | 307.853, -4.830, -301.027 |
| coast-breakwater | 13.5 | 480.959, -3.478, -379.628 |
| desert-canyon | 13 | 453.455, -3.473, -409.803 |
| mountain | 5.5 | 296.283, 9.592, -257.661 |
| forest-orchard | 3 | 165.660, 7.607, -489.146 |
| forest-ridge | 8.5 | 297.272, 14.543, -283.652 |

Aim camel close-ups 2m above actor root; whale and bird roots are already centered on their bodies. Suggested camera offsets: whale (+14,+7,+16), camel (+6,+4,+7), bird (+3,+2,+3).

Verification: `node --import tsx --test tests/ambient-fauna.test.ts` passed 24 tests covering all seven authored actor maps, full main/shortcut/shore clearance, terrain foot contacts, finite phase boundaries, whole-cycle repetition and scrubbing, quality caps, static reduced motion, frozen culling/resume, conservative animated mesh radii, empty safe fallback, resource ownership and disposal. The three additional regressions reproduced and then verified fixes for small-prop collisions, detached upper-leg attachments, and wing/bank snapping at flight boundaries. CPU catalog export completed successfully after the attachment change. Latest whole-workspace `npx tsc --noEmit` passes. No browser/GPU operations, Git commits or edits outside the assigned ownership set were performed; the supplied local runtime screenshot was inspected with `view_image`.
