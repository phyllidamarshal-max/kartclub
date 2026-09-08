# KART CLUB UI delivery — 2026-09-08

Implemented in the existing TypeScript/Three.js game, served at http://127.0.0.1:5173/. This is a UI implementation, not a separate demonstration page.

## Changes

- Replaced four imported legacy style layers with `client/brand.css`, using the requested color variables, Arial, shared spacing/radii, restrained feedback and reduced-motion support.
- Added `client/ui.ts` for the original logo, shared buttons/dialog shell, modal focus restoration, background inert state and pending button state.
- Rebuilt the lobby around a 340px left panel and live game background. Existing navigation and entry points remain.
- Track setup uses all nine real renderer thumbnails, explicit selected marks, separate race options, scrollable content and persistent actions.
- Settings retain actual values and storage behavior. Audio, graphics, bindings and language are grouped; desktop settings display in two columns.
- HUD retains real rank/lap/time/speed/energy and map bindings. All HUD elements stay at the edges. Canvas map colors read the same CSS variables; driver marker colors retain their actual kart correspondence. Only changing HUD labels are localized during the frame loop.
- Pause, results, career, rewards, test account and multiplayer room use the shared system. Missing service data shows an unavailable state instead of a fabricated zero.
- Default English, with all six existing language choices and saved preferences retained, as explicitly confirmed by the user. Original internal API/storage keys remain intact. System copy uses points/tickets without legacy branding; user-entered names are not rewritten.

## Brand source verification

Original PNG copied byte-for-byte to `public/brand/kart-club-original.png`; both SHA-256 values:

`740678D824D7D7293CB391408EBB9956755484CF5AC77C80D8F3038840D84506`

The image is RGBA, 1254×1254. Nontransparent bounds are `(186,178)-(1068,1076)`. CSS clips only the outer transparent margins; no pixel, color, curve, checkerboard or internal alpha changes. Verified the internal transparent regions show the cream interface behind the logo. The favicon uses the same original image. Intro and outro were inspected from extracted frames at two seconds, preserving the source videos.

## Checks completed

- `npm.cmd run build`: passed; TypeScript and Vite, 121 modules.
- `npx.cmd tsx --test tests/i18n.test.ts tests/level-locales.test.ts tests/minimap.test.ts tests/lifecycle.test.ts tests/controls.test.ts`: **28 passed, 0 failed**.
- 1280×720, 1440×900, 1920×1080, 2560×1270: measured lobby, setup, settings and HUD bounds. No out-of-viewport primary modules, no horizontal content overflow, no HUD module overlaps. Track grid adapts from three to four columns; modal footer stays visible while content scrolls. Measurements are in `output/kart-club-ui-20260908/responsive-checks.json`.
- All nine thumbnail images loaded from real track renders. Track selection updates the active track and selected mark while retaining grid scroll/focus.
- Changed music from 24% to 25%, refreshed, reopened settings and confirmed 25% persisted, then restored 24%. High graphics quality remained selected. Language preference survived refresh.
- Real race launch and accelerator input verified; speed rose to 15 km/h. Rank/time/minimap reflect actual cars. HUD screenshot shows an actual race subsequently at rest, not injected test values.
- Pause froze the timer at `00:42.49`. Pressing W inside the menu kept speed at zero and timer unchanged. Shift+Tab stayed within the pause and result dialog; it selected Return to lobby from the initially focused heading. Closing settings restored the original trigger focus.
- A complete real one-lap race reached its normal DNF result while AI finished; inspected actual classification, result actions and driving summary. New system/AI-name translations are covered by locale regression tests.
- Career showed nine actual challenges and eight locked buttons for the test identity, with no invented progress. Inspected rewards and account values from the local service.
- Created a real free room at port 5173: one actual test driver, seven open slots and the real room code. No tickets or funds were spent. Full multiplayer race regression was not rerun for this UI task.
- No browser console errors were reported in the final development-page check. Existing Three.js shadow-map deprecation warning remains.
- Independent source review found two focus bugs; both were fixed and the reverse Tab case was verified in the running game.

## Actual screenshots

All four final images are unedited screenshots of the running game at 1440×900:

- `output/kart-club-ui-20260908/lobby-1440.png`
- `output/kart-club-ui-20260908/tracks-1440.png`
- `output/kart-club-ui-20260908/settings-1440.png`
- `output/kart-club-ui-20260908/hud-1440.png`

## Limits and concurrent work

- The existing large JavaScript bundle warning remains (about 1.17 MB before gzip). This task did not reduce scene rendering quality or change camera parameters to fit the UI.
- Another user-owned task concurrently changed AI, driving metrics, scene code and career events in the same workspace. Those gameplay changes were preserved; this report does not claim the whole workspace's gameplay hashes stayed unchanged or attribute those changes to the UI work. The UI work styled/localized their newly visible feedback without implementing their physics.
- Port 4173 was used temporarily to inspect a production build without HMR. Its room socket route is not the normal development endpoint, so multiplayer creation was verified at the actual port 5173. The user-facing deliverable remains port 5173.
- Cross-browser, touch-device and complete multiplayer-race regression were not performed in this UI task. The completed checks above should not be interpreted as exhaustive game certification or a pixel-comparison score against a nonexistent complete UI reference image.
