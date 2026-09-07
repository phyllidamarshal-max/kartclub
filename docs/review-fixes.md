# Final review fixes

Implemented the three findings from `docs/final-review.md`.

- Race progress is now an unwrapped signed distance anchored at the physical start line. Rear-grid cars initialize behind zero, reversing before the line preserves negative distance, validated checkpoints never retreat, and reset returns only to the maximum validated checkpoint.
- The Escape pause guard now scopes `soloDone` to solo mode, so a completed solo result cannot disable the multiplayer menu.
- Multiplayer networking now distinguishes `connected`, `reconnecting`, and terminal `ended` states. A dropped connection retains the room for at most 30 seconds; reconnect restores it, while expiry or terminal leave clears the dead room and snapshot, invalidates stale callbacks, refreshes account data when available, and shows a durable return-to-hall panel. Intentional leave clears the room before SDK callbacks run, so it cannot overwrite a newer room.
- The reconnect deadline is anchored to the first drop in an interruption cycle. SDK retry drops reuse that deadline instead of restarting the 30-second window; successful reconnect and terminal cleanup clear it.

## Verification

`npx tsx --test tests/race.test.ts tests/lap.test.ts tests/controls.test.ts tests/lifecycle.test.ts`

- 16 tests passed, 0 failed.
- Includes legal-input laps from rear slots 2 and 3, and a legal 180-step reverse followed by normal forward driving. The first checkpoint is awarded only at progress `>= 1/12`.
- Includes a repeated-drop lifecycle regression proving the second drop preserves the original reconnect deadline.

`npm run build`

- TypeScript check passed.
- Vite production build passed (64 modules transformed).
- Vite reported its existing advisory that the main minified chunk exceeds 800 kB; this does not fail the build.
