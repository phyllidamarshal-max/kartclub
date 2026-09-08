# KART CLUB UI refresh implementation plan

> For agentic workers: use executing-plans for the integrated UI/scene work and subagent-driven-development for the independent localization module. Asset production follows image-to-code.

**Goal:** Implement the approved coastal lobby and racing HUD, unify all existing screens and three scene themes, and support switchable English, French, Hindi, Spanish, Arabic and Chinese.

**Architecture:** Keep the existing Vite/Three.js/Colyseus application. Separate reusable scene assets and UI localization from the gameplay orchestration. Render real 3D scenes; localization never changes physics, account IDs or protocol payloads.

**Tech Stack:** Existing TypeScript, Three.js, Vite, native DOM and Canvas. Phosphor SVG assets for UI icons. ImageGen albedo textures.

## Global constraints

- Selected visual sources: `output/ui-concepts-20260907/01-赛事大厅.png`, `02-比赛界面.png`; full approved spec `设计方案.md` in the same directory.
- Brand: KART CLUB, supplied cutout Logo, `#C0FA67` accent.
- Preserve collision, drift, AI, race timing, checkpoint, multiplayer and simulated economy rules.
- Six languages: `en`, `fr`, `hi`, `es`, `ar`, `zh`. Persist language selection, set document language and direction, support Arabic RTL while driving controls and world coordinates remain identical.
- Keep existing save keys and data. Do not publish or deploy. Work on existing `codex/pons-kart` checkout serving the user's preview.
- No static background substitute for the actual playable 3D environment.

## Tasks

- [x] **1. Visual resources and scene foundations.** Add `public/textures/coast-asphalt.png`, `coast-grass.png`, icon assets through `@phosphor-icons/core`; catalog provenance. Extract procedural render asset helpers into `client/scenery.ts` with `buildLandscape(scene,track,grassMaterial)` and `decorateLandscape(scene,track,random)`. Ensure geometry/material disposal stays owned by World and road UVs use world-space metres. Check build and visual rendering.
- [x] **2. Real coastal scene and kart.** Replace circular island silhouette with terrain following the circuit; add warm directional light, local camera-following shadows, coastal village/vegetation landmarks, textured road, wooden rails and sea detail. `World.render` uses a static three-quarter lobby pose, stable chase camera in races; add public `previewPoint()` and `captureThumbnail()` for real circuit previews. Keep render-quality budgets and existing resource cleanup. Inspect coast and one city/mountain race.
- [x] **3. Six-language catalog.** Independent task in `docs/ui-refresh/i18n-brief.md`; create `client/i18n.ts`, catalogs and targeted tests. Main agent owns integration. Review supported locales, interpolation, safe markup/text treatment, switching and persistence.
- [x] **4. Lobby and global UI.** Update `client/main.ts`, `client/style.css`, `client/icons.ts`: mode cards on first screen, selected real track thumbnail, start/customize actions; consistent header, compact page headings, chapter groups, room seats, results, vault and settings. Add language selector and Arabic layout. All main controls operate existing actions. Verify all pages and modal controls by browser.
- [x] **5. Race HUD and mode states.** Restructure `raceUI()` without losing IDs used by `hud()`: top position/lap/time, lower minimap and speed/energy/nitro inventory, contextual objectives and feedback. All display text localized. Practice/time modes deemphasize rank; item slot only appears for item mode. Check racing, pause, retry, tutorial and completion.
- [x] **6. Theme variation and asset replacement.** City uses layered buildings/street lights/industrial props; mountain uses rock faces, pines, stone rails and distant peaks, aligned with each route. Preserve configured character/scene model overrides and add configurable texture paths with validated defaults. Verify route/terrain alignment and assets on every existing track.
- [ ] **7. Verification and handoff.** Run `npm test`, `npm run build`, appropriate smoke/network checks. Browser-test all six languages on lobby/settings/selection/HUD, Arabic RTL and narrow windows. Compare screenshots with selected designs; record design QA, measured viewports/density and performance samples. Fix meaningful findings, retain actual limitations in report. Leave working preview open.

## Verification criteria

The primary CTA starts the selected existing game mode; track choice is reflected in preview and actual race. Major controls remain visible at desktop and narrow viewports. Six locales have nonempty translations for the catalog and dynamic messages, with meaningful interpolation and unchanged identifiers/user text. World loading and switching produce no console errors, repeated races release old resources, and eight-car benchmark cases remain playable at measured resolution/quality. Final screenshots demonstrate UI layout and real terrain, with deviations from the concept disclosed rather than fabricated as pixel-perfect.

## Handoff status — 2026-09-08

Tasks 1–6 are implemented. Task 7 has passing functional verification (140 tests and production build), browser checks and resource-cycle evidence; the exact visual-fidelity target and a final foreground performance sample remain unverified/open. See design-qa.md and docs/ui-refresh/verification.md for concrete differences and sample validity. Do not report the supplied render as identically reproduced.
