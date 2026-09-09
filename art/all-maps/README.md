# Editable scene-prop catalog

`scene-props.blend` is an editable snapshot of eight representative prop groups produced by the actual `decorateLevel` runtime builder. It contains the original separated mesh parts and materials, arranged in a four-column, two-row grid with 32 m spacing. The Blender Outliner has a collection for each biome and a named `catalog-*` parent for moving the complete prop.

The authoritative game sources remain `client/level-scenery.ts` and `client/scene-prop-geometry.ts`. The game continues to generate these props from TypeScript. It does **not** load `public/art/all-maps/scene-props.glb`; that GLB is the portable source-preview catalog used to produce this Blender file, not duplicated gameplay payload. Editing the Blender file does not update the runtime builders, and regenerating replaces the snapshot.

This is eight selected examples from the eight non-coast themes. It is not a one-to-one archive of every prop, biome variation, map, route, authored tree, or coast asset.

## Included examples

Each selection is the first existing group with the specified name, generated with random seed 741. Dimensions are width × height × depth in metres, after removing the route heading. Exported vertices include the flat-normal conversion described below.

| Grid | Biome | Runtime track / group | Mesh parts | Exported vertices | Triangles | Materials | Dimensions (m) |
|---|---|---|---:|---:|---:|---:|---|
| Row 1, column 1 | Harbor | `coast-harbor` / `harbor-container-yard` | 77 | 2,160 | 1,020 | 6 | 7.000 × 12.900 × 12.000 |
| Row 1, column 2 | City | `city` / `city-neon-block` | 82 | 2,964 | 1,144 | 6 | 13.000 × 39.832 × 14.025 |
| Row 1, column 3 | Factory | `city-factory` / `factory-machinery` | 30 | 857 | 412 | 5 | 12.000 × 23.000 × 13.000 |
| Row 1, column 4 | Space | `city-nightshift` / `space-route-dressing` | 15 | 616 | 280 | 5 | 13.600 × 5.800 × 13.600 |
| Row 2, column 1 | Desert | `coast-breakwater` / `desert-route-dressing` | 3 | 372 | 124 | 2 | 7.871 × 6.924 × 7.595 |
| Row 2, column 2 | Forest | `mountain` / `forest-route-dressing` | 7 | 270 | 90 | 4 | 7.871 × 2.556 × 7.595 |
| Row 2, column 3 | Ice | `mountain-pass` / `ice-glacier-wall` | 2 | 288 | 96 | 2 | 6.950 × 9.302 × 11.178 |
| Row 2, column 4 | Mine | `mountain-summit` / `mine-ore-cart` | 29 | 1,120 | 484 | 7 | 3.420 × 2.827 × 6.000 |

Total: **245 mesh parts, 8,647 exported vertices, 3,650 triangles, 35 shared geometries and 37 materials**, with no textures. The materials are the selected groups' scene-local materials; this combined catalog is not a single runtime level budget. The GLB is 166,304 bytes and the Blender file is 2,070,924 bytes in this snapshot. Detailed per-prop bounds, original transforms, counts, source hashes and artifact SHA-256 values are in `public/art/all-maps/manifest.json`.

## Conversion and editing

- Mesh positions, silhouettes, local part transforms and material PBR values come from the actual runtime groups. No replacement geometry or third-party assets were introduced for this catalog.
- Runtime group translation and route yaw are removed. Each prop is centered horizontally and grounded at its lowest mesh point, then placed in the catalog grid. All other part transforms remain intact. The harbor example includes its actual below-quay support foundation, which is visible when isolated.
- Three.js `flatShading` is a material instruction that glTF does not store. The exporter expands those mesh indices and computes face normals so that the GLB retains that faceted shading. It preserves triangle counts and bounds. Smooth-shaded meshes retain their original normals.
- The GLB uses metres, +Y up and +Z forward. Blender's importer converts this to metres, +Z up and −Y forward. The saved viewport shows material colors without requiring a render.
- Material and lighting appearance in another viewer can differ from the game's renderer. This catalog does not contain World lighting, terrain, roads, batching, gameplay colliders, VFX, audio or camera behavior.
- Parts are intentionally separated for editing. Runtime static batching remains in the game and is not replicated in this source catalog.

## Regeneration and verification

From the repository root:

```powershell
node --import tsx scripts/all-map-assets/export-props.ts
```

This uses installed `three`/`tsx` dependencies and the existing `output/blender-runtime/Scripts/python.exe` bpy worker. The verified worker version is Blender **4.2.23 LTS**. No new packages, assets, browser session, GPU render or external download are needed.

The script checks finite attributes and transforms; non-overlapping catalog bounds; per-prop geometry/material budgets; unchanged triangle counts and local dimensions; a Three.js GLB load round trip; and Blender save/reopen. It verifies all eight Blender prop mesh counts, triangle counts and bounds against the exported GLB, accounting for axis conversion. The generated manifest records those checks and artifact/source SHA-256 values.

Files delivered:

- `scripts/all-map-assets/export-props.ts` — repeatable export and validation script.
- `public/art/all-maps/scene-props.glb` — portable editable preview catalog, not loaded by the game.
- `public/art/all-maps/manifest.json` — provenance, counts, bounds, hashes and validation.
- `art/all-maps/scene-props.blend` — reopened and validated Blender catalog.
- `art/all-maps/README.md` — this documentation.

Geometry and materials are original project-authored content. No third-party art assets were added.
