# Coastal reference UI implementation

**Goal:** Apply the two user-supplied coastal kart references across the playable application.

**Architecture:** Preserve the existing Vite/TypeScript/Three.js application and its working game state. Add one coastal design layer, use the unaltered supplied artwork for the lobby, and refine real-time scene materials and village architecture separately. The static lobby artwork is promotional and does not represent a live selected-track preview; track cards continue using actual scene captures.

**Constraints:** Preserve all existing uncommitted work, six languages, keyboard bindings, race logic, track geometry, network and simulated economy. No deployment. Source images contain no menu layout, so UI is a derived design and cannot be described as a pixel-identical source UI.

- [x] `client/main.ts`, `client/coastal.css`, `public/art/`: supplied artwork, compact navigation, translucent warm-white menu, forest-green active states, lime primary actions, accessible controls and responsive layout.
- [x] Apply shared tokens to career, multiplayer, vault, setup, settings and results; keep HUD compact and readable against sky and asphalt.
- [x] `client/scenery.ts`, `client/world.ts`, `client/kart-model.ts`: gabled cottages, softer shadows, brighter coastal water, sky environment reflections; release environment resources on scene disposal.
- [x] Run existing tests and production build; inspect actual lobby, setup, career, multiplayer, vault, settings and race/pause at desktop and narrow sizes in the in-app browser.
- [x] Capture evidence, compare supplied art and application in one review page, record actual differences in `design-qa.md`, run local preview.

**Verification:** Full suite 166/166 passed. After the final city-thumbnail camera adjustment, relevant tests passed 26/26 and production build passed.

**Fidelity status:** Original lobby artwork is byte-identical. Complete real-time 3D equivalence remains unachieved: vehicle contours, cloth, foliage, coastal arrangement and rendered lighting differ. This checklist records implementation and verification, not 100% visual fidelity.

