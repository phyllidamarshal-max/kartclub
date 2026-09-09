# Nine distinct world compositions

**Goal:** Replace the nine similar revision-5 scores with nine original themes whose melody, rhythm, harmony, instruments and development fit their actual map scenes.

**Architecture:** Author separate A/B/bridge scores and per-world accompaniment in new Python modules, retaining the existing lobby and effects. Render revision 6 into a staging folder; decode and validate before replacing the nine local game assets. Derive the TypeScript catalog's durations from exported score metadata. Keep expanded maps' existing theme mapping.

**Constraints:** Nine original scene scores; no copied game music. Existing licensed FluidR3 bank and synthesis; no new service required. Fixed musical loops with circular effect tails, stereo headroom and matched volume. Respect saved music/effects preferences. No gameplay, map or visual changes. Execute locally without additional agents or commits.

- [x] Preserve revision-5 assets, score sources and preview excerpts in `output/music/previous-v5/`.
- [x] Add independently authored A/B/C themes in `scripts/music/world_scores.py`, parsing and harmony helpers in `score_model.py`, and distinct grooves in `world_arrangements.py`. Coast: surf/ska; harbor: swung funk; desert: Phrygian-dominant reeds/plucks/hand drums; city: DnB; factory: industrial guitar; space: Lydian trance; forest: 6/8 folk; ice: fast 3/4 piano; mine: orchestral pursuit.
- [x] Implement `scripts/music/world_arranger.py` with per-world bass, chord rhythms, drum patterns and instrument roles. Use each score's own form, including bridge and returning theme, instead of a shared A/A/B/B template.
- [x] Validate complete bar lengths, supported chord voicings, playable registers and cross-score transposition-invariant shared phrases. Produce a report comparing old and new scores; metrics establish structural difference, not subjective quality.
- [x] Render all nine loops and common-piano melody excerpts to `output/music/world-v6/`. Decode both Ogg/AAC formats, check duration, silence, clipping, loop seams and loudness. Only then replace production assets and increment cache revision.
- [x] Update `client/music-catalog.ts`, generated score metadata and music tests for variable meters/lengths and existing expanded-map aliases. Keep lobby revision 1.
- [x] Update the music room with nine scene-specific previews, revision-5 comparisons and the same-piano melody comparisons. Verify real browser track changes and silence on stop. Run focused audio tests and the build, recording any concurrent unrelated failures.

The current user explicitly requests the rewrite and has previously authorized autonomous per-scene music design. This plan implements that scope; it does not add an approval gate.
