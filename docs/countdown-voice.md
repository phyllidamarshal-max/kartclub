# Countdown voice — revision 4, 2026-09-08

The user rejected revision 3 as dragging, dull and lacking youthful character. Revision 4 replaces Ana with Microsoft's en-US-EmmaNeural stock female voice, removes the expanded GO and uses quicker articulation. Four local English clips say Three, Two, One, Go! Numbers last 0.29–0.38 seconds; GO now lasts 0.274 seconds, down from 0.535 seconds. Total shipping size is 55,622 bytes.

Number rates are +24%, +26%, +28%, with +32, +36, +40 Hz prosody lifts. GO uses +32% rate and +48 Hz. A 130 Hz high pass and -2.4 dB at 420 Hz reduce weight; +2.4 dB at 3.2 kHz and +1.5 dB treble add presence. There is no time stretching or reverb. A 6 ms look-ahead peak limiter balances source RMS at 0.20, 0.215, 0.225, 0.25, with a maximum peak of 0.86. Voice gain remains 1.8 through the effects bus; default effects remains 65%. Predicted voice levels are -28.53, -27.91, -27.51 and -26.59 dBFS RMS, approximately 5.9–7.9 dB above the existing coast music average. These are digital measurements, not loudspeaker SPL or listening judgments.

The rejected pack remains in `output/countdown-voice-20260908/previous-v3/`; revision 2 is also retained. The new sequence is `output/countdown-voice-20260908/preview-v4.wav`. Its cues start at one-second intervals, with only 80 ms silence after GO ends. The music room's `#countdown-voice` section offers the production GameAudio countdown, revision 3/new isolated clips and optional map-music mixing. All previews honor the corresponding music or effects volume.

Design reference: [KartRider Rush+ official page and video entry](https://kartrush.nexon.com/en-launching), and [the starting-boost tutorial](https://www.youtube.com/watch?v=L_qq8GEP4WQ). The reference establishes the race-start context; the prosody choices are original, not a transcription or measured imitation of a KartRider actor. [Edge TTS](https://github.com/rany2/edge-tts) supports rate, pitch and volume rather than emotion-style tags, so the pack does not claim to use an `excited` model style or a cloned voice. Subjective voice character can be compared using the supplied clips.

## Integration

- `client/countdown-voice.ts` prefetches local clips, decodes after audio activation and follows actual countdown transitions. Cached clips play without electronic beeps; unavailable clips retain the existing beep fallback.
- `client/audio.ts` routes speech through the existing sound-effects volume, independently of music. Pause, reset, disposal and context suspension cancel pending speech.
- `client/main.ts` connects the existing solo, practice and network countdown state. Regular starts remain three seconds; existing corner practice remains two seconds. It prevents menu/hidden-tab playback and resets speech on a new race.
- Duplicate or older countdown snapshots cannot replay a number. Skipped steps do not queue missed words. A first racing snapshot cannot announce a stale Go. A decode arriving more than 350 ms late is discarded.
- The English voice pack does not modify the six-language UI setting. Assets use version 4 URLs to bypass prior voice caches. Race countdown length and GO trigger timing are unchanged.

## Revision 4 validation

- All 26 focused countdown, asset, mix, driving, collision and UI audio tests passed. Log: `output/countdown-voice-20260908/revision4-tests.txt`. The standalone countdown module typecheck passed.
- The revised asset regression failed on revision 3, then passed with the new pack. It reads PCM independently and verifies metadata, onset, headroom, endpoints, number duration under 430 ms and GO under 360 ms.
- Browser production-GameAudio audition loaded revision 4, played all four cues once, ended on cue 0, released its source and returned to zero output. Peak observed at the effects analyser was 0.1643, with no browser errors. This verifies playback, not subjective vocal character.
- The broader audio run passed 41/42 checks. The remaining map-coverage check found that concurrent track work had expanded the playable catalog to 19 while nine unique music assets currently exist. New-map music remains outside this countdown change.
- The full project build was blocked by concurrent non-audio changes: `client/reference-course.ts` point types, missing `shared/moving-obstacles.ts`, missing `client/map-picker.ts`, and an invalid `brake` property in `tests/reference-course.test.ts`. This is not reported as a passing full build, and those files were not changed for the voice task.

## Earlier revision 2 validation

- Test-first verification: the initial six playback tests failed before implementation. The additional voice-only regression failed with five oscillators before removing the layered beeps, then passed with only the engine oscillator.
- 21/21 tests passed across countdown playback, asset integrity, collision audio and map music. Log: `output/countdown-voice-20260908/audio-tests.txt`.
- `npm run build` passed, including TypeScript. Vite reports the existing large-bundle warning. Log: `output/countdown-voice-20260908/build.txt`.
- All four production-preview asset requests returned HTTP 200, `audio/wav`, and byte-for-byte matches with the final local female-voice assets.
- Browser at `http://127.0.0.1:4175/?track=coast`: Start Race displayed 3 at 00:00.00, then advanced to racing; Pause worked; Restart followed by immediate Pause preserved 3 at 00:00.00. No error logs were observed; Three.js emitted its existing shadow-map deprecation warning.
- Full regression run: 434/438 passed. Four failures were in the concurrently edited `tests/vfx-hud.test.ts`, covering HUD rebinding, reduced-motion one-shot classes and result feedback. The countdown work does not edit that module; it is not claimed as a clean full-suite run. Log: `output/countdown-voice-20260908/regressions.txt`.

The browser checks establish game flow, not audible quality. This environment did not provide audio listening input, so naturalness and cuteness were not subjectively auditioned. `output/countdown-voice-20260908/preview.wav` contains the exact final assets at one-second intervals for the user to hear. Network playback edges, failure handling and effects routing were verified with controlled audio-context tests; live multiplayer audio was not separately auditioned.
