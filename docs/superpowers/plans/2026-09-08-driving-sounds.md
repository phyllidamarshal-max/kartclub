# Driving sound implementation — 2026-09-08

Implement the requested nitro, drift and collision effects using original Web Audio synthesis. Keep the existing music and effects volume controls and gameplay rules.

1. Replace frame-random drift blips with a managed tire layer driven by speed and actual slip angle, with a smooth recovery tail. Holding drift at rest must stay silent.
2. Add a nitro launch burst and sustained jet layer. Observe nitro-use counters for chained boosts and distinguish short mini boosts. Consume events while paused or muted; never replay a network counter rollback.
3. Give walls a low impact plus abrasive contact, obstacles a hollow knock and karts a rubbery bump. Bound simultaneous voices and disconnect every finished source.
4. Stop driving layers on pause, hidden page, reset, finish and lobby transitions. Use confirmed multiplayer state for release events.
5. Add audition controls to the existing music room, using the production sound system. Verify event behavior, finite audio data, bounded allocations, mute/lifecycle, volume routing, TypeScript/build and real browser output.

Balance: reuse the existing 45% music / 65% effects defaults. Sustained tire/jet layers should sit under short launch and impact cues; no new user-facing settings are needed. These are original stylized kart sounds, not copied recordings.
