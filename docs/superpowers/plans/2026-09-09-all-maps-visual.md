# All-map visual standard rollout

The user selected the reference prototype and authorized extending it to all maps. Execute within scene/model/material/UI scope; no event VFX/audio, physics, route control anchors, economy or network changes. Existing car selection work is shared and must be preserved.

## Evidence and direction

19 registered routes, 9 biome profiles. Frozen current sources in `output/all-maps-visual-20260909/baseline`; actual World screenshots at 1280×720, eight identical-position cars per map, rear and existing menu preview cameras, high/low GPU and CPU measurements. The optimized club GLB already loads globally. Extension is scenery quality, not a replacement of every theme with coast.

Visible baseline issues: dark car backs in city/factory/space/mine; sparse dressing on long routes; uniform planar ground; cones in forest; hard unmodulated prop edges; coast meadow detail still limited to custom reference road.

## Implementation boundaries

1. Root: `client/world.ts`, shared new `client/scene-style.ts`, static sky helper integration, lifecycle/batching integration and actual all-map evidence. Preserve all unrelated garage/VFX edits. Palette-derived ambient and sun, common static lighting direction, moderated asphalt/terrain response. No per-frame postprocessing.
2. Foliage subtask: new `client/biome-foliage.ts` and focused tests only. Reuse the verified authored tree GLBs and their materials in forest routes; scene-local ownership, instancing in spatial cells, deterministic all-route safe placements, fixed bounded density, low-quality culling, async failure cleanup. Do not edit World/coast-assets/scenery.
3. Prop subtask: new `client/scene-prop-geometry.ts`, `client/level-scenery.ts` and its dedicated tests only. Beveled main architectural masses and bounded material/geometry improvements; proportionate scene density for long routes. Preserve every existing named landmark, emitter anchor and main/shortcut clearance. No World/shared gameplay changes.
4. Root: extend near-verge static grass/flower/stone surface detail across applicable themes, instance/batch it, preserve ice/space surfaces and gameplay material cues. Scene-local resources, reset/dispose verification.

## Validation

- All19 actual rear/overview screenshots before/after at identical poses and 1280×720. Visually review contact sheets and individual issue cases.
- Same frozen fixtures and GPU machine, high/low, 50 warmup +100 fixed-render samples per route; report CPU submission and GPU cost, not RAF/display FPS. Eight actual cars; event VFX update excluded from both benchmark builds only and restored.
- Existing scene corridor rays, new foliage exact bounds, all-route driving surfaces/road boundary/track immutability tests; relevant asset lifecycle, kart and map selector tests; TS/Vite production build.
- Actual current physics eight-AI drive samples on all19; repeated map switches and finite transforms. Separate claims from full multiplayer/end-to-end race coverage.
- Desktop layout checks 1280×720/1920×1080/2560×1080 for actual map selection and renderer. No mobile claim where unsupported.
- Review page: all19 comparisons, per-map performance, files/source attribution, startup instructions and explicit remaining limitations. Project production World must show assets in normal play, not solely in review harness.

Use dispatching-parallel-agents for the two independent file scopes above while root handles baseline, common renderer and integration. All final render measurements are sequential on one GPU. No blanket repository commit in this dirty shared workspace.
