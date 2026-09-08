# Distinct playable worlds implementation plan

**Goal:** Rework the nine existing selectable circuits into nine recognizable environments with distinct driving challenges, inspired by KartRider's environment-driven track design.

**Architecture:** Preserve route IDs, progression IDs and legal continuous-track projection. Add shared level definitions and deterministic driving zones used by both client and server. Add independent Three.js scenery builders for eight non-coastal worlds. Existing coastal art remains exclusive to the coastal circuit; other selected tracks show their actual world.

**Stack:** TypeScript, Three.js, existing Vite and Colyseus stack. No new packages or downloaded third-party game assets. Preserve concurrent changes; do not commit unrelated work.

**Reference:** https://popkart.tiancity.com/homepage/guide/theme.html — environment themes include ice tunnels, desert, forest, town, mine roads and space launch devices. Our layouts and procedural assets are original; no jump physics is claimed.

- [x] Define nine biome profiles and test road-zone boundaries, branch exclusions, reproducibility, actual acceleration/grip/drag effects. `shared/levels.ts`, `shared/race.ts`, `tests/levels.test.ts`.
- [x] Implement distinctive ground/horizon and scenery landmarks in `client/level-scenery.ts`: cargo cranes/containers; desert pyramids/arches; neon towers; factory pipes/storage tanks; space planet/station; dense forest/covered timber bridge; ice peaks/tunnels; mine gantries/crystals/lava.
- [x] Integrate palettes, sky, road treatment, feature stripes, start gates and camera compositions into `client/world.ts` and `client/scenery.ts`. Avoid decoration inside drivable corridors.
- [x] Update selector labels, level descriptions, active lobby scenery and career titles while retaining stable IDs. Localize new strings in all six supported languages.
- [x] Run feature tests, all-route AI completion, lifecycle tests, full suite and production build. Visually inspect all nine actual rendered tracks plus playable feature behavior; save a comparison contact sheet and validation report.

Acceptance: Nine distinct scene silhouettes/material sets visible without reading labels; each track retains its unique drivable route; ice, sand and boost zones have matched visual and deterministic physical behavior; old saves and multiplayer IDs still resolve. No promise of exact KartRider replication.
