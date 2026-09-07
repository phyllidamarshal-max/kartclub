# Simulated PONS economy implementation report

## Scope

Implemented the bounded fake-money ledger in `server/economy.ts` with tests in `tests/economy.test.ts`. All balances use integer minor units (`UNIT = 100`). A ticket costs `1_000`, every match reserves a `10_000` prize, new accounts receive `100_000` ticket units, and the pool is seeded once with `1_284_000` minor units (12,840 simulated PONS).

## Persistence and isolation

The economy uses Node 24's synchronous `node:sqlite` API. SQLite tables persist accounts, a singleton pool, matches and immutable entrant order, awards and claim state, and idempotent tax events. Foreign keys, WAL mode, and a busy timeout are enabled. Every multi-row mutation uses `BEGIN IMMEDIATE`, with commit on success and rollback on any validation or database error.

Pool conservation is represented directly by `received = available + reserved + pending + paid`; ticket revenue is tracked separately. Tests assert conservation after reservations, settlements, claims, recovery, and tax injection.

## Behavior covered

- Strict identifiers and safe, nonnegative integer tax volumes
- Account creation and lookup without silently creating accounts in other operations
- Atomic reservation for 2–4 known distinct entrants
- Reservation identity conflicts, insufficient ticket balances, and insufficient pool rollback
- Ordered settlement for zero, one, two, and three-or-more finishers with 100%, 70/30, and 60/30/10 awards
- Rejection of duplicate or forged finishers and changed settlement results
- Pending awards, claim-once payment, and repeatable duplicate claim receipts
- Cancellation refunds and pool release, plus rejection of cancellation after settlement
- Explicit restart recovery of active reservations while preserving settled awards
- Idempotent 2% floored tax injection, event conflicts, and both input and aggregate safe-integer bounds

## Verification

The tests were written first. The initial run failed because `server/economy.ts` did not exist. A later aggregate-overflow regression test failed before the pool-total bound was added, then passed after the transactional validation was implemented.

Commands used:

```text
npx tsx --test tests/economy.test.ts
npx tsc --ignoreConfig --noEmit --target ES2023 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --allowImportingTsExtensions --types node server/economy.ts tests/economy.test.ts
```

Latest focused result: 13 tests passed, 0 failed. Running the equivalent test runner across every current test (`npx tsx --test tests/*.test.ts`) passed 19 tests with 0 failures. The isolated strict TypeScript check for the two economy files exited successfully.

At verification time, `npm test` could not launch because the parent task's local dependency installation had not yet exposed `tsx` in `node_modules/.bin`; `npx tsx` was used for the results above. A full-project `npx tsc --noEmit` reached files outside this task and reported missing Three/Vite declarations plus implicit request-handler types in `client/world.ts`, `server/index.ts`, and `vite.config.ts`. The isolated economy typecheck remained clean; no out-of-scope files or packages were changed.

## Operational note

Constructing `Economy` deliberately does not invoke recovery. The server entry point must call `recover()` once during startup after opening the database. Recovery is idempotent: it cancels and refunds every still-reserved match and leaves settled awards unchanged.
