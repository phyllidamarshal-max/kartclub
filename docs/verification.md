# Verification record

Environment: Windows, Node 24.16.0; pinned package versions recorded in package-lock.json. User approved the first-stage scope and simulated economics on 2026-09-07.

## Completed automated checks

- Final `npm test`: 34 passing tests, 0 failures, including actual server restart recovery, replacement model loading, and the regression ensuring repeated reconnect failures do not extend the first 30-second deadline.
- `npm run build`: strict TypeScript check and Vite production build succeeded.
- `npm run smoke`: two actual Colyseus SDK clients connected to an isolated local server, drove the entire track through throttle and steering packets, received identical rankings and claimed rewards.
- Full-race result after signed-progress fixes: 27.4833 s and 27.7000 s; total wall time 30.902 s including countdown. Awards 7,000 / 3,000 minor units = 70 / 30 PONS. Both duplicate claims returned the same receipt without another payment.
- Final smoke pool: received 1,284,000; available 1,274,000; reserved 0; pending 0; paid 10,000; separate ticket revenue 2,000. Conservation held.
- Real networking regression: forged identity rejected; two clients see one room; pre-start exit cancels and refunds; server ignores client-supplied position/lap/finished fields; transport interruption reconnects the same paid seat; voluntary post-start departures release unused prize without refunding tickets.
- Ledger restart tests reopen on-disk SQLite, recover reserved matches, and preserve settled unclaimed awards.
- Resource validation rejects malformed colors, asset paths, duplicate challenge IDs and fractional laps. Driver/scenery resource paths and palette can change independently of shared driving logic.

## Browser checks

- Opened the actual local app in the Codex browser and inspected rendered lobby and chase-camera race screen.
- Checked keyboard acceleration response, speed display, circuit rendering, minimap and simulated-funds labeling.
- Resolved the Three.js shadow-map deprecation by using PCFShadowMap and tuned shadow bias to remove visible self-shadow artifacts.
- Inspected the settings dialog with independent music/effects volumes, high/smooth graphics, and remappable keyboard controls. Reopened the final local app after restarting the server with the reviewed driving fixes; health API confirms simulation mode.

Additional browser check: two independent browser tabs created/joined room 14850178, displayed both named players, toggled readiness and entered the same countdown/race. The rendered multiplayer chase view showed both colored karts and the two-player position indicator. This complements the automated full-race SDK test.

Additional automated checks: four distinct clients successfully occupy all four slots and a fifth is rejected. The supplied replacement robot glTF parses through the actual Three.js GLTFLoader and its bounding box fits the kart's character scale.

The actual restart integration test forcibly terminates a server after both players pay, restarts against the same database, verifies their existing account tokens still work, and checks that all tickets and reserved prizes are recovered.

Final review identified signed-start progress and two client lifecycle defects. Fixes and fresh regression results are recorded in `docs/review-fixes.md`; review disposition is in `docs/final-review.md`.

## Material limitations

- These are local-device/local-server checks. Public-network lag, cross-device firewall reachability and production capacity are not established.
- Code-driven drivers verify that a legal-input race can complete. They are test fixtures, not fake players shown in a multiplayer room.
- The Vite bundle-size warning concerns the combined 3D-engine bundle; the build succeeds. Performance figures must be tied to an actual sampled viewport/device, not inferred from this build.
- No real wallet, chain, token contract, trading tax collector or mainnet funds are connected.
- No claim of exact legacy driving formulas or commercial asset quality.
