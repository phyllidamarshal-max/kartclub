# Reference scene lighting and geometry follow-up

User scope: scene optimization only. Gameplay is assigned to another agent; see `docs/gameplay-phase-one-handoff.md` for work already performed before the clarification.

Visual target: the provided front/back coastal-village references. Match warm directional sunlight, cooler skylight, firm contact shadows with softened cast-shadow edges, faceted leaves and rock planes, substantial roof/window edges, subtle dry asphalt aggregate, turquoise layered sea, cream/blue village, wooden fence and dense low roadside plants. This is real 3D racing scenery, not a background illustration replacement.

- [x] Main coastal artist: cottage/shore/vegetation geometry, water, coast-only sun and shadow configuration, shader and road helper integration.
- [x] Road surface: distance-filtered procedural aggregate shading and bounded transparent rubber traces along actual bend geometry. Unit checks 2/2 passed before integration.
- [x] Reviewer: shader correctness, batch compatibility, shadow movement, road clearance, resource ownership. Corrected ground/cliff occlusion and retired material ownership after visual and resource checks.
- [x] Final validation: build, 30 scenery/road/lifecycle checks, actual front/rear/overview renders. Fidelity differences recorded in `docs/scene-realism-2026-09-08.md`; this is not a pixel-identical reconstruction.

No gameplay code changes after scope clarification. No commits or deployment.
