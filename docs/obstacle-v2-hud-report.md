# Obstacle approach HUD — Task 3

Implemented `client/obstacle-hud-state.ts`, `client/obstacle-hud.ts`, `client/obstacle-hud.css`, `client/locales/obstacles.ts` and `tests/obstacle-hud.test.ts`.

## Integration

Instantiate `new ObstacleHud(host)` once. Call `update({ car, track, clock, active, paused?, countdown? })` using the actual local/spectated Car, Track and shared race clock. The component hides for inactive race, pause, countdown, absent car, finish, resetTime or resetHeld. Call `destroy()` on permanent teardown. Updates reattach the existing element when the application's host content has been replaced. Import the CSS after existing HUD styles. Merge `OBSTACLE_CATALOG` into the i18n catalog.

## Behavior

One forest-green, cream-text warning sits on the left above the minimap, away from the central kart and right-side item panel. Compact per-kind SVG glyphs cover all eight moving kinds and static road obstacles. The warning gives road metres, present motion direction and advisory WATCH / ON YOUR LINE status. No sounds, input handlers, live-region frame announcements, or animations. The same nodes persist and text only changes when the displayed value changes. Six-language entries cover all text.

The pure selector follows the kart's continuous route projection, cached connected polyline road distances and actual branch. It suppresses passed anchors, anchors beyond 160 metres, wrong headings, other elevations, other branches and distant hairpin legs. Shortcut distances use actual shortcut metres, and a shortcut can see upcoming main-road objects after its connected exit. Static circles appear only when relevant to the current lateral line. Dynamic risk evaluates shared `movingObstacleClearance` with the shared future pose at five samples spanning arrival ±0.3 seconds, including spinner capsule rotation. ETA assumes continuing current road-forward speed (minimum estimate 5 m/s) and current lateral line; WATCH is advisory, never a promise of safe passage.

## Validation

`npx tsx --test tests/obstacle-hud.test.ts`: 12 tests pass. Covers nearest/passed/distant, heading/elevation/reset/finish/invalid clock, static roadside suppression, arrival-clock risk and motion direction, spinner directional capsule, minecart/hauler poses, wrong branches, hairpin, shortcut metres and exit continuity, fixed DOM/text writes/host reattachment/lifecycle/disposal, and complete six-language entries.

Visual integration and viewport screenshots are owned by the root integration task. No existing main/UI/i18n/VFX files were edited by this subtask; no git operations were performed.

## Review correction

Height validation now compares each moving obstacle's authored height against the connected road at its anchor. Comparing with the kart's current elevation incorrectly suppressed legitimate uphill/downhill warnings. Branch selection and connected distance still reject other stacked decks. Added failing-before/fixed-after regressions for both slope directions and actual forest-ridge / mine-transit obstacles 100 metres ahead, plus stacked-deck coverage. All 15 HUD tests pass. Desktop card width is now 230px with 14px obstacle name, 12px detail, 10px risk and 9px muted eyebrow; the narrow layout retains its compact footprint.

Fallback accent now uses #CBF06B. Existing brand road-condition rules occupy bottom 216px on desktop, 192px at medium widths, and 144px on narrow/short screens. The obstacle card now sits above this condition label at bottom 280px / 254px / 216px respectively. Root owns the final integrated viewport checks. TypeScript validation passes.
