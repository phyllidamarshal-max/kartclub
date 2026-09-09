# Driver wardrobe implementation plan

> Use superpowers:subagent-driven-development for the bounded outfit-model task while root integrates the existing game. User authorized implementation directly. No additional approval or commit is needed.

**Goal:** Add six distinct selectable driver outfits, eight colors, saved appearance and actual race/network rendering while preserving the seven karts and driving setup.

**Architecture:** Shared cosmetic IDs; independent cached driver templates replace the named driver in an existing cloned kart. Colors update tagged materials without rebuilding geometry. Optional validated metadata travels with Car snapshots. Existing garage gains KARTS / DRIVER tabs, so existing functionality remains reachable.

**Tech stack:** Existing TypeScript, Three.js, Vite, Colyseus and node:test. No dependencies or external asset purchases.

## Global constraints

- Preserve the current seated pose, steering wheel, wheel mounts, driving, physics and KART_FOOTPRINT. No body-size advantage, prices or unlock mechanics.
- Six new outfits: Circuit Pro (`circuit`), Street Shift (`street`), Varsity Club (`varsity`), Heritage Pilot (`aviator`), Rally Guard (`rally`), Pixel Paws (`neko`). Retain Club Original (`club`). Names/descriptions/recommended colors are in shared/drivers.ts.
- Eight colors: lime, coral, sky, violet, red, gold, forest, pearl. Explicit color IDs only, never arbitrary CSS or asset paths from storage/network.
- Outfits must differ in real geometry, including collars, sleeve/cuff details and restrained helmet accessories. Color-only variants do not satisfy the request.
- Default local appearance remains Club Original / Club Lime. Selecting an outfit applies its recommended color; the player may then choose any color. Store both IDs. Old clients with no appearance metadata keep their prior driver and slot palette. Custom imported driver applies to Club Original; new outfits explicitly override it. Disable incompatible recoloring with a truthful explanation when the custom driver is active.
- Reuse the current warm ivory/forest design, default English and six-language translations, 44 px hit areas, selected checkmarks, visible keyboard focus and prefers-reduced-motion.
- Do not edit unrelated concurrent work. Do not stage, reset, commit, deploy or create another user-owned task.

## Task 1 — Catalog, persistence and metadata (root)

- [x] Add shared/drivers.ts and test strict ID normalization, valid storage/restoration, corrupt/blocked storage and no cosmetic effect on deterministic driving/reset.
- [x] Add optional driverOutfit / driverColor fields to Car and optional fifth spawn argument. Pass chosen appearance to solo/career/retry/practice/ghost and to validated server join metadata. Give AI deterministic varied outfits.

## Task 2 — Outfit geometry (model worker)

Own only client/driver-outfits.ts and tests/driver-outfits.test.ts. Requirements are this task plus Global constraints.

Interfaces: consume DriverOutfitId / DriverColorId and getDriverColor from shared/drivers.ts. Export createDriverOutfit(outfitId: DriverOutfitId): THREE.Group and tintDriverOutfit(driver: THREE.Group, colorId: DriverColorId): void. Return an unbatched independent group named `driver`; keep named original torso/limbs and `driver-helmet` group. Tag colorable materials with userData.driverColorRole and never kartTint. Root batches/cache/clones/disposes and handles application integration.

- [x] Read the existing current addDriver implementation and build from the existing base driver. You may extract it from createKartModel, disposing all unused resources while preserving resources still referenced by the extracted driver. Do not edit kart-model.ts (concurrent work).
- [x] Circuit Pro: fitted color-panel racing suit, contrasting shoulder/side piping, zip, glove wrist guards, paired helmet stripes. Street Shift: structured bomber jacket, ribbed high collar/cuffs/hem, diagonal zip, asymmetric sleeve panel. Varsity Club: contrast cream sleeves, knit collar/hem/cuff bands, chest patch (original geometric symbol), helmet side stripe. Heritage Pilot: darker flight jacket, shearling collar, compact scarf ends at chest, seam panels, small brass buckles. Rally Guard: padded shoulders/forearms, utility chest straps/pockets, glove pads, compact helmet brow/vents. Pixel Paws: soft hoodie, modeled hood collar, small rounded cat ears on helmet, compact paw patch/cuffs. Distinct suit shapes must be visible from the existing seated inspection views.
- [x] Preserve base helmet/visor proportions and limb positions. Head accessories stay within |x| <= 0.75, z in [-0.9,0.7], y <= 3.15 (root driver coordinates). Costume fabric inflation <= 0.03 m at sleeves/torso where it could meet kart body/seat; no long cape, large backpack or trailing cloth. Keep hands aligned to steering and no glove growth toward the rim.
- [x] Use cloth roughness and restrained helmet finish, no glow/particles/animated decoration, logos or competitor characters copied. Fit curved surface patches to the real helmet/torso instead of floating flat rectangles. All colorable material names must be unique to driver styling and tintDriverOutfit must preserve authored trim, visor and neutral cloth.
- [x] Tests: seven real outputs, six distinct geometry signatures; original limb/helmet transforms unchanged; all appearance geometry inside KART_FOOTPRINT and stated bounds; finite normals; no outer torso/helmet accessory parts fully buried (raycasts); actual material tint changes with constant geometry; independent clone resources; <=25,000 driver triangles and <=14 batched meshes. Geometry/body clearance is sampled, do not overclaim an exhaustive proof.
- [x] Write output/driver-wardrobe-20260909/model-report.md with measured triangles/batches, test command/result and limitations. Root performs actual browser QA.

## Task 3 — Garage and renderer integration (root)

- [x] Add KARTS / DRIVER tabs to the existing garage. Driver tab has six new outfits plus original, eight named swatches, current outfit/color labels and fixed viewing/return actions. Switching tabs retains both vehicle and appearance choices. Keep scrolling internal at desktop widths.
- [x] Localize all new visible copy to en/fr/hi/es/ar/zh. Preserve default English and language setting.
- [x] Add a focused DriverWardrobe module that caches at most seven templates, clones independent resources, replaces only the driver subtree, retints colors in place and disposes unused resources safely. Avoid per-frame material recreation or unbounded kart × outfit × color template combinations.
- [x] Preserve custom imported driver under Club Original; explicit new outfit uses built-in pose. Keep custom-color disabled state and explanation truthful in the garage.

## Task 4 — Acceptance (root + reviewer)

- [x] Scoped read-only integration review, focused regressions, full npm test and npm run build.
- [x] Three-client network verification for valid/invalid IDs, reset/prediction retention and rejected cosmetic input injection.
- [x] Actual browser check of six outfits, color changes, refresh persistence, switching kart/driver tabs, race entry and pause/return. Inspect front/side/rear, capture real screenshots and layout at 1280×720,1440×900,1920×1080,2560×1270.
- [x] Record sources, screenshots, test counts, limits and measured performance budgets in docs/driver-wardrobe-2026-09-09.md.

## References and design interpretation

- https://popkart.tiancity.com/homepage/guide/guide_character3.html — official character roster; readable Q proportions and distinct identities inform the original outfit silhouettes.
- https://bbs.4399.cn/thread-view-tid-50090322 — QQ Speed official-announcement channel describes outfit detail recoloring; use a bounded in-game color selection with real saved state.
- This design uses original racing/street/varsity/flight/rally/cat-hoodie themes. It does not copy character names, meshes, logos, prices or unlock behavior.
