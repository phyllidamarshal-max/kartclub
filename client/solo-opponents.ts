import { KARTS, sanitizeKartId } from "../shared/karts.ts";
import {
  DRIVER_COLORS,
  DRIVER_OUTFITS,
  sanitizeDriverAppearance,
} from "../shared/drivers.ts";
import { spawnCar, type Car } from "../shared/race.ts";
import type { Track } from "../shared/track.ts";

/** Allocate cosmetics at race start; never changes AI performance or spawn slots. */
export function createSoloOpponents(
  count: number,
  track: Track,
  player: Car,
): Car[] {
  const playerDriver = sanitizeDriverAppearance({
    outfitId: player.driverOutfit,
    colorId: player.driverColor,
  });
  const karts = KARTS.filter((k) => k.id !== sanitizeKartId(player.kartId));
  const outfits = DRIVER_OUTFITS.filter((o) => o.id !== playerDriver.outfitId);
  const colors = DRIVER_COLORS.filter((c) => c.id !== playerDriver.colorId);
  let remainingColors = [...colors];
  return Array.from({ length: count }, (_, index) => {
    const outfit = outfits[index % outfits.length];
    if (!remainingColors.length) remainingColors = [...colors];
    const color =
      remainingColors.find((c) => c.id === outfit.recommendedColor) ??
      remainingColors[0];
    remainingColors = remainingColors.filter((c) => c.id !== color.id);
    const slot = index + 1;
    return spawnCar(slot, `AI-${slot}`, track, karts[index % karts.length].id, {
      outfitId: outfit.id,
      colorId: color.id,
    });
  });
}
