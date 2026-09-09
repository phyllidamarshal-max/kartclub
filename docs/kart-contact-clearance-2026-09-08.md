# Inter-kart penetration repair — 2026-09-08

The user confirmed that wheels and body panels of one kart entered another kart during collisions. The obsolete vehicle collider separated centres by 2.1 m, while the rendered model is 2.88 m wide at rest, 3.10 m wide through steering and 3.83 m long. This allowed roughly 1 m of lateral overlap and 1.7 m of rear/front overlap before the old solver considered contact resolved.

## Changes

- `shared/kart-contact.ts` defines a small-margin convex footprint around the complete kart and tire steering envelope. Contact axes rotate with each kart. Chamfered front/rear corners follow the vehicle more closely than an enlarged circle.
- `shared/race.ts` uses that footprint for car-to-car separation in both solo and authoritative multiplayer. Bounded equal-mass impulses, tangent velocity, collision feedback and drift-charge rules remain intact. Each correction reapplies the existing environment constraint. A narrow three-abreast jam can unpack along the road tangent instead of remaining compressed against a boundary.
- `client/render-motion.ts` separates render-only copies when interpolation or remote snapshot smoothing introduces an overlap between legal poses. `World.render` applies it after interpolation. It does not change authoritative position, heading, velocity, resources, collision counts or race progress.
- Intentional ghost/reset protection and finished-car exclusion retain their existing semantics. Road/obstacle geometry, driving controls, vehicle appearance and the wheel rig were not redesigned. This repair targets inter-vehicle penetration.

## Verification

1. Three regression tests failed before the change: rear contact returned 2.1 m spacing for a 3.825 m body, side contact returned 2.1 m for a 3.103 m steering envelope, and head-on contact intersected both front bumpers.
2. Eight new tests now cover those cases, every vertex of the authored model and delivered GLB at 17 steering/rolling samples, 32 oblique impact angles with non-increasing kinetic energy, six-car packs, an eight-metre corridor, and render interpolation with immutable race state.
3. The contact, existing collision, nitro-collision and interpolation group passed 40/40 tests. The subsequent full suite passed **459/459**, exit 0; see `output/kart-contact-20260908/regressions.txt`.
4. `npm run build` passed with TypeScript and Vite after the physics/render integration. A later build encountered newly added concurrent environment-VFX tests. After the missing environment module appeared, the final recheck still reported two errors in `tests/vfx-environment.test.ts` at lines 97 and 102 (argument/type mismatches). These files were not edited by this repair. See `output/kart-contact-20260908/build-final.txt`; the entire moving workspace is not claimed to be currently build-clean.
5. Browser verification used the actual `World`, loaded runtime GLB, `stepCar`, `separateCars` and rendered transforms. Rear, side, angled and six-car setups all reported zero remaining overlap and were visually inspected. The six-car setup initially contained 15 overlapping pairs. After 180 live physics frames, four collision events occurred and maximum remaining penetration was **0 m**. See `output/kart-contact-20260908/browser-verification.txt`.
6. A fresh local server and **four real Colyseus clients** produced **162 racing snapshots**, **16 collision events**, and **0 m maximum overlap** during 8.05 seconds of legal input. Server test data used a separate temporary directory. See `output/kart-contact-20260908/network.json`; rerun with `npx tsx scripts/verify-kart-contact-network.ts`.

The solver has a fixed 48-pass budget. Verification covers the supported collision scenarios above, not arbitrarily impossible stacks or custom replacement models larger than the standard kart. The geometry-enclosure regression will fail if a later vehicle revision outgrows the shared footprint.

## Actual runtime captures

- [Rear impact](../output/kart-contact-20260908/rear.jpg)
- [Side impact](../output/kart-contact-20260908/side.jpg)
- [Angled impact](../output/kart-contact-20260908/angled.jpg)
- [Six-kart pack](../output/kart-contact-20260908/pack.jpg)
- [180 physics frames](../output/kart-contact-20260908/continuous.jpg)

The repeatable diagnostic page is `http://127.0.0.1:5173/output/kart-contact-20260908/index.html`. It imports the real game modules; the implementation lives in the existing game, not in the diagnostic page.
