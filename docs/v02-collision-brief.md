# Task 1 — collision and vehicle physics

Own ONLY shared/race.ts, tests/collision.test.ts, docs/v02-collision-report.md. User approved this upgrade. Root edits track/client/server independently. No new dependencies. Read current race tests and skill test-driven-development.

Implement arcade car contacts with moderate side pushing/rear impacts, bounded impulses, exact overlap resolution, wall slide preserving tangent and strong normal-impact slowdown. Prevent NaN, explosive energy, stuck overlap, and pushing cars outside track. Finished cars are ignored. Reset grants 2 seconds intangible protection; repeated held reset cannot extend it. Add Car fields `ghostTime:number` and `impact:number` (decays visual feedback). Optional item fields will be added by root outside race.ts later; avoid item mechanics here.

Root is replacing shared/track.ts with backwards compatible API:
```
interface Track { id:string; name:string; subtitle:string; theme:'coast'|'city'|'mountain'; width:number; length:number; points:Point[]; obstacles:{x:number;z:number;radius:number}[]; /* other metadata */ }
interface Point {x:number; y:number; z:number; heading:number;t:number}
DEFAULT_TRACK:Track
trackPoint(t:number,track?:Track):Point
nearestTrack(x:number,z:number,track?:Track):Point & {distance:number;lateral:number}
```
All race APIs keep existing args and add final optional Track default DEFAULT_TRACK:
`spawnCar(slot=0,id='local',track=DEFAULT_TRACK)`
`stepCar(car,input,dt,track=DEFAULT_TRACK)`
`separateCars(cars,track=DEFAULT_TRACK)`
Road width comes from track.width. Optional shortcut is handled by root's nearestTrack returning a projected driveable branch point with canonical t; do not clamp against hardcoded default width. Add obstacle contact against track.obstacles circles. Do not alter signed progress/checkpoint rules unless a regression exposes a concrete bug.

Tests first: overlap at zero distance resolves finite; rear contact transfers bounded momentum; wall tangent retained vs normal lost; reset grace skips contacts then expires; cars pushed together at a boundary remain legal; obstacle prevents passing through its centre. Run existing race/lap tests too, report exact results. Root will run whole suite/build after integration. Commit only owned files using git -c user.name=Codex -c user.email=codex@local if identity unavailable. Report full evidence in docs/v02-collision-report.md, return brief status+commit+tests.
