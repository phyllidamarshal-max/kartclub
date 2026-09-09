# Default audio balance

The shared baseline is **Music 45% / Sound effects 65%**. The previous lobby default (24% music) differed from GameAudio's default (35%); both now read `client/audio-mix.ts`. The music-room sliders use the same constants. Existing user choices, including mute, remain authoritative. Missing/invalid audio values use the defaults, finite out-of-range values clamp to 0–1.

The speech gain changes from 4 to 1.8. UI, collision, engine and drift source levels retain their existing relationships within the effects bus. At the new defaults, music has more presence and UI/vehicle feedback gains 4.2 dB compared with the previous 40% effects setting. Speech itself falls approximately 2.7 dB compared with the old 40%-effects/4x-speech combination, avoiding a large announcement jump.

Measured source basis and calculated individual output levels:

| Source | Mean digital output at defaults |
| --- | --- |
| Nine race tracks | about -34.48 dBFS RMS |
| Lobby theme | about -35.89 dBFS RMS |
| Three / Two / One / Go | -26.65 / -27.00 / -29.48 / -29.23 dBFS RMS |

Speech is approximately 5–8 dB above the race score in average digital level. The speech output peak is about 0.153. These are source/bus measurements, not LUFS, speaker SPL, a worst-case simultaneous mix test, or a claim of subjective listening approval. User hardware volume still determines listening loudness.

Reproduce the measurement report with `npx tsx scripts/audio/measure-mix.ts`; output is `output/music/balance-levels.json`.

The settings Audio section now provides **Restore recommended audio** in all six languages. It restores only music/effects, saves them, and keeps graphics, motion, key bindings and the current music scene.

Validation:

- 51 focused audio, content and localization tests passed; new defaults/mute/invalid-value and speech-gain regressions were first run failing.
- Browser confirmed the original saved 0%/40% was retained, clicking Restore recommended audio set 45%/65%, and those values survived reload. Actual lobby bus gains were 0.1125 / 0.104 with nonzero music RMS 0.017497. Graphics remained High and motion 100%; bindings unchanged. Original test preferences were restored to 0%/40% afterward. Browser error log empty.
- `npx vite build`: passed, 155 modules, existing chunk-size advisory only.
- Full `npm run build` currently stops on concurrent VFX test type errors in `tests/vfx-environment.test.ts` at lines 97 and 102. These are outside audio scope and were left for the agent implementing that module.
