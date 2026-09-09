# Living Map Scores Implementation Plan

**Goal:** Rebuild all 19 map scores with original melodies and audible, map-specific environmental sound, as approved by the user.

**Architecture:** Author new A/B melodies and bridges with scene-specific orchestration. Render instrumental and environmental stems separately, starting both at the same AudioContext time and crossfading/stopping them together. Preserve existing music/effects settings, lobby, countdown and driving audio. Deliver combined and isolated previews.

**Tech Stack:** Existing Python/NumPy/SciPy/FluidR3 offline renderer, FFmpeg Ogg/AAC, TypeScript Web Audio.

## Constraints

User approved execution of the complete 19-map table on 2026-09-09. No further approval gate, new agents, gameplay edits, commits or deployment. Work in the current shared checkout and preserve other agents' changes.

## Steps

- [x] Acquire a small set of openly licensed environmental recordings and record provenance/hashes. Supplement with original wind, dust, ice, machinery and volcanic sound design; never claim synthesized textures are field recordings.
- [x] Write `living_scores.py` and `living_arrangements.py`: 19 distinct compositions with intentional rests for scene voices; validate notation, harmonic anchors and melody differences, including differences from revision 7.
- [x] Write `environment_audio.py` and scene event definitions: drifting wind beds, irregular wildlife, waves, grit, magma bubbles, ice resonance and scene-specific machinery. Keep timestamps/element names in an event report.
- [x] Render revision 8 into `output/music/living-v8`: paired stems with identical sample-exact loops, restrained levels, Ogg/AAC alternatives and full-mix/environment/instrumental previews. Decode all assets independently and verify finite PCM, continuity, balance and distinct hashes before installation.
- [x] Extend `MusicCue` with an optional environment stem; load both atomically, start/crossfade at the same timestamp, retain bounded per-map cache and dispose all nodes. Add failing lifecycle regressions first and verify them after implementation.
- [x] Generate/install 19-track catalog and manifest version 8 with environment URLs and truthful element descriptions. Update the music room to show each map's environment elements and isolated previews.
- [x] Run focused audio regressions and production build, verify real browser playback/layer output, retain version 7 assets for comparison, and write final validation/provenance notes.

Approved elements: coast—waves/seabirds/wind; harbor—water/ropes/distant horns; desert—sand gusts/grit/rock wind; city—distant city/electric hum; factory—pistons/steam/pipes; space—interior ventilation/energy/comms; forest—birds/leaves/small animals; glacier—cold wind/snow/ice caves; lava—bubbles/rumble/steam; orchard—birds/grass/fruit leaves; causeway—open wind/breaking waves; switchbacks—market/alleys; ridge—canopy wind/bird replies/timber; canyon—dust/rock echo; lagoon—ice resonance/snow; dual harbor—loading/chains; clockwork—gears/ratchets/conveyor; interchange—magnetic hum/energy; transit—rail/carts/cave.
