# Living obstacle model implementation

Implemented in `client/obstacle-models.ts` and integrated into `client/moving-obstacles.ts`.

- Warm original sheep and deer silhouettes: sculpted ellipsoid bodies, layered sheep fleece, deer cream spots and belly, ears/inner ears, highlighted eyes, muzzle/nose, tail, deer antlers, and four articulated hip/knee/hoof assemblies. Shared pose facing controls world orientation; distance stride drives gait. Head turns while dwelling.
- Large pendulum has a round rubber impact body, ochre painted crown, cream bumper ring, rivets and rod socket. Separate overhead portal has painted steel posts, broad feet, braces, beam, axle and a rod pivot driven by shared swingAngle. Rod length comes from shared pendulumLength. No geometry outside the collision radius is parented to the solid obstacle body.
- Portal posts use lateral distance `max(roadWidth / 2 + 4, abs(amplitude) + radius + 2.5)` with bases 1.8m wide and 2.2m deep. This placement contract was communicated to root for scenery exclusions.
- Warnings at 96m and 14m before the crossing use large physical pictograms, with distinct sheep/deer/pendulum silhouettes. Animal zebra stripes and movement guide lines are flush paint with no added colliders. No UI or sound additions.
- Shared primitive geometries and material palette per world; updates allocate no scene resources and alter existing transforms only. Legacy shuttles/sweepers remain supported.

Validation: `npx tsx --test tests/moving-obstacles.test.ts tests/living-obstacle-models.test.ts` passed 29/29 on 2026-09-09. New tests transform every solid vertex through 121 animation samples for every new species, assert radius agreement, resource reuse, real hip/knee and dwelling-head motion, and pendulum rod endpoint agreement with lifted weight center.

Typecheck at implementation time found only existing errors in `client/architecture-joints.ts` concerning geometry types; root was informed. Parent handles full build/review and actual gameplay screenshots. Geometry tests do not establish final visual approval or full playtesting.

## Review corrections

The initial rounded weight could lift entirely above a low kart nose while its 2D collision footprint remained active. Root limited authored pendulum amplitude to 3m; the model now includes a broad lower rubber impact drum (radius .99r, bottom .04r, top .55r) and metal collar. At maximum authored lift the impact drum remains at chassis/nose height.

An inverse clearance regression now binary-searches actual shared collision onset against `createKartModel` at 17 phases and four approach headings for every authored pendulum. It requires vertical overlap with real bumper/nose/chassis mesh bounds and limits horizontal gap to the measured kart nose-outline margin plus drum tessellation/radial margin. The reported 4m approach fixture must actually intersect impact-drum and physical kart mesh boxes without any gap allowance. These are bounding-box tests, not full triangle intersection tests.

Portal feet now sample actual terrainHeight at all rotated corners and center, bury the foot base 15cm below the lowest sample, and extend posts down into the feet. Geometry regression verifies all authored portal feet are grounded and posts reach them.

Updated focused model validation: 8/8 tests passed. Parent owns final full-suite/build and screenshots.
