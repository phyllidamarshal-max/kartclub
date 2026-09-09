# Dynamic obstacle collection and approach HUD

Implemented directly in the existing Three.js game. The user clarified that HUD means refined 3D models plus approach warnings, not flat replacements for road objects.

## Delivered

- Rotating padded arms: two on City Switchbacks and one on Orbital Interchange. Rotating capsule physics leaves the actual gaps open; AI uses that same capsule instead of treating the arm as a solid disc.
- Rail minecart: one on Mine Transit alongside its two pendulums. Quintic crossing, end dwells, signed wheel travel and fixed rail-facing body.
- Cargo carrier: one on Dockside Divide, retaining its other shuttle. Longer stop windows, rounded collision deck, visible wheel groups and strapped cargo.
- Existing pendulum, sheep, deer, shuttle and sweeper model families refined. Static authored rocks and bollards use a shared grounded detail builder. Model work includes chamfered components, segmented impact pads, bearings, fasteners, cargo seams/belts, wheel hubs, eyes/hooves/wool and distinct roughness/metal materials.
- 16 dynamic encounters across seven maps. All placements retain a complete passing lane, sight distance and separation from route joins. City Switchbacks was chosen after City Factory failed the geometric placement requirements; no road/camera redesign was used to make room.
- One compact approach HUD wired into the real main game loop. Actual type, connected-road metres, movement and advisory current-line risk; English default and all six languages. Hidden for lobby, menus, countdown, pause, finish and reset. Static roadside objects warn only when relevant to the current line.
- Track version routes-0.9.0 and rules version kart-rules-0.8.0 prevent comparison with incompatible recorded runs.

## Validation

- Final `npm run build` passed. Existing >800kB chunk warning remains; largest minified bundle is about1.217MB before gzip. No new fullscreen blur, postprocess, sounds or continuously recreated DOM were introduced.
- Final `npm test`:833passed,0failed. Full output: `output/obstacle-detail-hud-20260909/test-results-final.txt`.
- New AI passage checks:40runs covering every new authored encounter, normal/hard AI and four phases. Every run passed without reset, stall or unresolved capsule overlap.
- Motion covers continuous fast translation/rotation, deterministic clocks and replay; model tests cover fitted vertices, inverse clearance, low kart contact, dynamic batching, wheel exposure and shared resources.
- Review found and fixed legitimate hills losing warnings due to comparing the obstacle with the current kart height. Height is now validated at the anchor; real forest/mine obstacles warn100metres ahead while other stacked decks stay excluded. Independent re-review approved,29HUD/model tests passed.
- Actual browser check: single-player start, pause, resume and return to lobby; live minecart and spinner drive-throughs cleared at154km/h with0contacts; the minecart warning disappeared and the spinner HUD advanced to the next actual arm137metres ahead. Preview uses the actual World, assets, shared driving simulation and production ObstacleHud, with an explicitly labeled inspection start position.
- Layout measurements compare the actual approach-card footprint with the existing game HUD modules at1280×720,1440×900,1920×1080,2560×1270,760×480 and390×844. No out-of-viewport card or intersection with rank, timer, track title, minimap, road-condition or driving instruments in the checked normal-race states. Measurements are stored in `output/obstacle-detail-hud-20260909/viewport-checks.json`. This does not claim every possible long localized career objective or live network scenario was visually exercised.

## Reviewable output

Open `http://127.0.0.1:5182/output/obstacle-detail-hud-20260909/review.html`. It loads the actual game scene and supports selecting all seven currently authored dynamic families, animating them, driving through via the real AI/physics, and opening their game map. The unused sweeper family is refined and tested but no new sweeper placement was invented.

Actual engine screenshots: `spinner.png`, `minecart.png`, `hauler.png` and `narrow-hud.png` in that folder. These are rendered game geometry, not generated concept art. Models retain the game's stylized 3D direction; this is not a photoreal asset replacement. The main game changes are in client/shared, not limited to this inspection page.

No changes to player controls, camera, existing map geometry, ticket/reward behavior or added audio. No publish, stage, commit or destructive git operations. Separate preexisting/concurrent changes in the checkout were preserved.
