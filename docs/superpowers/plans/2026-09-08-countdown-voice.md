# Countdown voice implementation plan

User request: add voiced race-start countdown. Implement directly in the existing game; no approval or delegation needed for this authorized change.

Design: ship four fixed English voice clips (Three, Two, One, Go), prefetch at boot and decode after audio activation. Follow-up direction: use a bright, cute female neural voice with natural pitch instead of the initial system voice. Generate the clips once using en-US-AnaNeural and bundle the WAV files; gameplay needs no speech service. Route voice through the existing effects volume. A single per-race countdown observer follows actual solo/network state and cancels stale asynchronous playback. Electronic cues are fallback only when speech is unavailable. No gameplay timing, language setting or camera changes.

Use sequential execution and the existing test-first/verification workflow.

- [x] Add failing audio tests for countdown edges, skipped snapshots, repeated races, late/failed loads, pause/disposal and effects routing.
- [x] Generate and inspect short normalized WAV clips; retain a reproducible generator and asset provenance. Signal inspection passed; subjective audition remains with the user.
- [x] Implement countdown playback and wire existing solo, practice, network, pause, visibility and cleanup paths.
- [x] Run audio regressions, build, asset integrity checks and browser start/restart flow; document any audition limits. See docs/countdown-voice.md for unrelated full-suite failures.
