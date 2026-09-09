# Six premium karts implementation plan

> Use superpowers:subagent-driven-development for the bounded model task while root integrates the existing game and verifies the result.

**Goal:** Implement the user's approved six-model concept board, retain the Club kart, and allow preview, selection, persistence and use in actual solo and multiplayer races.

**Architecture:** An immutable shared cosmetic catalog provides seven IDs. Geometry lives in a new editable Three.js module sharing the existing driver, steering and wheel rig. Car snapshots carry a validated optional kart ID; all driving, dimensions and collision rules remain unchanged. The existing garage becomes the selection surface. Templates are built once per World, clones own their GPU resources, and disposal follows existing World lifecycle.

**Tech stack:** Existing TypeScript, Three.js, Vite, Colyseus, node:test. No dependencies, no external purchases, no account economy changes.

**Accepted quality revision:** Following feedback that the first geometry was too simple, replace thin arches with closed sculpted bodywork, visible lens/projector structures and distinct machined rims. Use an engineering ceiling of 60,000 triangles and 32 vehicle batches, while keeping the existing footprint and steering clearance. Final observed maximum is 52,956 triangles / 26 batches. Actual screenshots and full verification are recorded in `docs/kart-collection-2026-09-08.md`.

## Constraints and contracts

- User approved `C:/Users/teery/.codex/generated_images/01a07efd-ce63-78b1-b793-a926039a3030/exec-bcd93336-bd42-43ab-8e19-d850de6ee030.png`.
- Six new IDs: `apex`, `vesper`, `corsa`, `aurelia`, `tempest`, `rallye`; retain `club`. Default new player selection `apex`; absent/invalid simulation metadata falls back to `club` for compatibility.
- `shared/karts.ts`: `KartId`, `KARTS` (readonly id/name/subtitle/description/color/accent), `DEFAULT_KART_ID`, `sanitizeKartId(value:unknown,fallback:KartId='club'):KartId`, `getKart(value:unknown)`, `kartForSlot(slot:number):KartId`.
- `client/kart-variants.ts`: `createKartVariant(id:KartId,driverColor:string):THREE.Group`. Root named `kart-model`, userData.kartId, named driver/steering/wheel rig preserved. Return unbatched model; World batches templates before cloning. `club` returns the unchanged existing procedural model.
- Existing `KART_FOOTPRINT` must contain every visible vertex at full steering sweep ±0.38 radians. Never widen the collision shape to make the model fit. Tires must remain clear of bodywork through steering; retain original wheel radius and mounts and driver pose.
- Pearl/gold Apex GT: flowing body and low lip. Black/silver Vesper: wedge, angular intakes/high wing. Red Corsa: exposed suspension and separate front/rear wings. Forest/gold Aurelia: retro oval grille, round lamps and rounded arches. Cobalt/titanium Tempest: twin nose pods and split rear winglets. Amber Rallye: squared nose, rally lights/protective rails, tread detail. Distinguish shapes, not just colors. No copied badges, no logos/redrawn brand symbol, no physics advantage.
- Default English; localize added copy into existing six languages. Retain warm ivory/forest UI, accessible focus and minimum 44 px controls. No stat bars, unlocks, fake prices or performance claims.
- Work in current authorized checkout. Preserve all concurrent changes; do not reset, stage, commit, deploy or open another user task.

## Task 1 — Catalog and simulation metadata (root)

- [x] Write failing tests for explicit kart selection surviving spawn/reset and identical driving results across models.
- [x] Implement catalog validation and optional `Car.kartId`, with an optional fourth spawn argument. Pass chosen ID through client join options and validate on server seat creation; publish naturally in existing snapshots. Store visual metadata only, never trust client stats.
- [x] Verify malformed input, old snapshot fallback, and deterministic physics equality.

## Task 2 — Six actual 3D bodies (model worker)

- [x] Read the approved image and existing named model/rig.
- [x] Add new `client/kart-variants.ts` with distinct bodywork and PBR materials; share the unchanged driver and wheel rig by constructing the existing model then replacing shell parts before batching. Dispose removed unique geometry/material safely.
- [x] Test all vertices within the established contact polygon at left/straight/right steering, finite normals/bounds, named rig, distinct geometry, no body/tire penetration, independent resource ownership and bounded batched draw calls.
- [x] Write `output/kart-collection-20260908/model-report.md` with actual evidence and limitations. Root owns World integration, main/UI/network/catalog.

## Task 3 — Real garage and renderer integration (root)

- [x] Add focused `client/kart-garage.ts`, styles and locale catalog. Show seven named options with actual model preview, visible equipped state and view angles. Selection applies immediately and persists in `kart-selected-model` with corrupt-storage fallback.
- [x] Bind local preview, solo, retry, career, corner practice and multiplayer to chosen model; show deterministic diverse AI models. Keep ghost appearance coherent without changing recorded driving data.
- [x] Cache generated templates per World, clone independent resources, rebuild a rendered kart when its model ID changes, and dispose templates/clones correctly. Preserve classic GLB loading and existing custom driver behavior.

## Task 4 — Review and acceptance (root + scoped reviewer)

- [x] Inspect task report and independently review integration/collision/resource contracts.
- [x] Run focused tests, full regressions and production build; verify two-client selected model publication.
- [x] Use the actual game to switch six new models, inspect front/side/rear views, persist across reload, start race and return to garage. Capture actual screenshots; compare silhouettes to the approved concept rather than presenting concept imagery as implemented work.
- [x] Record measured results and remaining limits in `docs/kart-collection-2026-09-08.md`.

