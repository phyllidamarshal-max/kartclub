# Map Soundtracks Implementation Plan

> Execution: superpowers:subagent-driven-development. User explicitly requested autonomous musical design and implementation; no additional design approval is required. Preserve concurrent work; do not commit or change gameplay.

**Goal:** Nine original, audibly different map scores with reliable looping, map switching and existing volume controls.

**Architecture:** Deterministic Python synthesis renders authored 32-bar stereo arrangements to Ogg Vorbis and AAC. A dedicated Web Audio buffer player crossfades by actual track ID. SFX retain their independent bus. A standalone listening page uses the real GameAudio integration.

**Tech stack:** Existing TypeScript/Web Audio, installed Python NumPy/SciPy and FFmpeg, no downloaded musical samples or new runtime dependencies.

## Design

The user authorized autonomous choices. Considered live oscillator sequencing (small but repetitive and timer-sensitive), prerecorded licensed music (requires external tracks), and original offline synthesis (chosen: editable original scores, fixed rendering cost and reliable timing).

| Track ID | Title | BPM | Character |
|---|---|---:|---|
| coast | Sunlit Starting Line | 136 | Bright mallets, plucked chords, buoyant pop drums |
| coast-harbor | Dockside Groove | 128 | Syncopated electric keys, rounded bass, shuffle funk |
| coast-breakwater | Dune Dash | 144 | Plucked harmonic-minor melody and hand percussion |
| city | Neon Apex | 142 | Synth lead, offbeat chords, dance pulse |
| city-factory | Assembly Overdrive | 150 | Metallic motif, industrial breakbeat, bass ostinato |
| city-nightshift | Orbital Slipstream | 138 | Floating pads, bright arpeggios, space disco |
| mountain | Treetop Sprint | 132 | Woodwind melody, marimba, light acoustic-style percussion |
| mountain-pass | Aurora Switchback | 140 | Bell melody, glass harmonics, warm low end |
| mountain-summit | Ember Rails | 154 | Dark plucked lead, toms and driving low bass |

All scores have authored A / A variation / B / return sections, independent motifs, keys, harmony and rhythm. Referencing KartRider's map-specific soundtrack concept and playful racing energy; no melody transcription or third-party recording is used. Reference catalogue: https://open.spotify.com/album/5dYoq7G1RnLPd3DCycruMn and album production credits https://music.bugs.co.kr/album/30992174 .

## Tasks

- [x] **1. Compose and render (root).** Add `scripts/music/scores.json` and `render.py`; export nine stereo 44.1 kHz, 32-bar loops into `public/audio/music/`, Ogg + AAC and manifest. Wrap instrument/reverb tails across the loop boundary. Validate duration, finite samples, signal levels, no long silence, decoded boundary step and unique hashes. Keep render report and optional short WAV excerpts under `output/music/`.
- [x] **2. Playback integration (audio implementer).** Add `client/music-player.ts`, `music-catalog.ts`; modify only audio-related lines in `client/audio.ts` and `main.ts`. `GameAudio.setTrack(id)` remembers selection before unlock; `start(content.musicUrl)` preserves optional override. Buffer sources use precise duration and loop, 0.8 s fade, current request wins, deduplicated load and bounded cache. No network/decode until user unlock; hide/suspend and dispose correctly. Test map coverage, same-track idempotence, stale request resolution, failure retaining current cue, volume and disposal. Existing collision tests must pass.
- [x] **3. Actual browser review (root).** Add `output/music/review.html` with nine play buttons, titles and volume, actual GameAudio status. Exercise two different maps, volume mute, rapid switching, stop/resume and browser decoding. Save technical rendering metrics; do not claim subjective listening if no audio listening tool is available.
- [x] **4. Completion.** Run `npm run build`, audio/content test subset, asset validation. Review focused audio diff and record result. Link playable soundtrack review, not copied commercial audio.
