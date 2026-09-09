# Living obstacles — first batch

Implemented in the existing game World, shared race simulation, AI and track catalog. The inspection page imports that same World and real driving simulation; its camera is the normal chase camera. Images are browser captures, not generated concept art. No driving controls, kart attributes or new sounds were added.

## What changed and why

| Map | First batch | Driving choice |
| --- | --- | --- |
| Clockwork Works | 3 giant padded pendulums | Read the swing; pass through the centre window or take a wider lane |
| Mine Transit | 2 giant padded pendulums | Keep sight of the head and choose the clear side |
| Orchard Run | 1 walking sheep | A gentle, long-period observation and lane-choice lesson |
| Treetop Divide | 2 walking deer | Combine A/B route choice with faster wildlife crossings |

The harbor and space cargo shuttles remain. Thirteen other maps remain free of moving obstacles. First-batch wildlife is one animal at each crossing, not a full herd. Sheep use a 22-second full cycle; deer 19/21 seconds; pendulums 6.5–8.1 seconds. Animals stop on the verge, turn while stationary, and use articulated legs while crossing. Their motion is smooth and derived from the shared race clock.

New crossing approaches are broad and straight with approximately 96m advance pictogram signs and 14m near signs. Flush painted marks identify the crossing. Every cycle retains a complete passing lane. Crossings avoid starts, route joins and nearby branches. Animal waiting spaces have graded grass landings, tall-fence openings and excluded trees/props. The continuous curb still identifies the road's driving boundary. Pendulum feet extend into actual terrain.

AI considers its intended line, the centre, intermediate lines and both edges at predicted arrival time. It can keep a clear fast line instead of always detouring to an outer edge. Existing collision-resource rules remain in charge of penalties.

## Contact fixes

- Moving obstacle contact now uses the actual kart support polygon instead of a circumscribed kart circle. Animals use fitted rotating capsules, including turning contact velocity.
- First-batch pendulums are low-sweeping weights: maximum lateral amplitude 3m, with a visible broad lower impact skirt. They do not advertise an opening to drive underneath. Inverse geometry tests cover the earlier lifted-weight air-wall case.
- Road-parallel recovery clears animals pressing a kart against the curb, after normal road constraints, without a manual reset.
- The actual World static batching pipeline previously baked obstacle meshes at their initial positions while their collision bodies moved. Moving bodies, legs, rods and indicators now retain dynamic transforms. A regression exercises the real batching method.
- Track/rules record versions advance to `routes-0.8.0` / `kart-rules-0.7.0`, so previous ghosts/records are not treated as equivalent to the new course/contact rules.

## Verification snapshot

- Production build passed, with the existing large-chunk warning (largest JS chunk about 1.21MB before gzip). The inspection script also passed a separate TypeScript check.
- Latest full run: **782 tests, 781 passed, 1 failed**. Log: `output/living-obstacles-full-tests-final.txt`.
- Remaining failure: `tests/coast-assets.test.ts:218`, the assertion `paths.count > 30` for coastal cottage paths. The obstacle work does not change coastal cottage/path generation. This failure has not been marked resolved.
- Shared motion/contact: 29 focused tests; model geometry: 8 focused tests. Course integration covers difficulty distribution, sight distance, passing space, roadside exclusions, full-cycle curb pressure, real batching, ground and fence clearance. After the landing exclusion correction, the combined course/verge suite passed all 25 tests.
- Full regression includes AI completing three laps on all 19 tracks at all three difficulty levels, and four AI completing item races on every track.
- Independent review approved the scoped implementation after both animal-flank and lifted-weight contact findings were corrected. The final static-batching fix was also reviewed.
- Browser: real lobby displays the new pendulum description; Start Race enters a running race and Pause opens normally. Engine inspection's AI passed the factory crossing with `CLEARED`, 155km/h, zero contacts. Orchard inspection also completed with 154km/h and zero contacts; Treetop Divide returned `CLEARED`, 154km/h, zero contacts. These are individual passage checks, not universal no-collision guarantees.

## Viewing

- Interactive inspection: `http://127.0.0.1:5182/output/living-obstacles-20260909/review.html`
- Play the real game: `http://127.0.0.1:5182/?track=factory-shift`
- Actual captures: `output/living-obstacles-20260909/pendulum.jpg`, `sheep.jpg`, `deer.jpg`.

`SHOW CROSSING` freezes the real game scene at the crossing; `ANIMATE` shows the motion cycle; `DRIVE THROUGH` runs the actual AI and driving simulation from the approach. This inspection UI is not added to the player's game menus.

## Limits

This is the first batch, not a complete obstacle replacement for all maps. No multiplayer browser session was run for this batch; authority and prediction use the same shared motion/contact functions and deterministic replay tests. Kart translational CCD uses the integrated heading within each simulation step. Geometry contact tests use the authored support hull and model bounds, not full 3D triangle collision. A few visual silhouettes retain the small conservative margin used by the existing vehicle contact hull.

## Reference principles

[KartRider's publisher update](https://mpopkart.tiancity.com/homepage/article2019/2022/06/27/1369.html) describes theme-specific moving mechanisms such as presses and suspended containers alongside map difficulty ratings. A [contemporary QQ Speed carousel track report](https://games.sina.com.cn/o/n/2010-09-27/1551439915.shtml?from=wap) describes reading moving horses and passing through their gaps. The first-batch designs apply those readable timing and route-choice principles. The pendulum, sheep and deer models are original; these sources do not establish that the referenced games use these exact models or rules.
