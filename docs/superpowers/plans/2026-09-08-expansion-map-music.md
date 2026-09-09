# Music for ten new circuits

The user requests music for the newly added maps. Give each of the ten `NEW_MAPS` its own score and asset URLs, retaining the nine revision-6 compositions and the lobby/effects.

- [x] Export current map IDs, names, biomes and landmarks from the game. Create ten original A/B/bridge scores, each with its own melody, harmony, groove and scene-specific instrumentation. Compare the new themes against each other and the nine existing themes.
- [x] Extend the offline renderer through optional profile/percussion arguments and additional authored accompaniment roles. Existing calls retain the revision-6 behavior. Render only the new ten scores to `output/music/expansion-v7/`.
- [x] Decode both Ogg and AAC outputs; check exact loop lengths, finite PCM, headroom, consistent levels and loop seams. Keep common-piano melody previews and chorus excerpts for all ten.
- [x] Install the ten new assets, generate a combined 19-track catalog/manifest and remove base-map aliases. Add a regression that each playable map resolves to its exact own ID, URL and buffer.
- [x] Update the review room to show all nineteen map names, with an obvious new-map section and melody comparisons. Verify playback for the ten new tracks, run audio regressions/build and record results.

Design: orchard—bluegrass; causeway—tropical samba; city switchbacks—electro swing; ridge—marimba/jungle breaks; canyon—nylon-guitar desert rally; lagoon—crystalline liquid breaks; dockside divide—nautical 6/8 fanfare; clockwork—harpsichord/electro; orbital interchange—chiptune sprint; mine transit—12/8 train shuffle. All are original game-scene interpretations using the existing licensed sound bank and original synthesis.

No gameplay edits, additional agents, new service, deployment or commits. The existing authorization for autonomous per-scene music design applies.
