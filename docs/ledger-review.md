# Simulated ledger review

## Verdict

**Specification compliance: PASS.** The implementation satisfies the bounded ledger specification for the supplied integration contract. In particular, the root integration uses uppercase alphanumeric match IDs, which are accepted by the identifier validator.

**Implementation and test quality: PASS.** No actionable correctness defect was found in the reviewed diff. The implementation keeps each multi-row state transition in a `BEGIN IMMEDIATE` transaction, persists idempotency receipts, and represents pool conservation explicitly. The reported focused tests and strict typecheck are consistent with the code reviewed.

## Correctness review

- `reserve` validates the complete request before mutating balances, serializes writers with `BEGIN IMMEDIATE`, debits every entrant and moves exactly one prize from `available` to `reserved` in the same transaction. A repeated match ID returns the stored receipt only when the ordered player identity is unchanged; a changed order or roster conflicts. SQLite rollback covers account, match, entrant, and pool writes if any operation fails.
- `settle` permits only distinct original entrants and treats their order as the result identity. One, two, and three-or-more finishers allocate the full `PRIZE`; a fourth valid finisher receives no award under the specified three-place schedule. Empty results return the reserve to `available` while retaining ticket revenue. The stored result and receipt make exact retries repeatable and changed results reject.
- `claim` changes the award, account PONS balance, and pool `pending`/`paid` buckets atomically. The stored claim receipt is returned after the first claim, so retries cannot pay twice. A non-winner, unknown account, or unknown match cannot create an award.
- `cancel` atomically refunds every ticket, releases the prize reserve, reverses ticket revenue, and stores a repeatable cancellation receipt. Settled matches cannot be cancelled. `recover` runs one encompassing write transaction over every still-reserved match, reusing the same cancellation transition; completed awards remain untouched, and the constructor deliberately does not recover implicitly.
- `injectTax` computes `floor(volume * 2 / 100)` without performing an unsafe intermediate multiplication, rejects unsafe or invalid public amounts, checks aggregate pool totals remain safe integers, and stores event input plus its receipt for conflict-safe idempotency.
- The pool transitions preserve `received = available + reserved + pending + paid`: reservations move available to reserved, settlement moves reserved to pending or back to available, claims move pending to paid, and tax injection increases received and available equally. Ticket revenue is separately accumulated and reversed only for cancellation/recovery.
- The public methods, argument order, exported `UNIT`, account shape, pool shape, and pending-award shape match the task contract. Extra exported constants and receipt types do not alter the required API.

## Actionable findings

None.

## Quality notes

The tests exercise rollback for unknown entrants, exhausted tickets, and an exhausted pool; reservation, settlement, tax, cancellation, and claim idempotency conflicts; malformed input; restart recovery; preservation of settled awards; and conservation across representative transitions. The suite does not directly run two concurrent `Economy` instances, but the synchronous SQLite connection plus `BEGIN IMMEDIATE`, WAL mode, and busy timeout provide the required writer serialization in the reviewed implementation. No additional correctness finding follows from that untested stress case.
