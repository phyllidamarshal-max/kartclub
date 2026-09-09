# Living obstacles — first playable

User approved direct implementation and real game captures on 2026-09-09.

## Scope and constraints

Replace the repetitive industrial sweepers with hanging pendulums; introduce walking sheep in Forest Orchard and deer in Forest Ridge. Keep the harbor/space cargo traffic. Preserve driving controls, vehicle physics/resources, routes, the KART CLUB visual language, and other ongoing work. Original thematic models, no copied game assets. The reference principle is readable, theme-specific moving mechanisms, with a timing choice and a safe route.

All motion is deterministic from the shared race clock. No player-triggered random phase, invisible collision plane, forced stop across the whole road, new jump input, or new sound. Supports stand outside the road. Animals pause on clear verges, walk across and turn while stopped. Warning placement must give useful sight distance. Obstacles stay away from starts, sharp turns, shortcut joins, and other obstacles. The first batch uses only straight, broad crossings so existing drift challenges remain intact.

## Tasks

- [x] 1. Shared motion and contact: add `pendulum`, `sheep`, `deer` kinds; smooth deterministic animal dwell/cross/turn cycles, real pendulum lift; preserve continuous collision and improve contact to use the actual kart footprint. Regression coverage for high speed, grazing, parked cars, reset, replay, and new motion boundaries.
- [x] 2. Visuals: original finished pendulum and articulated sheep/deer models, authored details, painted crossing markings and readable advance signs. Animate existing transforms only, share resources and keep solid mesh footprints aligned with collision. Model API consumes shared pose.
- [x] 3. Integration: author suitable crossings on factory-shift, mine-transit, forest-orchard, forest-ridge; clear verges and roadside props; update AI to assess several lanes at arrival time; update six-language map descriptions accurately.
- [x] 4. Verify and review: focused motion/mesh/placement/AI/localization tests, build, independent review of task changes, and real game screenshots of both families. Record failures and limits honestly.

## Shared interface

`MovingObstacleSpec.kind` adds `pendulum | sheep | deer`; existing x/y/z/heading/radius/amplitude/period/phase remain. `MovingObstaclePose` supplies `facing` (world yaw), `stride` (distance-based gait phase input), `lift`, `swingAngle`. `pendulumLength(spec)` supplies the rod length. Pendulum pose y is base y plus lift; weight center is pose y + radius; pivot is base y + radius + length. Animal poses keep ground y. Animal turns occur during dwell. The obstacle envelope stays lateral to its road heading. The hanging weight is a low sweeping obstacle, with no purported drive-under opening.

## Execution ledger

Ruling: work in the current requested live checkout — it contains the user's running game and substantial concurrent changes; no resets, staging, commits, or branch switching.

| Tasks | Contract checked | Decision |
| --- | --- | --- |
| 1 / 2 | shared pose vs animated model | same pose, world heading, base-height convention above |
| 1 / 3 | motion vs AI and placement | prediction uses shared pose; no independent phase calculations |
| 2 / 3 | supports/signs vs verge exclusions | support geometry stays outside road; animal transit envelope excluded from scenery |
| 1 | collision tests vs geometry | test actual footprint clearance, retain continuous sweeps |
| 2 | art vs runtime | no fake screenshots; build into the real World pipeline |
| 3 | difficulty vs obstacle density | orchard one gentle crossing, ridge two, industrial two/three; retain clear lanes |
| 4 | acceptance vs scope | verify new families and regressions; no claim of full playtesting of all 19 maps |

## References

- KartRider publisher update: https://mpopkart.tiancity.com/homepage/article2019/2022/06/27/1369.html (themed presses, suspended moving containers, difficulty ratings).
- QQ Speed carousel track report: https://games.sina.com.cn/o/n/2010-09-27/1551439915.shtml?from=wap (read moving horses and pass through gaps; contemporary report, not a Tencent-hosted source).

Pendulums and walking wildlife here are original implementations inspired by readable timing and thematic obstacles; these references do not establish that either title has these exact models or rules.

## Completion and review

All four tasks completed. Initial review rejected the circular animal flank collider and the lifted weight's invisible contact region. Fixed with rotating fitted capsules and low-sweeping padded weights; inverse model tests added. Runtime inspection also found that static scene batching detached animated obstacle meshes; dynamic flags and a real World batching regression fix this for both new and retained obstacles. A full-cycle curb squeeze test and landing/fence ray checks pass. Independent final scoped review approved code and spec compliance.

Latest validation: production build passed; full suite 781/782 passed, with one unresolved coastal cottage path-count assertion. All obstacle tests pass. Real engine captures and AI passing checks completed for pendulum, sheep and deer; actual game start/pause/return-to-lobby flow checked. See docs/living-obstacles-2026-09-09.md for complete evidence and limitations. No commits, publishing or unrelated test weakening.


