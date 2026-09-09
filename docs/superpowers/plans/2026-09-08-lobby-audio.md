# Lobby audio implementation plan

**Goal:** Add cheerful original lobby music and concise interaction sounds, using the existing Music and Sound effects settings.

**Design:** A 132 BPM C-major piano/guitar theme with bouncing bass, brushed-style light drums and a brighter B section. A 32-bar seamless Ogg/AAC loop uses the existing licensed offline instruments. The lobby cue is separate from the nine map cues. Browsing maps keeps lobby music; beginning a solo/online race crossfades to its map, returning to the lobby restores the theme. Audio starts on a genuine pointer/key activation. Interface sounds are short tap, selection, confirmation and back cues, with rate limits and node cleanup.

**Scope:** User authorized music design and direct implementation. Preserve other agents' gameplay, scene, UI and countdown changes. Work inline in this shared workspace; no commits or deployment. Reference the current music renderer and source credits; no new external assets required.

- [x] Add behavioral tests for lobby → race → lobby, custom music override, delayed activation and interface sound throttling/cleanup. Run and observe failures before implementation.
- [x] Compose and render `scripts/music/render_lobby.py` to `public/audio/music/lobby.{ogg,m4a}` and `lobby.json`; validate both decoders, loop seam, peaks and phrase lengths.
- [x] Add `client/ui-audio.ts`, lobby cue and scene switching to GameAudio; wire lifecycle and delegated interaction sounds into `client/main.ts`. Keep keyboard activation and disabled controls correct.
- [x] Add lobby and interface previews to the existing music room. Run focused audio tests and build, verify actual home/settings/race/return behavior in browser, document results.
