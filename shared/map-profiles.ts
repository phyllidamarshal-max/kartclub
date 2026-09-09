export type MapRating = 1 | 2 | 3 | 4;
export interface MapProfile {
  readonly rating: MapRating;
  readonly minWidth: number;
  readonly tightRadius: number;
  readonly bendRadius: number;
  readonly layout: "circuit" | "ab";
  readonly mechanic: "flow" | "precision" | "surface" | "traffic" | "timing";
  readonly isNew: boolean;
}
function profile(
  rating: MapRating,
  mechanic: MapProfile["mechanic"],
  isNew = false,
  layout: MapProfile["layout"] = "circuit",
): MapProfile {
  return Object.freeze({
    rating,
    mechanic,
    isNew,
    layout,
    minWidth: [0, 16, 12.5, 10.5, 9.5][rating],
    tightRadius: [0, 34, 29, 26, 26][rating],
    bendRadius: [0, 40, 35, 32, 32][rating],
  });
}
export const MAP_PROFILES: Readonly<Record<string, MapProfile>> = Object.freeze(
  {
    coast: profile(1, "flow"),
    city: profile(2, "precision"),
    "coast-harbor": profile(3, "precision"),
    "coast-breakwater": profile(3, "surface"),
    mountain: profile(3, "precision"),
    "mountain-pass": profile(3, "surface"),
    "city-factory": profile(4, "precision"),
    "city-nightshift": profile(4, "precision"),
    "mountain-summit": profile(4, "precision"),
    "forest-orchard": profile(1, "flow", true),
    "coast-causeway": profile(1, "flow", true),
    "city-switchback": profile(2, "precision", true),
    "forest-ridge": profile(2, "precision", true, "ab"),
    "desert-canyon": profile(3, "surface", true),
    "ice-lagoon": profile(3, "surface", true),
    "harbor-dual": profile(3, "traffic", true, "ab"),
    "factory-shift": profile(4, "timing", true),
    "space-interchange": profile(4, "traffic", true, "ab"),
    "mine-transit": profile(4, "timing", true),
  },
);
const legacy = profile(2, "flow");
export function mapProfile(id: string): MapProfile {
  return MAP_PROFILES[id] ?? legacy;
}
export const MAP_RATING_LABELS: Readonly<Record<MapRating, string>> =
  Object.freeze({ 1: "Beginner", 2: "Club", 3: "Advanced", 4: "Expert" });
