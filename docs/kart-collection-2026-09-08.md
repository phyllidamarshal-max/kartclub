# KART CLUB premium kart collection — 2026-09-09

Six new cosmetic models are implemented in the existing game: Apex GT, Vesper, Corsa, Aurelia, Tempest and Rallye. Club remains available. Enter **View kart**, select a model, then return to the lobby and start a race. The choice applies immediately and survives browser reloads. No purchases, unlocks, performance stats or new vehicle advantages were added.

## Quality revision

The user's feedback that the first version looked too simple led to a second geometry pass. Thin wheel covers became closed sculpted fender volumes; headlights gained dark lens housings and modeled optics; wheels gained distinct machined spokes; rear decks gained vents, exhaust bores and diffuser fins. Touring, angular, formula, heritage, twin-pod and rally silhouettes have separate body geometry. Garage-only fill lighting and a soft road-following contact patch help inspection. These extra lights switch off when driving.

The original driver, steering pivots, wheel mounts, tire radius and chamfered collision footprint remain unchanged. These are editable procedural game meshes based on the approved concept, not a claim of pixel-identical reproduction of the generated illustration.

## Implementation

- `shared/karts.ts`: seven-model cosmetic catalog and strict ID validation.
- `client/kart-variants.ts`: six complete bodies; models return editable geometry before batching.
- `client/world.ts`: cached templates, independent clones, model replacement and resource disposal. Existing classic GLB and custom-driver loading remain supported.
- `client/kart-garage.ts`, `client/kart-garage.css`, `client/locales/karts.ts`: existing garage selection, saved state, English default and six-language copy. Angle controls and return action stay visible while long model information scrolls.
- `client/main.ts`, `client/network.ts`, `shared/race.ts`, `server/room.ts`: model metadata follows preview, solo, retry, career, corner practice, ghost and multiplayer paths. AI slots use varied models. Simulation inputs cannot change the selected model or inject performance values.

## Verification

| Check | Result |
|---|---|
| Full `npm test` | **622 passed, 0 failed** |
| Production `npm run build` | Passed, including TypeScript |
| Geometry and base-model tests | 22 passed; 17 steering samples spanning ±0.38 radians, unchanged footprint/mounts, finite normals, visible lamps/tread, clone ownership and body/tire clearance checks |
| Integration review | No actionable findings; independent reviewer confirmed metadata, locale and lifecycle paths |
| Cached resources | Lifecycle test covers all seven models, template reuse after instance removal, independent resources and disposal exactly once |
| Actual browser | Selected all six new models, viewed front/side/rear controls, reloaded Tempest selection, entered a solo race as Tempest, paused and returned to the garage with selection retained |
| Runtime errors during browser check | None in the browser error log |
| Layout | 1280×720, 1440×900, 1920×1080 and 2560×1270: no whole-page overflow; garage, view controls, return action, header and footer within viewport |
| Isolated network check | Three real clients: Apex/Vesper/invalid ID became Apex/Vesper/Club across snapshots; model/physics mutation rejected, reset preserved choice |

The initial full run found one stale map-picker test expecting new maps to reuse base-map music. Current delivered music and its dedicated tests require independent map soundtracks. That assertion was corrected to verify dedicated IDs/URLs; the full rerun passed. Audio behavior was not changed in this task.

## Evidence

Actual screenshots and logs are in `output/kart-collection-20260908/`:

- `apex-final.jpg`, `vesper-final.jpg`, `corsa-final.jpg`, `aurelia-final.jpg`, `tempest-final.jpg`, `rallye-final.jpg`: six actual garage captures.
- `apex-front-final.jpg`, `rallye-rear.jpg`: additional detail views.
- `race-tempest.jpg`: actual solo-race HUD and selected model.
- `viewport-checks.json`, `network.json`, `full-test.txt`, `focused-test.txt`, `build.txt`.
- `model-report.md`: construction, geometry checks and measured budgets.

Current cars have 37,864–52,956 triangles including the driver and 24–26 batched meshes, versus 25,508 triangles / 23 batches for Club. Counts describe the vehicle before extra scene and shadow passes. Templates are cached per World; geometry is not rebuilt on every frame.

## Remaining limits

- Production build still warns about a shared bundle exceeding 800 kB; this is not a build error.
- Collision clearance tests sample all vertices and triangle centroids across steering positions; they are not an exhaustive mathematical proof against every possible triangle intersection.
- No frame-rate benchmark on low-end hardware, eight-player latency soak, or full human-driven race with every model was performed. The actual browser check covers model selection and entry/return; deterministic physics and network checks cover separate contracts.
- Mobile-sized layout was not revalidated in this pass. The four requested desktop sizes were checked; long garage descriptions intentionally scroll within their content area.
