import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCar, stepCar, EMPTY_INPUT } from "../shared/race.ts";
import { DEFAULT_TRACK } from "../shared/track.ts";
import {
  DRIVER_OUTFITS,
  sanitizeDriverAppearance,
  driverForSlot,
} from "../shared/drivers.ts";

test("wardrobe IDs reject malformed appearance data and AI outfits are deterministic", () => {
  assert.deepEqual(
    sanitizeDriverAppearance({ outfitId: "neko", colorId: "coral" }),
    { outfitId: "neko", colorId: "coral" },
  );
  for (const value of [
    null,
    "red",
    { outfitId: "<script>", colorId: "#ffffff" },
    { outfitId: [], colorId: {} },
  ])
    assert.deepEqual(sanitizeDriverAppearance(value), {
      outfitId: "club",
      colorId: "lime",
    });
  assert.equal(
    new Set(DRIVER_OUTFITS.map((_, i) => driverForSlot(i).outfitId)).size,
    7,
  );
});

test("selected outfit/color survive driving and reset without changing physics", () => {
  const baseline = spawnCar(0, "same", DEFAULT_TRACK, "apex");
  const styled = Reflect.apply(spawnCar, undefined, [
    0,
    "same",
    DEFAULT_TRACK,
    "apex",
    { outfitId: "rally", colorId: "gold" },
  ]);
  assert.equal(styled.driverOutfit, "rally");
  assert.equal(styled.driverColor, "gold");
  for (let frame = 0; frame < 240; frame++) {
    const input = {
      ...EMPTY_INPUT,
      throttle: 1,
      steer: frame > 80 ? 0.6 : 0,
      drift: frame > 80 && frame < 170,
      boost: frame === 210,
      reset: frame === 190,
    };
    stepCar(baseline, input, 1 / 60, DEFAULT_TRACK);
    stepCar(styled, input, 1 / 60, DEFAULT_TRACK);
  }
  const { driverOutfit, driverColor, ...simulation } = styled;
  assert.equal(driverOutfit, "rally");
  assert.equal(driverColor, "gold");
  assert.deepEqual(simulation, baseline);
});
