# Driver wardrobe — implementation and verification

The existing game now has six additional driver outfits and eight selectable color themes. Open **GARAGE → DRIVER** from the lobby. The original cream driver remains a seventh option. Kart, outfit and color choices persist independently in browser storage; the selected appearance is used in solo racing, career starts, practice restarts, ghosts and multiplayer joins/rematches. AI drivers receive deterministic varied outfits. No cosmetic data affects driving or collision parameters.

## Outfit collection

| Outfit | Main authored differences | Default color |
|---|---|---|
| Circuit Pro | Racing shoulder panels, seams, wrist guards, paired helmet stripes | Racing Red |
| Street Shift | Bomber sleeves, ribbed cuffs/collar, diagonal zip, rear yoke | Soft Violet |
| Varsity Club | Contrast sleeves, knit bands, diamond stitching, helmet side bands | Sky Blue |
| Heritage Pilot | Darker flight-jacket cloth, shearling-style collar, short scarf, brass details | Amber Gold |
| Rally Guard | Shoulder/forearm protection, glove pads, pockets, rear harness, helmet vents | Forest Green |
| Pixel Paws | Hood folds, rounded cat ears, drawstrings, paw stitching, elbow/cuff panels | Coral Pink |

All six can also use Club Lime, Pearl White and any of the other listed colors. Selecting an outfit applies its recommended color; selecting a swatch then overrides that color. Club Original recolors the helmet and retains its original cream suit. When an imported custom driver is active, Club Original retains it; incompatible recoloring is disabled with an explanation. Choosing any new built-in outfit enables recoloring.

## Implementation

- Shared allowlisted cosmetic IDs in `shared/drivers.ts`; optional `Car.driverOutfit` / `Car.driverColor` fields validated on server join. Legacy clients without these fields preserve their prior appearance.
- Existing garage gains accessible KARTS / DRIVER tabs, seven outfit options, eight named swatches, selected checkmarks and front/side/rear inspection. Short viewports scroll the selection content while retaining viewing and return controls. Only the garage inspection framing focuses the driver; gameplay cameras remain unchanged.
- Six-language catalog: English, French, Hindi, Spanish, Arabic and Chinese. English remains the default.
- `DriverWardrobe` caches at most seven geometry templates, replaces only the driver subtree, and changes existing material colors in place. Each instance owns its cloned geometry/materials. Shared kart materials and borrowed coastal reflection textures are released safely.
- Surface details follow the current seated model. Screenshot inspection caught jagged sleeve and helmet patch edges; exact polygon clipping and complete sleeve cuff rings fixed them. Code review caught a reflection lifetime/name mismatch; both were corrected and independently rechecked.

## Evidence

- `npm test`: **711 passed, 0 failed**, final suite after the geometry and reflection fixes. See `output/driver-wardrobe-20260909/tests.txt`.
- `npm run build`: **passed**, including TypeScript. See `output/driver-wardrobe-20260909/build.txt`. Vite still reports an existing large shared chunk above the 800 kB warning threshold.
- Focused driver + World lifecycle suite: **48 passed**. Covers all seven real model outputs, six distinct geometry signatures, preserved pose and footprint, tint/resource independence, storage failures, keyboard markup, six-language strings and exact physics equality across a 240-frame driving/reset sequence.
- Isolated three-client server verification: valid appearances synchronized to every client; invalid IDs fell back to Club Original/Lime; cosmetic and speed fields injected through input did not mutate authoritative state. All three clients moved, acknowledged input beyond the reset packet and actually entered reset. See `output/driver-wardrobe-20260909/network.json` and `scripts/verify-driver-selection-network.ts`.
- Actual browser: selected every outfit, inspected front/side/rear, changed Pink to Blue without changing the outfit or kart, changed Rallye to Apex, refreshed and verified both the outfit/color and kart remained selected. Arrow keys switched tabs with focus restoration. The bottom original outfit remained clickable after scrolling at 1280×720. Entered a six-driver solo race with the selected pink cat outfit and varied AI outfits; opened pause and subsequently observed racing resume. Return from garage to lobby was checked.
- Actual DOM measurements at **1280×720, 1440×900, 1920×1080, 2560×1270**: no horizontal document overflow; all garage panels stayed inside the viewport; minimum interactive control height was 44 px. Selection content scrolls when needed. See `output/driver-wardrobe-20260909/layouts.json`. Viewport overrides were reset after checks.
- Six outfit screenshots, front/rear, alternate color, in-race and responsive captures are linked in `output/driver-wardrobe-20260909/review.html`. These are game captures, not generated concept art.

## Rendering budget and limits

New outfits measure **11,009–13,794 triangles** and **8–10 batched meshes per driver**. Recoloring does not rebuild geometry or material objects. Complete measurements and geometric sampling limits are in `output/driver-wardrobe-20260909/model-report.md`.

This is not a GPU frame-time benchmark across hardware. Fit/visibility tests and the inspected views do not prove every attachment is visible from every angle or every possible mesh pair is disjoint. Custom imported-driver compatibility was checked through the renderer contract; no external character asset was imported during browser acceptance. Network testing was three local clients and a short race/reset sequence, not a full internet race or device matrix. Full career completion, multiplayer rematch and race-to-lobby return were not manually replayed for this cosmetic change.

## Reference interpretation

- [KartRider official character roster](https://popkart.tiancity.com/homepage/guide/guide_character3.html): readable Q proportions and character identity informed the outfit silhouettes.
- [QQ Speed outfit recoloring announcement on the 4399 official-announcement channel](https://bbs.4399.cn/thread-view-tid-50090322): configurable outfit colors informed the saved outfit/swatches interaction. This is a third-party-hosted announcement, not a Tencent-hosted page.

The implementation uses original clothing geometry and symbols. It does not copy competitor characters, assets, badges, unlocks or prices.
