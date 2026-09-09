import test from "node:test";
import assert from "node:assert/strict";
import { createSoloOpponents } from "../client/solo-opponents.ts";
import { KARTS } from "../shared/karts.ts";
import { DRIVER_COLORS, DRIVER_OUTFITS } from "../shared/drivers.ts";
import { spawnCar } from "../shared/race.ts";
import { DEFAULT_TRACK } from "../shared/track.ts";

test("all player combinations remain exclusive in 3, 5 and 7 opponent fields", () => {
  for (const kart of KARTS)
    for (const outfit of DRIVER_OUTFITS)
      for (const color of DRIVER_COLORS)
        for (const count of [3, 5, 7]) {
          const player = spawnCar(0, "local", DEFAULT_TRACK, kart.id, {
            outfitId: outfit.id,
            colorId: color.id,
          });
          const cars = createSoloOpponents(count, DEFAULT_TRACK, player);
          assert.equal(cars.length, count);
          for (const car of cars) {
            assert.notEqual(car.kartId, player.kartId);
            assert.notEqual(car.driverOutfit, player.driverOutfit);
            assert.notEqual(car.driverColor, player.driverColor);
          }
          assert.equal(
            new Set(cars.map((c) => c.kartId)).size,
            Math.min(count, KARTS.length - 1),
          );
          assert.equal(
            new Set(cars.map((c) => c.driverOutfit)).size,
            Math.min(count, DRIVER_OUTFITS.length - 1),
          );
          assert.equal(new Set(cars.map((c) => c.driverColor)).size, count);
        }
});

test("restarts preserve the roster, player and all non-cosmetic spawn state", () => {
  const player = spawnCar(0, "local", DEFAULT_TRACK, "rallye", {
    outfitId: "neko",
    colorId: "coral",
  });
  const original = { ...player };
  const first = createSoloOpponents(7, DEFAULT_TRACK, player);
  assert.deepEqual(createSoloOpponents(7, DEFAULT_TRACK, player), first);
  assert.deepEqual(player, original);
  for (const [i, car] of first.entries()) {
    const { kartId, driverOutfit, driverColor, ...state } = car;
    const { kartId: baseKart, ...baseline } = spawnCar(
      i + 1,
      `AI-${i + 1}`,
      DEFAULT_TRACK,
    );
    assert.deepEqual(state, baseline);
  }
  assert.deepEqual(createSoloOpponents(0, DEFAULT_TRACK, player), []);
});
