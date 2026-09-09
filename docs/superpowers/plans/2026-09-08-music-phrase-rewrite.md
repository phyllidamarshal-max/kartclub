# Coherent racing music rewrite

**Goal:** Address the user's audible feedback: disconnected notes, conflicting parts and weak racing energy across all nine scenes.

**Approach:** Replace fragment indexing and automatic pitch snapping with explicitly authored eight-bar melodies over matching chord charts. Give lead notes defined gates, keep bass on roots/fifths, use voice-led triads, and put answers only in lead rests. Use a driving rhythm section with scene-specific ornamentation, harmonic lead synthesis, shorter room tails and rhythmic ducking. Keep playback APIs, BPMs and exact loop lengths stable.

**Diagnosis from existing source:** `bar % 4 * 8` drops motif notes when a scene has fewer than eight melody positions; harmonic roots are shifted independently in B; strong-note snapping changes contours after composition; low bass steps include seconds/sevenths; several tonal texture beds are unrelated to the key; glass/metal FM ratios are inharmonic and used as prominent melodic voices; percussive lead tails and repeated delay taps obscure subsequent notes. Technical decode checks did not assess musical quality.

**Alternatives considered:** Rebalancing the old mix leaves phrase/harmony faults intact. Imported music would not fulfill the original autonomous composition direction. Choose explicit original composition with a revised synthesis/mix engine.

## Authorized scope

- Revise nine original scores and delivered assets; retain map identity and independent music volume.
- Preserve gameplay and other agents' edits. No additional approval, commit, or deployment is required; autonomous music design was already authorized.
- Compare three previous excerpts with new excerpts in the listening page. Do not represent signal checks as subjective listening approval.

## Work

- [x] Preserve previous coast/city/ice excerpts; write explicit chord charts and complete A/B phrases with rests and durations in `scripts/music/phrases.py`.
- [x] Add event scheduling with voice leading and non-overlapping lead gates; verify bar lengths, accented/held note harmony, bass support, and response placement with musical-structure checks.
- [x] Replace exposed inharmonic leads and disconnected percussion with harmonic lead timbres, sustained but gated melodies, strong kick/snare/hat patterns, scene ornaments, and a clear bass groove. Remove unrelated tonal beds; shorten note echoes; duck accompaniment under kicks.
- [x] Export all 18 files with revision 4 cache URLs, preserving BPM and exact loop length. Update listening descriptions and an old/new excerpt comparison.
- [x] Independently decode assets, run focused runtime/asset tests and build, verify revision 4 playback in browser, and document results and limits.
