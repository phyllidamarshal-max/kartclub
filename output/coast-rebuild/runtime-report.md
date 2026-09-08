# Coast runtime asset loading and layout

Implemented in `client/coast-assets.ts`, `client/coast-layout.ts`, with six focused tests in `tests/coast-assets.test.ts`.

## Integration API

- `loadCoastAssets(track, options?)` resolves a detached Group named `coast-authored-assets`; caller atomically replaces its procedural decorations only on success.
- `disposeCoastAssets(group)` is idempotent, removes the group from its parent, releases unique owned texture/material/geometry/instance buffers, and closes owned bitmap images once. Caller uses it on a late completed load when its World is already stale/disposed.
- `updateCoastAssets(group, cameraPosition, lowQuality)` updates cell visibility/shadows. Meadows/shrubs use shorter distances; distant architecture remains visible.
- `options` can inject fetch/GLTF/texture loaders and layouts for browser-free tests. `externalResources` protects borrowed textures, geometries, materials or bitmap images from destruction.

Manifest path defaults to `/art/coast-rebuild/manifest.json`. Required records cover all eleven architecture/nature keys. Relative model/indirect URLs resolve beside the manifest. Version, required records, UV0/UV1, and presence of meshes are checked. Existing GLB atlas textures and channel choices remain intact; indirect light uses channel1, flipY=false, LinearSRGBColorSpace and intensity0.45; AO intensity is0.55. Runtime sun remains owned by World.

Each load is its own resource transaction, with no cross-World decoded cache. Both model and texture loads use allSettled; a failed transaction waits for late resources to settle and then cleans them before rejecting. A permanently pending network request therefore delays transaction rejection until the underlying loader settles; there is currently no timeout/abort adapter.

Source mesh transforms are preserved as placementMatrix × source.matrixWorld. Instances are grouped by 90m cell, asset, exact geometry and exact material identities, and retain material arrays. Geometry/material instances are shared, not cloned per placement. Group userData exposes version, asset count, placement count, batch count and cell size.

## Layout

Actual DEFAULT_TRACK layout currently contains 465 placements:

| Asset | Count |
|---|---:|
| cottage-hero | 2 |
| cottage-low | 3 |
| cottage-gable | 3 |
| lighthouse | 1 |
| tree-oak | 32 |
| tree-round | 32 |
| tree-slender | 31 |
| tree-blossom | 33 |
| rock-cluster | 78 |
| shrub-cluster | 65 |
| meadow-patch | 185 |

Eight cottages span the requested .20–.32 progress region, on road left with fronts toward the road and varied setbacks and scale. Blocked candidates try deeper setbacks; the ninth candidate still lacks safe space and is omitted. Lighthouse is ahead at .335. The actual track is approximately790m, so that progress region spans about90m, not180m; requested track progress/location was prioritized without changing Track.

Nature continues around the whole circuit. Tree scale is0.8–1.07. Outer tree crowns stay inside the grass edge using `coastalShoreMargin`; shoreline rocks share that edge and vary elevation/scale. Ground patches exclude building footprints. Every placement passes `roadsideClear` with a circumscribed footprint plus0.5m, covering both main and shortcut ribbons. Footprints were adjusted using the available exported asset bounds. Buildings and vegetation sit at y=-0.18; shoreline rocks descend below the grass edge.

## Verification

- `npx tsx --test tests/coast-assets.test.ts`: 6 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- Tests cover source transforms/material channels, batching, failure with late resources, idempotent stale-World disposal, borrowed textures, incompatible materials, full-footprint road and building clearance, and quality/distance visibility.
- No gameplay, World, scenery or main files edited by this runtime subtask.
- Browser visual comparison, actual GLB loading in renderer, actual draw-call/frame-time measurements and World lifecycle integration remain with the parent integration task. Counts above describe the data layout, not measured renderer performance.
