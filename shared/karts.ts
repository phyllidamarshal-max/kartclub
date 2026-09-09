/** Visual models only. Vehicle performance and contact geometry are shared. */
export const KARTS = Object.freeze(
  [
    {
      id: "apex",
      name: "APEX GT",
      subtitle: "Pearl Touring",
      description:
        "Flowing bodywork, champagne trim and a low touring spoiler.",
      color: "#eae2d1",
      accent: "#b68a43",
    },
    {
      id: "vesper",
      name: "VESPER",
      subtitle: "Black Edition",
      description: "A sculpted wedge, blade intakes and a high rear wing.",
      color: "#22282c",
      accent: "#a9b8bd",
    },
    {
      id: "corsa",
      name: "CORSA",
      subtitle: "Circuit Special",
      description: "Exposed suspension, a racing nose and separate aero wings.",
      color: "#b92d34",
      accent: "#f0e4cf",
    },
    {
      id: "aurelia",
      name: "AURELIA",
      subtitle: "Heritage Luxe",
      description: "Rounded arches, round lamps and warm metal detailing.",
      color: "#184838",
      accent: "#c29b52",
    },
    {
      id: "tempest",
      name: "TEMPEST",
      subtitle: "Twin-Pod Sport",
      description:
        "Twin front pods, a central channel and split rear winglets.",
      color: "#244fa5",
      accent: "#b5c6cc",
    },
    {
      id: "rallye",
      name: "RALLYE",
      subtitle: "Rally Sport",
      description: "Rally lamps, protective rails and treaded tire detailing.",
      color: "#bc812d",
      accent: "#505a60",
    },
    {
      id: "club",
      name: "CLUB",
      subtitle: "Club Original",
      description: "The original open-wheel Club kart in your driver color.",
      color: "#aec83e",
      accent: "#eff0dc",
    },
  ].map((kart) => Object.freeze(kart)),
) as readonly Readonly<{
  id: "apex" | "vesper" | "corsa" | "aurelia" | "tempest" | "rallye" | "club";
  name: string;
  subtitle: string;
  description: string;
  color: string;
  accent: string;
}>[];

export type KartId = (typeof KARTS)[number]["id"];
export const DEFAULT_KART_ID: KartId = "apex";
export function sanitizeKartId(
  value: unknown,
  fallback: KartId = "club",
): KartId {
  return typeof value === "string" && KARTS.some((kart) => kart.id === value)
    ? (value as KartId)
    : fallback;
}
export function getKart(value: unknown) {
  const id = sanitizeKartId(value);
  return KARTS.find((kart) => kart.id === id)!;
}
export function kartForSlot(slot: number): KartId {
  const index = Number.isFinite(slot)
    ? Math.abs(Math.trunc(slot)) % KARTS.length
    : 0;
  return KARTS[index].id;
}
