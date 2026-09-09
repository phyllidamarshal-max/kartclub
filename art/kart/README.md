# CLUB KART editable asset

Current revision: `club-kart-reference-v3` (2026-09-08). The precision pass broadens the driver shoulders and tailors the continuous sleeves with localized elbow and cuff folds. Gloves have soft knuckles and joined gripping thumbs. The seated chest uses a fitted elliptical section and neutral cloth-recess vertex colors, preserved through the single cloth material batch, GLB export, independent tinted clones and Blender import. The cowl has a broad planar centre with rounded shoulders; the front bumper wraps with rounded return corners. Existing full-face visor, solid short crown, wheel pivots, flat tire tread and low rear assembly remain intact. See `output/reference-match-20260908/kart-report.md` for evidence and limitations.

Original project-authored kart and helmet driver. No downloaded third-party geometry or textures.

`club-kart.blend` contains separated named parts, PBR materials and wheel pivots for direct editing. `club-kart-source.glb` is the unbatched transfer source. The deterministic construction source is `client/kart-model.ts`; runtime batching is `client/kart-batching.ts`.

Runtime coordinates are metres, +Y up and +Z forward. The tyre radius is 0.52 m and its static bottom is y=0.1 m, matching the existing visual placement. Blender import uses +Z up and -Y forward. No collision or driving parameters are derived from this asset.

Each `wheel-front-left`, `wheel-front-right`, `wheel-rear-left`, `wheel-rear-right` mount turns around local Y. Its `wheel-spin-front-left` (and corresponding) child rolls around local X. Mount `userData` / glTF extras store `wheelRadius`, `steerable`, `spinNode`, `axle` and `side`. The driver remains under `driver`; the existing exhaust coordinates are preserved. Tail-flame effects remain owned by World.

Paint and helmet materials carry `kartTint: true`. Runtime cloning owns independent geometry and materials per car. Rubber, polymer, metal, fabric, upholstery and dark coated visor use separate PBR materials. The visor is opaque dark tinted glass; no costly screen transmission pass or textures are used.

Regenerate from repository root:

```powershell
node --import tsx scripts/kart-assets/build.ts
output/blender-runtime/Scripts/python.exe scripts/kart-assets/save_blend.py
node --import tsx --test tests/kart-model.test.ts tests/kart-batching.test.ts tests/kart-asset.test.ts
```

The runtime asset and measured mesh/triangle/vertex/material/byte counts are in `public/models/kart/club-kart.glb` and `manifest.json`. Counts exclude scene lighting, shadows and VFX and are not an FPS claim.

`blender-validation.json` records the installed Blender version, separated-source SHA-256, file size, mesh/triangle/material counts, wheel pivots, and successful reopening of the saved `.blend`. The Windows `bpy` worker can print a memory-release diagnostic during shutdown after saving/reopening; the generated file is reopened before its validation record is written.
