# AI item decision report

Added `aiItemInput`, a bounded, side-effect-free item button decision for AI racers.

## Behavior

- Returns `false` when the item world/player is absent, the car is finished, resetting or ghosted, or the engine still records the previous item press.
- Fires missiles only when the item engine can lock a living, active car ahead within 160 metres and less than 5 metres of vertical separation.
- Uses an inactive shield for a missile targeting the AI or a nearby live enemy trap. It also activates proactively when a refreshed, same-elevation item box is 2.5–38 metres ahead along the current lane and its band has not been picked this lap, freeing the one-item capacity for the upcoming pickup.
- Uses boosts only when the caller's driving analysis marks the current straight or corner exit safe and no item boost is already active.
- Drops traps for a close active pursuer. Normal/hard drivers may also place them at sharp bends on tracks no wider than 12 metres, avoiding indefinite trap hoarding in sparse races.
- Reads race state only. It does not consume inventory, grant resources, update button state, or mutate cars, rivals, track data, or the item world.

## Verification

`node --import tsx --test tests/ai-items.test.ts`

The focused suite covers valid and invalid missile targets, vertical separation, missile/trap defense, proactive shield capacity near a valid future box, rejection of behind/cooldown/already-picked boxes, safe boost gating, pursuer/choke trap placement, release frames, missing and inactive state, and input immutability.

The engine places traps four metres behind the user and does not arm them for 0.7 seconds. That offset already keeps the owner outside the 2.5-metre hit radius at placement, while a normally moving racer increases separation before arming, so the tactical trigger needs no additional self-hit workaround.

Integration is intentionally outside this module: the caller must pass its existing safe-straight/corner-exit signal and route the returned boolean into the AI input. With no item world this function returns `false`, allowing the caller to retain any desired legacy fallback.
