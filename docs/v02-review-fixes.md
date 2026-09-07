# v0.2 final review fixes

Resolved the three P2 findings in `docs/v02-final-review.md` and the immutable-track contract note.

- World replacement explicitly releases instanced mesh buffers and all light shadow render targets before renderer disposal. Resource sets deduplicate shared geometry/materials/textures, including the unattached custom-driver template. Disposal is idempotent and clears retained world references. Both asynchronous model-load paths discard and release a model arriving after disposal; invalid character dimensions also release their loaded resources.
- The career page now displays an accessible, labeled “经典挑战历史” section backed by `pons-progress`, with the three original challenge names, best times and drift totals from those runs. The home completion badge distinguishes classic records from new career completion. Original bytes remain untouched and no classic result grants a new career star or unlock. Invalid stored records are ignored safely.
- The in-race minimap paints the mountain shortcut from the shared definition as a narrower amber open branch. Route and car markers use the same projection. The drawing routine is extracted into `client/minimap.ts` so tests exercise actual canvas commands rather than source text.
- Public Track/Point fields and nested collections are readonly. Finished singleton definitions, points, shortcuts, obstacles and the registry array are frozen after construction and before building spatial indexes. Legacy default exports remain identical; explicitly cloned custom track definitions still work. Per the user's subsequent difficulty request, the city road is now 14 units wide and mountain road 12; coast remains 18 and legacy coast remains 16.

## Verification

Regression-first checks reproduced mutable singleton writes, missing instance/shadow disposal, late asset attachment, absent classic-history records and a minimap with no shortcut. The nine focused regressions now pass:

`npx tsx --test tests/career-history.test.ts tests/minimap.test.ts tests/world-lifecycle.test.ts tests/track-immutability.test.ts`

Tests listen to real Three.js resource disposal events, defer the GLTF loader at its asynchronous boundary, inspect returned history data/rendered markup, record minimap path commands and car coordinates, and attempt nested runtime mutations followed by projection checks. They do not inspect implementation source strings.

A broader covering run across collision, tracks, lifecycle, race, recovery and lap tests passed 44/45 tests. Its only failure is the integrating agent's concurrently added nine-route test (`3 !== 9`), pending that separate user-requested route expansion. The original track regressions, custom-width collision tests and mountain-shortcut tests passed. `npm run build` passed (existing large-bundle warning); scoped `git diff --check` passed.

Self-review checked resource release ordering/shared ownership, both async load boundaries, unchanged classic storage/new-star separation, open-branch path geometry and freezing only after construction. This report does not claim browser/GPU memory or visual-performance validation; the integrating agent owns browser benchmarks and final multiplayer smoke evidence. Additional routes must be fully assembled before the freeze/index block in `shared/track.ts`.
