# Collision audio implementation report

## Scope

Implemented Task 2 from `docs/superpowers/plans/2026-09-08-nitro-collision.md`. No shared physics or `client/main.ts` files were edited.

## Files

- `client/audio.ts`
  - Added `GameAudio.collision(strength, kind)` and `GameAudio.resetCollisionSound()`.
  - Synthesizes a short sine body thump plus an original, generated and low-pass-filtered noise contact layer.
  - Routes both layers through the existing `effects` gain bus, so existing SFX volume and mute behavior apply.
  - Rejects absent/suspended contexts, clamps invalid values via the profile helper, ignores zero strength, and debounces accepted sounds for 120 ms using audio-context time.
  - Gives `kart` impacts 82% of wall/obstacle amplitude.
  - Bounds the body layer to at most 230 ms and contact layer to at most 120 ms (plus a 10 ms stop margin), then disconnects every created source, filter, and gain node on `ended`.
- `client/collision-audio.ts`
  - Added the deterministic `collisionSoundProfile()` helper and exported `CollisionKind`.
  - Strength is clamped to 0–1; non-finite input maps to zero. Strong impacts produce a lower, louder, longer body while weak impacts retain a light transient.
- `tests/collision-audio.test.ts`
  - Added focused Web Audio doubles only for the APIs used by the effect.
  - Covers safe profile scaling, absent/suspended context behavior, cooldown/reset behavior, finite bounded scheduling, effects-bus routing, and cleanup/disconnection.

## Gain and tone review

At the default SFX setting, the effects bus gain is `0.4 * 0.16 = 0.064`. Maximum pre-bus body gain is `0.62` for wall/obstacle and `0.5084` for kart contact; the resulting maximum body gain entering the destination is about `0.040` and `0.033`. The contact layer tops out near `0.0106` after the default bus. This keeps the low-frequency thump audible while the noise transient remains subordinate and non-piercing. The contact layer's low-pass cutoff is bounded to 900–1750 Hz, and the body layer is low-passed at 320 Hz.

## Verification

Final commands run from the repository root:

```text
npx tsx --test tests/collision-audio.test.ts
```

Result: 4 tests passed, 0 failed, exit code 0 (195.6304 ms).

```text
npx tsc --noEmit
```

Result: no diagnostics, exit code 0.

```text
npx prettier --check client/audio.ts client/collision-audio.ts tests/collision-audio.test.ts
```

Result: all matched files use Prettier code style, exit code 0.

## Self-review

- Confirmed the public method signature uses the exact three collision kinds from the plan.
- Confirmed all created collision nodes have finite start/stop automation, a bounded lifetime, and `ended` cleanup.
- Confirmed rejected calls do not consume the cooldown, while `resetCollisionSound()` intentionally permits the next event immediately for race/menu lifecycle integration.
- Confirmed the generated noise is an original in-memory transient and no external sound asset or dependency was added.
- Confirmed the changes are confined to the Task 2 owned files.

## Integration note

The root task should call `collision()` only when `collisionCount` advances and call `resetCollisionSound()` at lifecycle boundaries. The audio-level 120 ms debounce provides an additional guard against duplicate render-frame calls; shared physics currently debounces contact events for 350 ms.
