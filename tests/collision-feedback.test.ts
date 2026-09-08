import { test } from "node:test";
import assert from "node:assert/strict";
import { CollisionSoundEvents } from "../client/collision-feedback.ts";
const car = (collisionCount: number) => ({
  collisionCount,
  lastCollisionStrength: 0.6,
  lastCollisionKind: "wall" as const,
});
test("multiplayer prediction rollback cannot swallow the next confirmed collision", () => {
  const events = new CollisionSoundEvents();
  events.reset(3);
  assert.equal(events.take(car(4), car(3), true, true), null, "predicted only");
  assert.equal(
    events.take(car(3), car(3), true, true),
    null,
    "corrected prediction",
  );
  assert.deepEqual(events.take(car(4), car(4), true, true), {
    strength: 0.6,
    kind: "wall",
  });
  assert.equal(
    events.take(car(4), car(4), true, true),
    null,
    "duplicate snapshot",
  );
});
test("paused impacts are consumed silently and a new race can play its first hit", () => {
  const events = new CollisionSoundEvents();
  assert.equal(events.take(car(1), null, false, false), null);
  assert.equal(events.take(car(1), null, false, true), null);
  events.reset();
  assert.ok(events.take(car(1), null, false, true));
  assert.equal(
    events.take(car(2), null, true, true),
    null,
    "no authoritative online state",
  );
});
