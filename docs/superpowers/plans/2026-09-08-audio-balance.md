# Audio default balance

User asks to determine balanced music/effects defaults. Implement within the already authorized audio work.

Measured basis: race masters -15.5 dBFS RMS; lobby -16.91; spoken files -14.92 to -12.10 dBFS RMS with 0.82 peaks. Existing screen defaults 24%/40% disagree with GameAudio's 35%/40%; the speech trim is 4.

Chosen baseline: Music 45%, Effects 65%. Keep the established music/effects bus scales 0.25/0.16. Lower speech trim to 1.8; leave the authored short UI/collision and steady engine levels intact. This raises musical presence and button audibility while reducing the speech-to-music gap. This is an initial mix balance, not a universal headphone loudness guarantee.

- [x] Test preferences: shared defaults, preserve explicit mute/custom values, partial saved settings and invalid numeric input; verify actual speech bus gain.
- [x] Centralize `DEFAULT_AUDIO` and `AUDIO_MIX` in `client/audio-mix.ts`, consume in main/GameAudio/CountdownVoice, and add a localized restore-recommended-audio button without resetting graphics or keys.
- [x] Align music-room default sliders with the same constants. Measure predicted source output levels in a reproducible report. Run focused tests/build and verify restore/defaults in the browser, restoring pre-test preferences afterward. Full typecheck is currently limited by concurrent VFX test errors; production bundling and focused audio/localization tests pass.
