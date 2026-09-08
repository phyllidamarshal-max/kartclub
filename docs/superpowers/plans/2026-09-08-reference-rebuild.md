# Reference Coast Rebuild Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the independent asset tasks, then root integrates and validates. Existing approved scope is scene reconstruction; do not request approval again.

**Goal:** Produce editable, baked 3D coast assets and replace the current village scene with a reference-directed, playable sample on the actual circuit.

**Architecture:** Blender Python produces three authored cottages and a reusable nature kit with actual bevels, UVs, PBR texture atlases, AO and indirect-light data. A separate Three.js coast asset loader places instances from an editable layout and replaces only the matching procedural layer after successful loading. The renderer and gameplay continue using the same Track.

**Tech Stack:** Existing Three.js/Vite/TypeScript, isolated Blender bpy 4.2 Python runtime, GLB, PNG atlases, Node tests.

## Global Constraints

- Scene work only. Do not modify gameplay, AI, vehicles/characters, track physics, saves, economy or locales.
- Keep existing dirty/concurrent work. No commits, resets, destructive cleanups or deployment.
- All authored Blender assets use metres, +Z up, front toward -Y, origin on ground. glTF export converts to Three.js +Y up and front +Z.
- Public assets: `public/art/coast-rebuild/`; editable sources: `art/coast-rebuild/`; Python scripts: `scripts/scene-assets/`.
- Scene loading must retain the old scenery on a load failure, avoid duplicate replacement meshes, and release loaded resources if its World is disposed while loading.
- All reference comparisons show the real runtime renderer. Any performance values are measurements, not promises.

### Task 1: Editable asset production and baking

Files: `scripts/scene-assets/common.py`, `build.py`, authored `.blend`, GLB and texture sidecars.

Interface for builders: `build_assets() -> dict[str, list[bpy.types.Object]]`. Builders may use direct bpy/bmesh and helpers from `common`: `material(name,color,roughness)`, `box(name,location,dimensions,mat,bevel=0)`, `mesh(name,vertices,faces,mat)`, `beam(name,a,b,radius,mat,vertices=6)`. All returned objects are isolated asset geometry; no camera/light/ground.

- [ ] Install isolated bpy runtime and verify import/export and CPU baking.
- [ ] Implement geometry/material helpers and deterministic UV atlas generation. Preserve authored material detail in baked base-color, normal, roughness and occlusion textures.
- [ ] Bake static indirect light separately from direct sun so runtime lighting does not double the sunlight. Bind sidecar light map through an explicit UV channel.
- [ ] Save editable source assets and export GLBs. Validate bounds, UV attributes, material links and total resource size from exported GLB JSON.

### Task 2: Reference architecture kit

Files: `scripts/scene-assets/architecture.py`; report `output/coast-rebuild/architecture-report.md`.

- [ ] Build `cottage-hero`, `cottage-gable`, `cottage-low` with different silhouettes. Near house includes recessed doors/windows, thick slate roof layers, rounded stone edges, ledges and porch. Restrained warm cream stone / slate blue palette.
- [ ] Build `lighthouse` with layered footing, taper, gallery, railings, glazing and roof.
- [ ] Return objects through `build_assets()`; validate all objects lie near origin and face -Y, make module deterministic, preserve source.

### Task 3: Reference nature kit

Files: `scripts/scene-assets/nature.py`; report `output/coast-rebuild/nature-report.md`.

- [ ] Build `tree-oak`, `tree-round`, `tree-slender`, `tree-blossom` with actual branching and irregular multi-lobed faceted crowns, no overlapping identical spheres/crystals.
- [ ] Build `rock-cluster`, `meadow-patch`, `shrub-cluster` with short-range ground detail and restrained stone tones.
- [ ] Keep roots at ground, widths bounded and scene-local geometry shared when sensible. Export through common pipeline.

### Task 4: Scene loading and layout integration

Files: `client/coast-assets.ts`, `client/coast-layout.ts`, `client/world.ts`, `client/scenery.ts`, `tests/coast-assets.test.ts`.

- [ ] Separate the current coast decorative layer so an asset load can atomically replace buildings/trees while retaining road, grass and coast edges.
- [ ] Read a versioned manifest, load GLBs and light data, preserve material texture channels, instantiate assets from a data layout constrained by main/shortcut road clearance.
- [ ] Test success/failure/disposal, reference geometry bounds and no duplicate overlapping village layer. Use actual materials as batching keys; do not merge incompatible atlas instances.
- [ ] Integrate quality/distance visibility, texture ownership and disposal with World.

### Task 5: Runtime visual inspection and completion

Files: `output/coast-rebuild/review.html`, `docs/coast-rebuild-2026-09-08.md`.

- [ ] Render reference comparisons with front/rear/overview and asset closeup cameras using World; expose clay inspection and a camera drive along the actual circuit.
- [ ] Inspect actual browser frames and adjust authored assets/layout if reference proportions or materials remain visibly wrong.
- [ ] Run TypeScript/Vite build, applicable scenery/road/lifecycle tests and resource checks.
- [ ] Measure a moving runtime pass, record frame times/quality rather than claiming a target FPS.
- [ ] Record implemented scope, actual results and remaining fidelity differences. Leave preview open for the user.
