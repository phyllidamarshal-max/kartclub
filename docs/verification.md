# Verification record

Environment: Windows, Node 24.16.0; pinned package versions recorded in package-lock.json. User approved the first-stage scope and simulated economics on 2026-09-07.

## Completed automated checks

- `npm test`: 25 passing tests at the initial integrated checkpoint; later final result is recorded below.
- `npm run build`: strict TypeScript check and Vite production build succeeded.
- `npm run smoke`: two actual Colyseus SDK clients connected to an isolated local server, drove the entire track through throttle and steering packets, received identical rankings and claimed rewards.
- Full-race reference result: 27.3833 s and 27.7167 s; total wall time 30.9 s including countdown. Awards 7,000 / 3,000 minor units = 70 / 30 PONS. Both duplicate claims returned the same receipt without another payment.
- Final smoke pool: received 1,284,000; available 1,274,000; reserved 0; pending 0; paid 10,000; separate ticket revenue 2,000. Conservation held.
- Real networking regression: forged identity rejected; two clients see one room; pre-start exit cancels and refunds; server ignores client-supplied position/lap/finished fields; transport interruption reconnects the same paid seat; voluntary post-start departures release unused prize without refunding tickets.
- Ledger restart tests reopen on-disk SQLite, recover reserved matches, and preserve settled unclaimed awards.
- Resource validation rejects malformed colors, asset paths, duplicate challenge IDs and fractional laps. Driver/scenery resource paths and palette can change independently of shared driving logic.

## Browser checks

- Opened the actual local app in the Codex browser and inspected rendered lobby and chase-camera race screen.
- Checked keyboard acceleration response, speed display, circuit rendering, minimap and simulated-funds labeling.
- Resolved the Three.js shadow-map deprecation by using PCFShadowMap and tuned shadow bias to remove visible self-shadow artifacts.
- Further browser checks and final review results are appended below as completed.

## Material limitations

- These are local-device/local-server checks. Public-network lag, cross-device firewall reachability and production capacity are not established.
- Code-driven drivers verify that a legal-input race can complete. They are test fixtures, not fake players shown in a multiplayer room.
- The Vite bundle-size warning concerns the combined 3D-engine bundle; the build succeeds. Performance figures must be tied to an actual sampled viewport/device, not inferred from this build.
- No real wallet, chain, token contract, trading tax collector or mainnet funds are connected.
- No claim of exact legacy driving formulas or commercial asset quality.
