/** Cosmetic wardrobe IDs only; none of these values affect driving or collision. */
export const DRIVER_COLORS = [
  { id: "lime", name: "Club Lime", color: "#aec83e" },
  { id: "coral", name: "Coral Pink", color: "#e4778e" },
  { id: "sky", name: "Sky Blue", color: "#4d9ccc" },
  { id: "violet", name: "Soft Violet", color: "#9473c1" },
  { id: "red", name: "Racing Red", color: "#c74948" },
  { id: "gold", name: "Amber Gold", color: "#cf953e" },
  { id: "forest", name: "Forest Green", color: "#2d7052" },
  { id: "pearl", name: "Pearl White", color: "#e9dfc7" },
] as const;
export type DriverColorId = (typeof DRIVER_COLORS)[number]["id"];
export const DRIVER_OUTFITS = [
  {
    id: "circuit",
    name: "Circuit Pro",
    description:
      "A fitted racing suit with shoulder panels and precision trim.",
    recommendedColor: "red",
  },
  {
    id: "street",
    name: "Street Shift",
    description: "A street jacket with a ribbed collar, cuffs and bold panels.",
    recommendedColor: "violet",
  },
  {
    id: "varsity",
    name: "Varsity Club",
    description:
      "A varsity jacket with contrast sleeves and striped knit trim.",
    recommendedColor: "sky",
  },
  {
    id: "aviator",
    name: "Heritage Pilot",
    description:
      "A flight jacket with a shearling collar and a compact neck scarf.",
    recommendedColor: "gold",
  },
  {
    id: "rally",
    name: "Rally Guard",
    description:
      "A padded rally suit with shoulder guards and glove protection.",
    recommendedColor: "forest",
  },
  {
    id: "neko",
    name: "Pixel Paws",
    description: "A soft hoodie with small cat ears and playful paw details.",
    recommendedColor: "coral",
  },
  {
    id: "club",
    name: "Club Original",
    description: "The original cream driving suit and full-face helmet.",
    recommendedColor: "lime",
  },
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  recommendedColor: DriverColorId;
}[];
export type DriverOutfitId = (typeof DRIVER_OUTFITS)[number]["id"];
export interface DriverAppearance {
  outfitId: DriverOutfitId;
  colorId: DriverColorId;
}
export const DEFAULT_DRIVER: Readonly<DriverAppearance> = Object.freeze({
  outfitId: "club",
  colorId: "lime",
});
export function sanitizeDriverOutfit(value: unknown): DriverOutfitId {
  return typeof value === "string" &&
    DRIVER_OUTFITS.some((outfit) => outfit.id === value)
    ? (value as DriverOutfitId)
    : "club";
}
export function sanitizeDriverColor(value: unknown): DriverColorId {
  return typeof value === "string" &&
    DRIVER_COLORS.some((color) => color.id === value)
    ? (value as DriverColorId)
    : "lime";
}
export function sanitizeDriverAppearance(value: unknown): DriverAppearance {
  const appearance =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    outfitId: sanitizeDriverOutfit(appearance.outfitId),
    colorId: sanitizeDriverColor(appearance.colorId),
  };
}
export function getDriverOutfit(value: unknown) {
  return DRIVER_OUTFITS.find(
    (outfit) => outfit.id === sanitizeDriverOutfit(value),
  )!;
}
export function getDriverColor(value: unknown) {
  return DRIVER_COLORS.find(
    (color) => color.id === sanitizeDriverColor(value),
  )!;
}
export function driverForSlot(slot: number): DriverAppearance {
  const index = Number.isFinite(slot)
    ? Math.abs(Math.trunc(slot)) % DRIVER_OUTFITS.length
    : 0;
  const outfit = DRIVER_OUTFITS[index];
  return { outfitId: outfit.id, colorId: outfit.recommendedColor };
}
