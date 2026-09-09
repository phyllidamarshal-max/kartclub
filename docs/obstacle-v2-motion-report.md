# Obstacle mechanisms: shared motion and collision

Implemented Task 1 of the 2026-09-09 obstacle-detail/HUD plan.

- `spinner`: fixed center regardless of amplitude, constant angular velocity `2π/period`, heading plus phase and clock angle, no lift or translation. Capsule half-length `.80r`, flank `.20r`.
- `minecart`: endpoint dwells over normalized cycle `[0,.12]` and `[.5,.62]`, with quintic crossings. Capsule half-length `.45r`, flank `.55r`.
- `hauler`: longer endpoint dwells `[0,.20]` and `[.5,.70]`, with quintic crossings. Capsule half-length `.30r`, flank `.70r`.
- Both rail families retain world facing `heading+π/2` while reversing. Their signed wheel travel is `stride=offset+amplitude`. Position and analytic velocity repeat at the period; boundaries are C2 continuous.
- Continuous collision retains the exact kart outline and fitted capsules. Spinner angular error is bounded throughout every interval, including complete revolutions whose endpoint orientations match. Quintic acceleration bounds use each rail family's actual crossing duration. Existing animal motion/contact and static World batching were untouched.

Validation:

- New behavior tests were run before implementation and failed for missing motion/fitted footprints.
- `npx tsx --test tests/obstacle-mechanisms.test.ts tests/moving-obstacles.test.ts`: **44/44 pass**, including all **29** existing tests and **15** new tests.
- New coverage: stationary hits over quarter/full/double spinner revolutions; deterministic replay; signed rail reversals; finite extreme/negative/reset clocks; nonpositive periods; invalid steps; C2 endpoint transitions and analytic velocity; rotated 1000 m/s capsule nose impacts; exact static and moving tangent passes; full-cycle per-tick separation; coincident and overlapping mechanism recovery without velocity changes.
- `npx tsc --noEmit`: passed.

Changed files: `shared/moving-obstacles.ts`, `tests/obstacle-mechanisms.test.ts`, this report. No new public pose fields or collision-contact module changes were needed. Authored placements, renderer, AI, and HUD integration remain owned by their respective tasks.
