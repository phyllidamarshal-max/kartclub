# Race countdown voice

Four synthetic English race calls: Three, Two, One, Go! Revision 4 generated on 2026-09-08 using Microsoft's `en-US-EmmaNeural` female voice through `edge-tts`. The numbers use +24%, +26%, +28% rate and +32, +36, +40 Hz prosody lifts. GO uses +32% rate and +48 Hz, lasting 274 ms. Low-mid reduction, gentle presence/treble EQ and per-call level balancing aim for a lighter, clearer voice. No time expansion or reverb is used. These are generated speech clips, not recordings of a hired voice actor or a cloned KartRider character.

The WAV assets are shipped with the game. Runtime playback does not contact a speech service. Generation requires Python with `edge-tts`, FFmpeg and Node; run `python scripts/audio/generate-countdown.py` from the repository root. The generator uses the online service once per clip. `scripts/audio/prepare-countdown.mjs` trims silence, balances RMS levels with a short look-ahead peak limiter, and checks all four clips before replacing the pack. Revision 3 is kept in the local review output for comparison.

Reference: [Microsoft voice catalog](https://learn.microsoft.com/azure/ai-services/speech-service/language-support), [edge-tts project](https://github.com/rany2/edge-tts).

Design reference: [KartRider Rush+ official game/community page](https://kartrush.nexon.com/en-launching). This pack's prosody and mixing are original design choices. Edge TTS exposes rate, pitch and volume rather than emotion-style tags; this pack does not claim to use Azure's `excited` style. No KartRider audio was copied, transcribed or used to train a voice.

`en/manifest.json` records the voice settings, clip sizes and durations. The original logo, game music and other sound effects are separate assets.
