# Lobby music and interface sounds

Implemented the requested cheerful menu theme and click feedback.

## Music

`Clubhouse Sunshine` is an original 132 BPM C-major composition with piano, acoustic guitar, bouncing bass, flute/pizzicato accents and light drums. A/B phrases, a lighter middle section and a brighter reprise form a 32-bar loop (58.18181405895692 seconds). Instrument/reverb tails wrap across the boundary. The same FluidR3 GM MIT sound bank used by the map cues supplies the instruments; credits are delivered with the assets.

- `scripts/music/render_lobby.py`: complete authored score, renderer and independent decode checks.
- `public/audio/music/lobby.ogg`, `lobby.m4a`, `lobby.json`: runtime assets/metadata.
- `output/music/lobby-excerpt.wav`: 16-second local preview.
- `output/music/lobby-validation.json`: measurements and hashes.

Rebuild with the existing offline dependencies: `python scripts/music/render_lobby.py`.

## Runtime

- `GameAudio.setMusicScene("lobby" | "race")` separates lobby music from the remembered map/custom race cue. Merely choosing a map keeps the lobby theme. Solo start and multiplayer countdown select race music; returning to any lobby page restores the lobby cue with the existing 0.8-second crossfade. Settings opened during a race retain its track.
- A genuine pointer/key activation unlocks audio. Loading the page alone does not create an AudioContext. Existing volume preferences apply, including zero volume.
- `client/ui-audio.ts` delegates button/link activation and select/range input. Tap, select, confirm and back cues share the effects bus. Disabled, busy and inert controls are silent. Keyboard-generated button clicks use the same feedback. Continuous range changes and rapid clicks are rate limited; at most eight oscillator voices remain live, and ended/disposed nodes disconnect.
- `client/audio-debug.ts` is an opt-in development-only DOM probe at `/?audioDebug=1`; normal game pages have no diagnostic panel.
- The music room now includes the lobby theme and four effect preview buttons at `/output/music/review.html#lobby-audio`.

## Validation

- Ogg and AAC independently decoded to stereo 44.1 kHz audio with finite samples and correct loop duration. Peaks: 0.75356 / 0.75667. RMS: -16.91 / -16.95 dBFS. Boundary steps: 0.001760 / 0.007053. Both encodings passed silence and loop-seam checks. Combined size: 2,253,464 bytes.
- Focused map music, interface audio, music assets, countdown voice/assets, collision audio and content tests: **31 passed, 0 failed**. New behavior tests were run failing before implementation.
- `npm run build`: passed, 153 modules. Existing bundle-size advisory remains.
- Actual game browser: initial lobby cue idle, context not created; first Settings click started lobby playback and a tap cue. At music volume 0.4 the bus gain was 0.1 with nonzero signal RMS (0.013861). Keyboard volume adjustment produced a select cue. Starting a race selected `coast`; returning through Pause → Return to lobby restored `lobby` with a back cue. Music/effects at zero produced zero bus gains and zero analyser signals, with no new muted button voices. Browser error log was empty.
- Test settings restored to their original Music 0% / Effects 40%. This saved mute preference means the game requires raising Music volume to hear the theme on this browser profile. The separate music-room preview starts at 60% and does not alter game settings.
- Music room: lobby cue playing at 48 kHz, nonzero signal RMS (0.015578); Confirm preview registered a confirm cue. Playback and signal checks do not certify subjective musical taste.
