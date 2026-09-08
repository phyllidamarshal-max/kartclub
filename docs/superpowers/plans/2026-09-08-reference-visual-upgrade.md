# KART CLUB reference visual upgrade

Selected targets: user-supplied front view `codex-clipboard-2dd86f4e-89c8-4ef1-a5b2-577e3becbbdc.jpg` and rear/coastal view `codex-clipboard-3438e4ca-8dd9-42af-a82d-9506601b17a6.png`. Implement in the existing Three.js game, not a replacement scaffold. The supplied images authorize the chosen visual direction.

Art direction: low, wide lime/pink/lavender karts; rounded gloss helmets with dark wraparound visors and raised ivory stripes; soft ivory suits; charcoal road with fine grain; cream/red kerbs; warm wooden rails; faceted leafy trees, detailed blue-roof cream village houses, wildflowers; turquoise sea, blue sky and warm daylight with soft local shadows. Apply comparable detail and material quality to the other eight distinct worlds, preserving their identity.

Use subagent-driven-development. Ownership:
- Model implementer: `client/kart-model.ts`, relevant model tests. Preserve public factory, names used by World, orientation/physics footprint and resource disposal.
- Coastal environment implementer: `client/scenery.ts` and optional independent environmental details module; preserve exports and clearance.
- UI implementer: `client/reference-ui.css` only; existing markup and language support. Root imports and verifies.
- Root: `client/world.ts`, `client/level-scenery.ts` integration/art polish, design comparison views, validation and report.

- [x] Inspect rendered gameplay and both source views; record differences.
- [x] Upgrade real kart/driver meshes and materials (three visual refinement passes).
- [x] Upgrade coastal foliage, village, sea and sky; refine other worlds through common materials and detail.
- [x] Tune illumination, road materials, camera directions and preview composition with actual WebGL output.
- [x] Apply coherent UI across lobby, career, multiplayer, vault, settings, race HUD and result styles; retain six languages and RTL.
- [x] Build, run model/scene/lifecycle checks and the full suite, and compare actual front/rear renders in combined reference images. Record the reconnect timing retry and remaining fidelity differences in design-qa.md.
- [ ] Pixel-identical reference fidelity: not achieved; rendered lighting, scenery arrangement and fine surface detail still differ. Do not call this a 100% reproduction.

Do not change race physics, AI calibration, economy, multilingual content or save semantics in this visual task. Keep existing uncommitted work. No commit/deploy. Two raster views do not uniquely determine all 3D geometry; match visible proportions and finish rather than claiming identical unseen geometry.
