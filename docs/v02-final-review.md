# PONS Kart v0.2 whole-upgrade review

Reviewed the approved v0.2 design and plan, the upgrade diff from `f175d8d` through `e8aff9e`, and the integrating working tree after the collision fix chain. This review is read-only apart from this report. The separate collision reviewer owns the final surface-contact verification. Browser performance/smoke and final README evidence remain the integrating agent's work.

**Latest assessment: no open actionable findings in the reviewed code. The original three P2 findings and immutable-track note are resolved by `1d83118`; the subsequent nine-route configuration-transition P2 is also resolved in the current working tree and independently verified below.**

## Resolved P2 — Dispose instanced objects and light shadow targets when replacing a world

Location: `client/world.ts:726–745`, called by `client/main.ts:79` on every track change.

`World.dispose()` releases mesh geometry, materials and their texture properties, but neither calls `InstancedMesh.dispose()` nor disposes the directional light's shadow. Track changes create a new renderer on the same canvas/context, so renderer replacement must explicitly release these old resources. Rails, skid marks and item effects use instanced meshes; high quality also allocates a 2048×2048 shadow target. These resources are not covered by the existing geometry/material traversal.

The installed Three source confirms the lifecycle: `WebGLObjects.onInstancedMeshDispose` removes the instance matrix/color buffers on the mesh's own `dispose` event; `LightShadow.dispose()` releases its map and map-pass render targets. `WebGLRenderer.dispose()` does not call either operation for scene objects.

A focused Node reproduction invoked the real `World.prototype.dispose` on a scene containing an instanced mesh and a directional light with a render target, listening to their disposal events. Result: `geometryDisposed: 1`, `instanceDisposed: 0`, `targetDisposed: 0`. No full test suite or GPU-performance measurement was repeated. Release the instanced objects and light shadows before renderer disposal, and verify their disposal events on track replacement.

## Resolved P2 — Keep completed v0.1 challenge records accessible after the upgrade

Location: `client/main.ts:58–61`, `153–156`, and `220–234`.

The old `pons-progress` records are still read, but `progress` is never used afterward. The career screen and home completion count use only the new, initially empty `pons-career-v2` store. A returning user with completed `tour`, `time` and `drift` challenges therefore sees zero completed challenges and loses access to all previous best times/drift records. The bytes are not deleted, but the promised preservation of completed original challenge records is not visible or usable in the product.

Retain a clearly labeled classic-records view backed by `pons-progress`, or provide an explicit, appropriate migration. Do not silently reinterpret old one-lap achievements as completion of the substantially different new three-lap challenges. This is a static data-flow finding: repository search finds no consumer of the old `progress` variable after initialization.

## Resolved P2 — Include the mountain shortcut in the in-race minimap

Location: `client/main.ts:661–686` (`drawMinimap`).

The minimap draws only `activeTrack.points`. `activeTrack.shortcut` is rendered as a physical road in `World.buildTrack` and accepted by `nearestTrack`, but is absent from the route shown to the player. A player taking the sanctioned mountain route is drawn crossing empty map space, and the minimap cannot help discover or navigate that route. This misses the approved requirement that the road, shortcut and minimap use the same track definition.

Draw the shortcut as an open branch using the same coordinate transform, distinct enough to communicate its risk/narrowness. Validate the mountain minimap with a car on the branch, in addition to the ordinary three circuit outlines.

## Resolved contract note — Track data is not actually immutable

`Track`, its nested arrays and points remain writable, and `getTrack()` returns the singleton directly. A focused check returns `false` for both `Object.isFrozen(getTrack('mountain'))` and its points array. Current reviewed consumers do not mutate the finished definitions, so this review did not identify a present cross-room failure. Nevertheless, the explicit immutable-track design contract is unenforced, and the prebuilt spatial grid could become stale if a future consumer changes coordinates. Readonly interfaces plus freezing the fully assembled definitions would close this gap.

## Reviewed areas without additional actionable findings

- Room creation validates selected circuit, race/items mode and one-to-three laps. Join options do not overwrite room configuration. The server accepts bounded input commands and owns cars, collisions, inventory, item effects and finish settlement; solo AI stays out of the economic reservation/award path.
- Main-route and shortcut projections share the selected `Track`; no process-global active track is introduced. Existing signed progress and reset checkpoints are retained. The focused track tests cover sampled shortcut projection, not a full legal-input traversal; full collision sign-off remains with the collision reviewer.
- Four item types, shield consumption, reset protection, finite trap/projectile lifetime, item-box cooldown, edge-triggered input and finished-car exclusions are wired into solo and server simulation. Client item rendering/HUD consume server snapshots in multiplayer.
- Three AI difficulty branches feed legal shared simulation inputs. Ghost capture is sampled and bounded by the solo time limit; stored recordings are checked before use, interpolation handles wrapped heading, and best laps persist per selected circuit. Nine career challenges enforce predecessor unlocks and minimum achievement conditions.
- Static batches bake world transforms and preserve per-cell/material grouping; replaced geometry is disposed and resize listeners are removed. The specific missing resource classes are covered by the first finding above.

This review did not repeat the integrating agent's full automated suite, four-car full runs, real networking checks or browser/performance measurements. Passing evidence from those runs should remain separately attributed in the final verification report.

## Independent follow-up: fixes and nine-route expansion

Reviewed `1d83118`, `docs/v02-review-fixes.md`, and the current uncommitted changes in `shared/route-data.ts`, `shared/track.ts`, `shared/ai.ts`, `shared/gameplay.ts` and `client/main.ts` after the request for harder, non-repeating challenges.

The original findings are closed: disposal now releases instance buffers and both shadow targets, deduplicates shared resources, and discards late GLTF loads after world replacement; the career screen displays validated classic history without granting new stars; `paintMinimap` draws the shared branch with the same transform as car markers; completed track definitions and all nested geometry collections are frozen after assembly. Independently ran the nine focused regression cases in `career-history`, `minimap`, `world-lifecycle` and `track-immutability`: **9 passed, 0 failed**. No full suite was repeated.

The expanded career uses nine different registered centerlines, not transformed copies. Its opponent count, difficulty, drift/item minimums, rank restrictions, three/four-lap goals and time limits are applied by the solo setup/result paths. AI receives the current opponents and modifies line choice and target speed for nearby traffic. Free races expose three/five/seven opponents; time/practice spawn no opponents. No additional actionable route, item-authority or ghost defect was found in this pass. The integrating agent's 71-test/full-run and browser/smoke evidence remains separately owned; this static review does not independently establish human difficulty balance.

### Resolved P2 — Normalize a four-lap career selection before direct multiplayer creation

Location: `client/main.ts` `beginSolo`, `online`, `showModal` and `act`'s `create` branch; `shared/gameplay.ts` challenge `mountain-time` and `validateMatch`.

Starting career challenge eight now assigns `selection.laps = 4`. After returning to the lobby and opening the multiplayer page, clicking **创建房间** directly sends those four laps to the server, which correctly rejects configurations outside one-to-three laps. The new normalizer runs only when the player opens `setup` or `room-config`, so the primary create action fails unless the player first visits the optional settings dialog. The multiplayer page also advertises the stale four-lap/time configuration before creation, even though its mode is silently converted to `race` in the request.

Reproduction: start the unlocked **云岭九曲 · 耐力驾照**, exit to the lobby, open **多人联机**, then click **创建房间** without opening **赛事设置**. Static tracing shows the unchanged selection follows this path. A focused Node reproduction using challenge eight and the exact creation parameter mapping returned `{"challenge":"mountain-time","laps":4,"error":"比赛模式或圈数无效"}` from the real `validateMatch`.

Normalize the online selection before rendering its rules and before direct creation, or keep separate solo/online configurations. Cover the four-lap career-to-online transition and confirm the advertised track/mode/laps match the request. Keep four laps intact when retrying the career challenge itself.

**Fix verification:** `matchForSelection` now returns a server-validated configuration, converting time/practice to race and a four-lap solo choice to three laps without mutating the original selection. Both `online()`'s advertised mode/laps and the direct `net.join()` call use this helper. Career retry still reconstructs its four-lap selection from the challenge. Independently ran `npx tsx --test tests/gameplay.test.ts`: **4 passed, 0 failed**, including the exact eight-challenge transition, preservation of the original four-lap selection, and preservation of a valid two-lap item configuration. This closes the additional P2; browser and final SDK smoke sign-off remain with the integrating agent.
