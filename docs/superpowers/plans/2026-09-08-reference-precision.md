# Reference precision implementation plan

> For agentic workers: use subagent-driven-development for bounded tasks, with dispatching-parallel-agents only where source and asset files do not overlap.

**Goal:** Reconstruct the supplied two images much more faithfully in actual gameplay assets; do not label visible differences as a completed 1:1 match.

**Architecture:** Existing Three.js World, GLB loading and editable asset builders remain the integration path. Two independent asset tasks handle kart and foliage; root handles real camera correspondence, scene placement, lighting/material response and verification.

**Tech stack:** Three.js 0.185.1, TypeScript, Blender 4.2.23 Python, Vite, WebGL2.

## Global constraints

- User has only two reference images. No original 3D scene, materials, HDRI or camera exists locally; do not fabricate recovery of those unknowns.
- Reference originals: output/reference-replica-20260908/reference-front.jpg (1536×1024), reference-rear.png (1983×793). Previous actual outputs: output/reference-replica-runtime-20260908/after/. AI previews are not evidence.
- Work only on scene, UI and models. Do not edit VFX/audio, shared gameplay/track/collision/network/economy, or user data.
- User delegated the route conflict decision to root. Preserve registered races and construct a separate driveable reference coast circuit from one Track ribbon shared by physics and rendering. Expose it as an art practice view; common model/tree/material upgrades load in standard gameplay too.
- Root-only files: client/world.ts lighting/preview portions, client/coast-layout.ts, client/scenery.ts static sky, new visual lighting helpers, output/reference-match-20260908/* except named agent reports.
- Kart agent only: client/kart-model.ts, scripts/kart-assets/*, art/kart/*, public/models/kart/*, tests/kart-model.test.ts, tests/kart-asset.test.ts and new kart geometry tests. Preserve motion/batching contracts; do not edit loaders/physics.
- Foliage agent only: scripts/scene-assets/nature.py and new nature helper files, art/coast-rebuild/tree-*.blend and corresponding tree runtime GLB/PNG/JSON, public/art/coast-rebuild/manifest.json tree records. Never run a pack/build command that overwrites architecture or all unrelated assets.
- Shared workspace contains other tasks' edits. No reset, wholesale replacement, commit, unrelated refactor or destructive cleanup.
- Capture before/after in actual World at matching camera/size, then compare with original references separately. No bitmap backdrops, generated screenshot substitution or false 1:1/FPS claims.

## Tasks

1. Root baseline and correspondence: freeze current relevant files; run existing verified World; create live isolated lab port 5179; map reference main kart/helmet/wheel/road/shore/house/lighthouse screen landmarks; separate projection errors from asset shape/material errors. Save control data and original-image slider comparisons.
2. Kart precision: read output/reference-match-20260908/kart-brief.md; redesign the remaining simplified forms, material/occlusion separation and reference-visible details; preserve pivots and editable/runtime sync; test actual imported GLB and provide three real views.
3. Foliage precision: read output/reference-match-20260908/foliage-brief.md; rebuild broad asymmetric large crown geometry and substantial forked trunk; re-bake only tree assets; report exact footprints to root, verify source/runtime and silhouette.
4. Root light and composition: inspect sun/sky/environment response against originals, test scene-coordinate direction rather than arbitrary screen light; improve broad reflection and close contact grounding within actual renderer. Calibrate lab projection to main subject footprints; arrange closer front village and side foliage without road encroachment. Existing route curvature remains a known constraint if reference cannot align.
5. Independent visual/code review: separate source diff and actual latest PNG evidence; reviewer identifies remaining failures rather than approving style similarity. Fix concrete defects within file scopes.
6. Regression and evidence: fresh visual/asset/road-clearance tests and build; current 720p, 1080p, wide UI and real model geometry; live race/model motion; matched hardware/viewport CPU/GPU samples, steady resource cycles. Publish real images and measurement residuals. Pixel-level 1:1 stays unverified unless evidence genuinely establishes it.

## Progress

- Baseline source and relevant runtime assets copied to output/reference-match-20260908/baseline. Existing verified World opened before changes.
- Task 2 / 3 briefs written; root starts correspondence while independent asset work runs.
- User confirmed there are no original 3D assets, only the two images.

## Integration and evidence — 2026-09-09

- The user delegated the route decision. Added a separate driveable reference circuit using the common Track / physics / World interfaces; registered race routes remain unchanged. The reference entry is included in production build and reachable from the lobby footer.
- Integrated final kart v3, four tree assets, static sky, owned visor reflection, fitted photo cameras, headland village and bounded high/low-quality dressing. Both tree boxes were fitted using actual GLB vertices; full pixel equivalence is not claimed.
- Independent review found terrain support, disposal, resize and loading-state defects; those were fixed and verified. Current relevant tests: 99 passed, 0 failed. Production build passes with the existing large shared-chunk warning.
- Final 720p/1080p/wide screenshots, native-resolution reference images, same-camera kart comparison, CPU/GPU batch measurements, ten lifecycle cycles and current-physics AI recording are archived under output/reference-match-20260908.
- Strict 1:1 acceptance remains unmet: road convergence, some architecture placement/detail, kart forms and overall shading differ. The review page and report identify these residuals, and do not substitute concept art or original-image overlays for the runtime scene.
- Main record: docs/reference-match-2026-09-09.md. Fixed review: http://localhost:5180/evidence/review.html. No commits, VFX/audio changes or unrelated gameplay changes were made by this visual pass.
