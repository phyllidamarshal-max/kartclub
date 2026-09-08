# Reference nature kit

Implemented `scripts/scene-assets/nature.py` with the seven requested asset keys. The builder returns geometry only and uses metres, +Z up and origin at ground. No cameras, lights or ground plane are included in its returned assets.

Four separately authored trees use connected tapering trunks and forks, low root flares, and individually rotated and proportioned 80-triangle foliage lobes. Coherent height/orientation-based olive material variation adds restrained warm top planes. Blossom foliage uses dusty rose tones and a narrower crown. Coastal rocks form overlapping fractured shelves, while the meadow uses bent folded blades, stems, cupped five-petal ivory/gold flowers and golden centers. Shrubs are an irregular four-lobe cluster.

## Verified with isolated Blender 4.2 runtime

| Asset | Triangles | Dimensions X/Y/Z (metres) |
|---|---:|---|
| tree-oak | 672 | 3.962 / 2.526 / 7.152 |
| tree-round | 554 | 3.823 / 2.717 / 6.452 |
| tree-slender | 554 | 3.051 / 1.800 / 7.474 |
| tree-blossom | 554 | 3.273 / 2.311 / 6.342 |
| rock-cluster | 160 | 2.924 / 1.918 / 1.742 |
| meadow-patch | 1414 | 2.427 / 2.281 / 0.605 |
| shrub-cluster | 320 | 2.085 / 1.468 / 1.162 |

Fresh validation asserted finite vertices, mesh-only output, material bindings, nonnegative ground bounds, tree height/width limits and triangle budgets. A Cycles 1400×850 preview was rendered and visually inspected at `output/coast-rebuild/nature-preview.png`. The separate preview includes temporary lighting and ground solely for inspection. Final baking, exported material/UV verification and actual runtime comparison belong to the integrating build pipeline.

No external assets or generated imagery used. No changes to common/build scripts, runtime gameplay or world files. No commits.
