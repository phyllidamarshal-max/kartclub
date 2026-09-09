# Obstacle detail model implementation

Implemented Task 2 in `client/obstacle-models.ts`, `client/moving-obstacles.ts`, `client/static-obstacle-models.ts`, and `tests/obstacle-detail-models.test.ts`.

- Spinner is a long padded capsule with low full-width impact face, separate metal rim, banded arm panels, fasteners and bearing cap. It follows pose facing; it has no solid full-disc skirt.
- Minecart has a low capsule chassis, four reversible wheels with axles/hubs/bolts, riveted panel straps, wood bed and individually oriented ore chunks.
- Hauler has a broad capsule deck with seated wooden freight crates, retaining panels, battens and cargo belts. Wheels reverse without body turns.
- Shuttle and sweeper now have chamfered machinery cowlings, glazed control inset, cooling louvers, lid fasteners, reflectors and detailed axles/hubs. Sweeper adds independently rotating bristle brushes.
- Pendulum retains the tested low impact skirt and rod endpoint agreement, adding reinforcement seams, foundation anchors, post fasteners and gimbal bearings.
- Sheep wool uses smaller, more closely integrated overlapping surface forms. Both animals have recessed eye sockets and split hoof seams, retaining eye glints, articulated ears/head/legs and gait.
- Static builder renders every authored circle at nearest actual road height as a faceted natural boulder or a layered safety bollard. Full low contact bases preserve the visible collision circumference. No new colliders or roadside props are introduced.

Resources use one shared kit per builder, shared rounded primitive geometries/materials, and cached capsule extrusions. Every animated mesh keeps `userData.dynamic=true`, including brush children and pendulum pivots. Frame updates change transforms only.

Validation: `npx tsc --noEmit` passed. `npx tsx --test tests/obstacle-detail-models.test.ts tests/living-obstacle-models.test.ts` passed 14/14. Tests inspect all solid vertices over a full motion cycle for capsule fit, 48-direction impact silhouette support for inverse clearance, kart-height overlap, dynamic flags, resource identity, animated wheel/yaw transforms, static resource reuse and previous pendulum/animal regressions. Root owns full-suite run and real game visual review.

Post-capture refinement: inspected spinner-before.png and added side frame rails, segmented pads, geometric directional chevrons, load brackets/fasteners, end reflectors and bearing races/cap bolts. The rubber core is recessed slightly so fitted outer details remain visible. Hauler cargo belts now wrap crate faces with buckles and plank seams. Detail tests 6/6 and TypeScript pass after refinements.

Undercarriage QA: inspected minecart.png and hauler-1440.png. Both freight vehicles now use a thinner full-footprint bumper with enlarged outboard wheels and visible cream hubs. Wheel positions remain inside the existing capsule through rolling; no collider changes. Added silhouette regressions requiring wheels extend over .2m below and .25m above the bumper. Original low-contact and inverse-support checks remain unchanged. All 14 focused model tests and TypeScript pass.
