# v0.2 collision review

Reviewed task commit `e092d2d`, `docs/v02-collision-brief.md`, `docs/v02-collision-report.md`, `artifacts/v02-collision-review.diff`, and the current integrating `shared/track.ts` API.

**Final spec compliance: approved. Final code quality/correctness: approved.** Re-reviewed final fix commit `995787f4f857002d0f956374f6c8c54cbb923341`: both findings below are resolved. No remaining actionable finding in the collision task scope.

## Resolved P2 — Ignore non-entering zero-time obstacle sweep contacts

Location: `shared/race.ts:210–215` (position snap at lines 228–229).

The sweep accepts a hit at time zero even when movement is exactly tangent to the inflated obstacle circle. It then snaps the kart back to its previous contact point. Its tangent velocity is retained, so this repeats every frame: the kart remains frozen while its driving speed increases. This breaks the intended sliding behavior and is an obstacle-contact consistency defect. A surface position is a normal result of this solver, so later movement must be permitted when it does not enter the obstacle.

Focused reproduction, run via `node --import tsx --input-type=module -`:

```ts
import { spawnCar, stepCar, EMPTY_INPUT } from './shared/race.ts';
import { DEFAULT_TRACK, trackPoint } from './shared/track.ts';
const p = trackPoint(0);
const track = {
  ...DEFAULT_TRACK,
  obstacles: [{ x: p.x, z: p.z, radius: 2 }],
};
const c = spawnCar();
Object.assign(c, {
  x: p.x + 3.05, z: p.z, heading: 0,
  vx: 0, vz: 20, speed: 20,
});
for (let i = 0; i < 60; i++)
  stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, 1 / 60, track);
console.log(c.x, c.z, c.speed, c.vz);
```

Observed: position remains `(3.05, -100)` with zero displacement after one second, while speed is `35.76231340116538` and tangent velocity is `34.43816388081585`. Expected: the kart travels away along the tangent without entering the obstacle.

Accept entering sweep intersections only; distinguish existing surface contact moving inward from tangent/outward movement, using a suitable tolerance for surface roundoff. Add a regression starting on the surface and stepping through several tangent and outward frames, alongside the existing through-obstacle sweep test.

## Resolved follow-up P2 — Intercept inward movement from a microscopically penetrating surface

Re-reviewed `bc97f04` and `artifacts/v02-collision-fix.diff`. The new penetration tolerance permits tangent/outward escape as intended. Independently ran `node --import tsx --test --test-name-pattern='obstacle' tests/collision.test.ts`: **6 passed, 0 failed**, including all four new boundary cases and both existing obstacle regressions.

However, an inward start `1e-12` metres inside the inflated surface now bypasses recovery, and its mathematically negative entry root is rejected by `time >= 0`. If the frame ends beyond the centre but still inside the circle, endpoint projection moves the kart to the far side. If the frame crosses the entire circle, no hit is recorded. Location: `shared/race.ts:204–215`, tolerance branch and entry-root acceptance.

Reproduction uses the same small obstacle as the existing swept-crossing regression, with ordinary boosted speed:

```ts
const p = trackPoint(0), sx = Math.sin(p.heading), sz = Math.cos(p.heading);
const track = { ...DEFAULT_TRACK, obstacles: [{ x: p.x, z: p.z, radius: 0.1 }] };
const c = spawnCar();
Object.assign(c, {
  x: p.x - sx * (1.15 - 1e-12),
  z: p.z - sz * (1.15 - 1e-12),
  vx: sx * 63, vz: sz * 63, speed: 63, boostTime: 2,
});
stepCar(c, { ...EMPTY_INPUT, throttle: 1 }, 1 / 30, track);
console.log((c.x - p.x) * sx + (c.z - p.z) * sz, c.speed);
```

Observed longitudinal position `+1.1500000000000006` and speed `63`: the kart teleports from the entry surface to the exit surface without slowing. Expected: remain on the entry side and remove inward velocity. With velocity `200`, matching the existing high-speed sweep stress setup, it passes entirely through to `+4.033180525337164`.

Treat inward movement from within the surface tolerance as a zero-time entering contact and retain the entry normal; preserve the newly fixed tangent/outward escape. Add an inward microscopic-penetration regression alongside the four escape tests. Sent the reproduction to the implementation agent.

## Final disposition — 995787f

The final fix explicitly treats inward movement from the tolerance shell as an immediate contact using the starting surface normal. This closes both the far-side projection at boosted speed `63` and the complete crossing at stress velocity `200`, without restoring the tangent/outward lock. The deeper-overlap recovery and full-segment sweep remain intact.

Independently reran `node --import tsx --test --test-name-pattern='obstacle' tests/collision.test.ts` against the final shared worktree: **8 passed, 0 failed, exit 0**. These cover centre-overlap recovery, full-segment interception, four tangent/outward exact/microscopic boundary escapes, and both new inward-speed regressions. The implementation report records **30/30** across collision/race/lap. This final review did not repeat the whole integration suite.

Both review findings are closed. The bounded sampled vehicle solver and planar circle-model limitations described in the task report remain accepted scope limitations.

## Other review conclusions and verification scope

- Equal-mass normal impulses are individually capped and dissipative for finite simulation state. Surface projection removes inward normal velocity, preserving tangent velocity. Position correction does not directly add kinetic energy.
- Reset protection is initialized and decayed, and held reset does not renew it. Finished and protected cars are excluded from vehicle contacts. Signed progress/checkpoint logic is unchanged.
- The solver reapplies environmental constraints after pair corrections and uses the projected road width. A separate focused two-car pressure reproduction between the actual mountain obstacle and outer wall resolved to separation `2.099999954083196` in one call while respecting both surfaces.
- Existing task evidence reports 24/24 collision, race, and lap tests. The full suite was deliberately not repeated in this review; the executable checks above were focused reproductions. No implementation files were changed.
