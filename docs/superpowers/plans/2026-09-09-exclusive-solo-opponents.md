# Exclusive solo opponent appearance

**Goal:** Solo AI never uses the player's selected kart model, outfit or color. Among opponents use every remaining model/outfit before repeating; keep colors distinct for up to seven opponents. Seven catalog models/outfits leave six alternatives, so a seven-opponent race necessarily repeats one AI model/outfit. Restarts are deterministic.

**Implementation:** A small `client/solo-opponents.ts` factory consumes the actual spawned player and current track, creates AI cars in the same slots/IDs, and changes only cosmetic fields. All solo race/item/career/restart paths already share `beginSolo`, which will call this factory. Preserve AI performance, count, starting position, physics, multiplayer, ghosts and saved player choices. Existing lobby preview is outside the requested single-player opponent roster.

**Verification:** Test the real spawned opponents for all 7 kart × 7 outfit × 8 player-color combinations at 3/5/7 opponent counts. Check exclusion, balanced repeats, unique colors, deterministic rematches and equality of non-cosmetic spawn fields. Run related driving/selection regressions and build. Inspect actual solo race via existing UI when available.

- [x] Add failing real-roster tests.
- [x] Implement factory and connect shared solo start.
- [x] Run focused tests/build and inspect game.

This is an authorized focused follow-up. Execute locally; no approval, commit, deployment or parallel delegation is needed.

## Result

Implemented the real-car roster factory and connected beginSolo. All 1,176 player/count combinations pass exclusion and uniqueness checks. The focused suite completed 16 tests with 0 failures, including AI driving, item-race and appearance regressions. TypeScript/Vite build passed; the existing large-chunk warning remains. Actual browser checks covered solo start, restart, pause and return to lobby. A capture records race rendering but does not resolve every distant AI outfit; exhaustive roster exclusion is verified through the real spawned-Car tests. Multiplayer and lobby display companions retain existing behavior.
