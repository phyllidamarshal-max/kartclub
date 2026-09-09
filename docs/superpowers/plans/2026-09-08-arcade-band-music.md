# Arcade band soundtrack revision 5

User asks for substantially more excitement with KartRider music as a reference. Existing authorization covers autonomous composition and game integration.

## Reference and approach

Read the artist/publisher track commentary at https://music.bugs.co.kr/album/827692 : Nitro Booster (strong electronic drums, low synth movement), Dogfight (electric guitar, a break leading into a new theme), Travelling the World (brass, house pulse and acoustic strumming), Rejoicing in Carol (piano and electric guitar), and Fire Dragon (orchestral melody and electric guitar). These are documented references, not a claim that the agent listened to or measured the recordings. No reference recordings or melodies are used in the game.

The v4 arrangement is still sparse and its instruments are simple additive synthesis. Change the instrumental source as well as tempo and arrangement: use FluidR3 sampled instruments through offline TinySoundFont alongside original synth voices. FluidR3's MIT license and provenance must accompany the rendered soundtrack. Only rendered loops are loaded by the browser; the sample bank and Python tools stay local.

## Implementation

- [x] Install pinned offline renderer locally; acquire the FluidR3 GM bank, verify its license, save checksums and reproducible setup. Preserve v4 coast/city/ice excerpts for comparison.
- [x] Arrange all maps as original arcade band scores: 148–172 BPM, brass/electric guitar/piano/strings plus electronic pulse. Keep each map's identity. Add four-bar fills, eighth-note bass movement, short section breaks/builds and a full reprise while preserving authored harmonious themes.
- [x] Render revision 5 Ogg/AAC loops and update catalogue BPM/loop metadata/cache versions. Keep the master RMS reference at -15.5 dBFS; excitement must come from instrumentation and arrangement rather than only volume.
- [x] Update the music room with v4/v5 comparison clips and accurate credits. Verify note structure, every encoded loop, focused runtime tests, build and browser playback. Signal checks do not certify subjective excitement.
