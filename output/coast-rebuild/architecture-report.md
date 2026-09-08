# Reference architecture kit — 2026-09-08

## Deliverable

`scripts/scene-assets/architecture.py` exposes `build_assets() -> dict[str, list[bpy.types.Object]]` with `cottage-hero`, `cottage-gable`, `cottage-low`, and `lighthouse`. All returned objects are visible source geometry. Cameras, lighting, UVs, baking and export are owned by the integrating pipeline. No gameplay/world/common module changes were made by this task.

Both supplied reference images were visually inspected. The kit follows their cream limestone, blue slate, dark timber window divisions, simple steep gables, restrained dressed-stone accents and compact entrance shelters.

## Architecture

- Hero: 6.2m wall width, two storeys, steep forward-facing gable, separate stone lintels and sills, timber-planked recessed entrance, three entrance steps and posted canopy. Substantial eaves and staggered individual slate geometry catch light at road distance.
- Gable: narrower 4.85m wall width, deeper 6.6m footprint, centred entrance and upper window; clear steep silhouette without the hero porch.
- Low: 7.35m wall width with a lower roof, off-centre entrance shelter and raised secondary wing roof. Its wider/shorter asymmetric mass breaks repetition.
- Lighthouse: 16.84m tall tapered shaft, stepped base, oxide lower band, shaft window details, supported gallery, actual open annular gallery rails, sixteen balusters, twelve-sided dark glazing, metal framing, oxide lantern cap and finial.

Facade and side walls are meshes built around actual rectangular openings, with 24cm reveal depth. No opaque building boxes hide behind the cottage windows. Grid vertices are welded and face normals recalculated. All small stone and timber bevels are applied one-segment geometry to retain the triangle budget. Roof tiles are individual closed prisms with deterministic row staggering and small thickness variation. Stone, slate and wood have Principled-based generated-coordinate procedural color/bump variation for the parent baking pipeline.

## Verification

The complete four-asset builder ran successfully under bpy 4.2.23 LTS. First measured geometry (before removing a few stones near side openings and changing gallery rails to proper annuli):

| Asset | Source objects | Triangles | Bounds minimum | Bounds maximum |
| --- | ---: | ---: | --- | --- |
| cottage-hero | 386 | 10,440 | (-3.536, -4.530, 0) | (3.536, 3.450, 8.360) |
| cottage-gable | 303 | 8,600 | (-2.866, -4.880, 0) | (2.866, 3.800, 7.540) |
| cottage-low | 430 | 9,660 | (-4.083, -4.130, 0) | (4.083, 3.050, 5.223) |
| lighthouse | 57 | 2,964 | (-2.020, -2.265, 0) | (2.020, 2.020, 16.840) |

Final counts should be taken from the integrating export manifest. All geometry roots at Z=0, is located near the local origin, and front doors face -Y. Repeated constructions use fixed random seeds. Final module passed Python compilation after the seam welding and relief exclusion refinements.

`architecture-hero-source.png` is a 900px Cycles source inspection with neutral studio lighting. This is an asset construction preview, not the required runtime/reference comparison. It verifies silhouette, roof depth, window recesses, timber divisions and porch. It predates the final side relief exclusion and wall seam weld.

### Final corner-shadow correction

Root review correctly flagged continuous black strips at the front corners and rear right edge. All four hero wall meshes measured zero boundary edges and zero nonmanifold edges after seam welding; exterior corner ray tests hit solid wall faces. The cause was overlapping coplanar exterior surfaces where the 24cm-thick side walls extended through the front/back walls. Procedural bump shading against those overlaps caused the black shadow strips. Side wall length is now `depth - 0.48`, meeting the front/back walls at their inner edges with no overlapping exterior area. This fixes all cottage variants through their shared builder.

`architecture-hero-final-check.png` is a new 750px, 16-sample CPU Cycles render after the correction. Visual inspection confirms the continuous black corner strips are gone while window recesses, stone relief and slate layering remain. The final hero construction and render both completed successfully. Source writes are finished and the asset is ready for parent atlas baking.

## Integration notes

The source is intentionally split into named parts for editability; the parent pipeline should join by asset for atlas baking/export and runtime batching. Shared material names accept the common helper's linear RGBA interface. Generated texture coordinates must be baked while preserving their authored per-object placement. Lighthouse glass is opaque stylized dark glazing, which avoids transmission/baking incompatibility; shaft window details are surface-mounted while cottage openings are true mesh holes. No UVs, baked textures, GLBs or runtime appearance claims are part of this bounded task.
