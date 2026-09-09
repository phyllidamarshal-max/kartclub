# Kart contact clearance implementation plan

**Goal:** Fix tire/body and body/body penetration between colliding karts.

**Architecture:** Replace the obsolete 2.1 m vehicle contact diameter with a shared oriented convex footprint enclosing the authored model through its steering range. Retain existing contact impulses, collision feedback, reset immunity and road constraints. Apply the same positional separation to render-only copies after interpolation, without writing to race state.

**Tech stack:** Existing TypeScript, Three.js and node:test. Sequential implementation in the shared workspace; preserve concurrent UI, audio and asset changes. No new dependencies or deployment.

## Evidence and scope

The runtime kart is unscaled and measures 2.88 m wide at rest, 3.10 m with steering, and 3.83 m long. `separateCars` only separates centres by 2.1 m. The user confirmed inter-vehicle penetration; changing the vehicle's appearance or its steering rig is outside this repair. An independent diagnostic also checks self-clearance, but those geometry findings are not the reported inter-vehicle bug.

- [x] Add failing reproductions using actual authored/runtime geometry, rear/side/diagonal contacts, tight packs and post-interpolation overlap.
- [x] Introduce `shared/kart-contact.ts`: shared footprint, oriented SAT contact normal/depth, and bounded positional solver. Narrow packs unpack along the road tangent when lateral separation remains constrained.
- [x] Integrate the solver in `shared/race.ts`, preserving equal-mass bounded impulses and environment projection.
- [x] Integrate pose-only collision cleanup in `client/render-motion.ts` and `World.render`. Preserve ghosts/reset/finished semantics.
- [x] Verify steering-envelope containment against both procedural and delivered GLB models, contact regressions, gameplay tests, build and browser flow. Also verified four real network clients. Results and current concurrent-build limitation are in `docs/kart-contact-clearance-2026-09-08.md`.
