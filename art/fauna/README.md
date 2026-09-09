# Editable ambient fauna

Runtime geometry, proportions, materials and pivots are authored in `client/fauna-models.ts`; safe routes, grounded gait and deterministic animation live in `client/ambient-fauna.ts`. These TypeScript files are the actual editable source assets.

`public/art/fauna/*-catalog.glb` are standalone catalog exports for inspection or interchange. The game does **not** load them, and they contain a calm pose, not exported animation clips. There is no `.blend` source or claim of a Blender-authored workflow.

Regenerate the three GLBs and measured catalog metadata with:

```sh
node --import tsx scripts/fauna-assets/export.ts
```

This CPU-only command uses the same builders and scene-local materials. `catalog.json` records measured triangle counts, nominal mesh submissions (excluding shadow passes), model dimensions, deterministic close-up timestamps and standalone-map placement coordinates. Original scene landmarks can move the runtime route candidate, so use `ambientFauna.root.userData.paths` for the final integrated coordinates.
