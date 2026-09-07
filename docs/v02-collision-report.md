# v0.2 collision upgrade report

Implemented in `shared/race.ts`; regression coverage is in `tests/collision.test.ts`.

## Behavior

- Vehicle contacts use equal-mass normal impulses with 0.04 restitution and a maximum impulse of 24 per contact solve. They transfer rear and side momentum while retaining shared tangent velocity. Collision velocity is reflected into the car's driving speed, and contact feedback is bounded to 0–1.
- Cars retain the existing 2.1 metre contact diameter. Zero-distance overlaps choose a deterministic road tangent, avoiding division by zero and allowing parked cars beside a wall to separate.
- Up to 48 bounded projection passes resolve queues/pileups. Each pair correction reapplies environment constraints, preventing the correction from leaving cars outside the driveable surface.
- Walls remove velocity normal to the wall while preserving the tangent. A direct strike strongly reduces driving speed; a glancing strike permits sliding.
- Circular obstacles use swept movement intersection as well as overlap correction. Even a movement segment that crosses an entire obstacle is stopped on its entry side. Starts inside an obstacle receive a finite outward correction.
- Reset starts exactly two seconds of vehicle-contact immunity. Holding reset does not renew it. Walls and obstacles continue to apply during immunity, as agreed with the integrating agent. Finished cars remain ignored.
- `Car.ghostTime` and `Car.impact` initialize to zero and decay during stepping. Non-finite timestep values are treated as zero.
- Spawn, stepping and separation accept a final optional Track argument. Road constraints use `nearestTrack(...).roadWidth`, including the 7 metre mountain shortcut. Signed progress and checkpoint logic are unchanged.
- At the integrating agent's request, `Input.item` is optional and sanitized as a boolean; this module does not implement item mechanics.

## Verification evidence

1. Tests were added before collision implementation. Initial command `node --import tsx --test tests/collision.test.ts` returned **1 pass / 7 failures**: missing finite ghost state, absent rear momentum transfer, tangent loss at walls, absent reset protection, unresolved boundary overlap, NaN timestep corruption and missing obstacle collision. The finished-car test already passed.
2. First implementation run across collision/race/lap returned **19 pass / 1 failure**. The remaining failure was the Track cache rejecting a cloned Track. The integrating agent fixed nearestTrack to use a full point scan for unregistered Track objects.
3. Four additional coverage cases checked side pushing, a four-car boundary pileup across 100 repeated solves, full-segment obstacle crossing, and custom/shortcut road widths. All passed.
4. After formatting, final command `node --import tsx --test tests/collision.test.ts tests/race.test.ts tests/lap.test.ts` returned **24 tests, 24 pass, 0 fail, exit 0**. This includes all 12 collision tests plus the nine original race and three legal-input lap tests.
5. `npx prettier --write shared/race.ts tests/collision.test.ts` completed successfully. An integration-time `npx tsc --noEmit` reported only concurrent work outside this task: client/world.ts type errors and not-yet-created gameplay/items/ghost modules. The root task owns final whole-suite/build verification.

## Limits and integration notes

The simulation remains an arcade planar circle model rather than rigid-body angular physics. Vehicle contacts are solved at sampled positions; obstacle contacts additionally sweep the full movement segment. The projection solver has a fixed iteration budget to bound CPU work. Tests cover the supported four-car pileup, and do not claim convergence for arbitrarily dense impossible arrangements or overlapping map obstacles. No new dependencies, economy rules, progress rules or client/server files were changed by this task.

## Follow-up: obstacle tangent lock resolved

Physics review identified a real boundary-contact defect: a car exactly tangent to an expanded obstacle retained velocity but was repeatedly placed back at the start by the sweep's zero-time tangent root. A start microscopically inside the circle also entered the penetration recovery branch and lost that frame's escape movement.

Added four regression cases covering tangent/outward movement from exact contact and from `1e-12` metres penetration. Each asserts movement on the first frame, obstacle clearance throughout 60 throttle frames, and departure from the contact point. Before the fix, the collision suite returned **13 pass / 3 failures**; exact outward movement was already correct, while exact tangent and both microscopic penetration cases failed.

The fix treats penetration less than `1e-7` metres as boundary contact, and accepts sweep roots only for inward movement with a strictly positive discriminant. This excludes stationary/tangent contact roots while retaining actual inward and full-obstacle crossing interception. The existing centre-overlap recovery and high-speed sweep regressions still pass.

Final follow-up verification: `node --import tsx --test tests/collision.test.ts tests/race.test.ts tests/lap.test.ts` returned **28 tests, 28 pass, 0 fail, exit 0**. The physics reviewer reported no other concrete findings; their real mountain-obstacle two-car wall test was legal and separated.

## Follow-up: inward contact within the tolerance shell

Further review caught a regression in the first tangent fix: a start `1e-12` metres inside the expanded obstacle moving inward had a slightly negative entry root, which the normal sweep rejected. At boost speed this could project the car onto the far side; a sufficiently high velocity could cross it completely. Added two failing entry-side/velocity regressions for initial velocities 63 and 200. Before the fix the collision suite returned **16 pass / 2 failures**.

Boundary-shell contact now explicitly distinguishes direction. An inward segment beginning within `1e-7` metres of the surface is handled immediately at time zero using the start-position normal. Tangent and outward segments remain free to depart. This preserves the four earlier escape regressions and blocks both new inward cases.

Verification after this correction: `node --import tsx --test tests/collision.test.ts tests/race.test.ts tests/lap.test.ts` returned **30 tests, 30 pass, 0 fail, exit 0** (18 collision + 12 original race/lap tests).
