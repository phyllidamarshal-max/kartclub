# KART CLUB design QA — 2026-09-08

## Verdict

功能及布局集成可供本地体验。**不标记为参考图完全还原通过**：实时模型和场景仍存在下面记录的美术差异。没有把视觉对照页或自动测试当作像素级一致的证明。

## Reference and combined comparison

- Approved UI: `output/ui-concepts-20260907/01-赛事大厅.png` and `02-比赛界面.png` (1672×941 layout).
- Latest vehicle references: `output/ui-refresh-20260908/reference-front.png` and `reference-rear.png` (unaltered user originals).
- Reproducible combined input: `http://localhost:5173/output/ui-refresh-20260908/visual-review.html`. Lobby and race compare reference and the actual app in a 1672×941 iframe; front/rear compare the original image and the actual game model. Screenshots were inspected inline through the browser tool. Model views intentionally isolate geometry and are not full-scene pixel comparisons.

## Confirmed corrections

| Area | Finding and correction |
| --- | --- |
| Lobby | Four modes, selected track thumbnail, main start and friend action use the approved left panel hierarchy; actual kart occupies the right. Compact styles avoid Chinese mode labels breaking unnecessarily and keep footer below panel. |
| Icons | SVG mask URL quoting previously produced solid squares; encoded quotes now render actual Phosphor icons. |
| Race | Corner instruments preserve road visibility. Countdown inherited transform corrected. Empty objective box hidden with sufficient selector priority over the old stylesheet. |
| RTL | Header/panel alignment and modal close use logical sides; race numbers and controls keep LTR meaning. |
| Localization | Form placeholders, composite room summary, career history and reward heading omissions corrected. Input values remain unchanged. |
| Model | Large color-matched helmet, curved black visor, cream stripe and suit/gloves, tapered nose, bumper, tires, seat and engine integrated into every game kart. Old facial mesh removed. |
| Motion | Removed perpetual speed-linked sinusoidal bob; fixed-step interpolation is shared by car and camera and snaps on resets. |

## Remaining visual differences

| Priority | Difference from user reference | Status |
| --- | --- | --- |
| P2 | Visor is darker/flatter in its reflection, tire shoulders and nose facets differ, suit lacks the reference's subtle cloth shaping. | Open fidelity work; current model is usable and integrated but cannot be called identical. |
| P2 | Village facades and vegetation are simpler; roadside density, coastline arrangement and atmospheric detail differ from the supplied polished render. | Open fidelity work. All geometry is real-time and follows the playable track rather than a static promotional background. |
| Expected | Older approved UI concept exposed a character face; latest user reference requires a full black visor. | Latest reference takes precedence. |
| Expected | Camera position changes with selected actual track and viewport; Arabic mirrors menu positioning. | Intentional behavior, not a pixel comparison failure for a fixed screenshot. |

## Measurement and interaction coverage

DOM checks at 1280×720 and a narrow approximately 437-pixel CSS viewport showed no horizontal document overflow. Inline captures at default and larger layouts cover lobby, coast/city/mountain HUD and Arabic direction. Some in-app-browser emulated captures had a cropped compositor surface; those were not used as proof of complete viewport coverage, and all temporary emulation was reset.

The six-language settings/HUD sequence, major navigation, actual solo starts, pause/return and free-room creation/exit were exercised. Automated verification is recorded in `docs/ui-refresh/verification.md`. No new raster mockup is being presented as the playable game.
