# Reference visual upgrade — 2026-09-08

This is a playable visual upgrade of the existing game. It is not a pixel-identical reconstruction of the supplied images.

## Integrated changes

- Real kart geometry: curved bevelled bumpers, sloping nose, rounded tire shoulders, five-spoke hubs, suspension springs, low engine housing, continuous rear seat shell. Rounded helmet and dark visor, ivory stripe, fuller shoulders and bent arms. Lime, pink and lavender retain configurable colors.
- Coast: twelve cream/blue-roof cottages on the inland side, window frames/shutters/flower boxes, larger lighthouse, clustered trees, bushes, stones, modelled flowers and grass; layered turquoise water and cloud shading.
- Eight other worlds: richer material separation and structural detail on containers, cranes, city facades, tanks, solar panels, trees, ice and mine structures. Scene-local geometry sharing and road/shortcut clearance remain intact.
- Lobby now shows the actual 3D scene and three karts. Menu, career, room, vault, settings, result and HUD styles share cream/evergreen/sea-glass colors. Instruments and objectives occupy screen edges. Six language options remain, default English; Arabic RTL was exercised and English restored.
- Correct front/rear preview direction; side camera now stays perpendicular to driving direction, and changing tracks preserves the selected view.
- Static kart details are merged by material within independent driver, steering and wheel pivots. A final built-in kart uses 22 mesh submissions instead of 116 (81% fewer). This is a mesh-count measurement, not an FPS claim. Reflections bake once at 128px (64px for thumbnails).

## Evidence

Live comparison: `http://localhost:5173/output/reference-upgrade-20260908/review.html`. Front/rear controls generate one image containing the source above the actual game renderer. Nine worlds generates a contact sheet from all nine real scenes. Desktop and narrow UI controls embed the actual application at explicit CSS dimensions.

The front/rear combined images were inspected in this conversation; findings drove three kart iterations and two coastal-placement iterations. The nine-world contact sheet rendered successfully. Actual desktop UI was inspected through a 1536×864 iframe; live 783×441 layout, race HUD, track selector, career, multiplayer, settings and Arabic lobby were also inspected. The 406×479 controls are provided for repeatable narrow-layout review; final visual inspection of that exact size and the result modal is not recorded.

- Full suite: 241/242 passed in `output/reference-upgrade-20260908/tests.log`; the reconnect-expiry race-clock assertion failed under parallel load.
- The unchanged reconnect test passed alone (1/1), `reconnect-recheck.log`; no assertion was weakened.
- Final model, batching, coast, lifecycle and i18n checks: 22/22 passed, `final-focused.log`.
- Final TypeScript/Vite build passed, `build.log`. Existing bundle-size warning remains (~1.11 MB before gzip).
- Independent code review identified the two camera issues above; both corrected.

## Fidelity limits

The supplied illustrations have softer global illumination, denser natural ground detail and different track/building arrangements. The real-time version retains a visibly simpler stylized render and is not visually identical. It does not use the reference picture as the racing background. No gameplay, AI calibration, token economy or saves were changed by this visual work. Existing concurrent route/physics changes were preserved.
