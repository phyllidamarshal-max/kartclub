/** Distances are world metres. Narrowing belongs inside the branch, never on a join. */
export interface ShortcutDesign {
  readonly label: string;
  readonly cue: string;
  readonly tangentScale: number;
  readonly offset: number;
  readonly waves: number;
  readonly widths: readonly { readonly f: number; readonly width: number }[];
}
const design = (
  label: string,
  cue: string,
  tangentScale: number,
  offset: number,
  waves: number,
  width: number,
  pinch: number,
): ShortcutDesign =>
  Object.freeze({
    label,
    cue,
    tangentScale,
    offset,
    waves,
    widths: Object.freeze(
      [
        { f: 0, width: 11 },
        { f: 0.1, width: 9 },
        { f: pinch, width },
        { f: 0.6, width },
        { f: 0.8, width: 8.4 },
        { f: 1, width: 10 },
      ].map((stop) => Object.freeze(stop)),
    ),
  });
export const SHORTCUT_DESIGNS: Readonly<Record<string, ShortcutDesign>> =
  Object.freeze({
    "forest-ridge": design("ROUTE B", "TECHNICAL ROUTE", 0.96, 10, 1, 9, 0.32),
    "harbor-dual": design(
      "ROUTE B",
      "TECHNICAL ROUTE",
      0.94,
      -12,
      1,
      8.5,
      0.32,
    ),
    "space-interchange": design(
      "ROUTE B",
      "TECHNICAL ROUTE",
      0.92,
      13,
      1,
      8,
      0.32,
    ),
    "coast-harbor": design("DOCK CUT", "NARROW APEX", 0.86, 5, 1, 6, 0.3),
    "coast-breakwater": design(
      "RUIN SLALOM",
      "LINK THE TURNS",
      0.84,
      -6,
      1,
      5.8,
      0.32,
    ),
    "city-factory": design(
      "SERVICE CHICANE",
      "EARLY TURN-IN",
      0.84,
      3.5,
      2,
      5.8,
      0.28,
    ),
    "city-nightshift": design(
      "ORBIT CUT",
      "STRAIGHTEN TO BOOST",
      0.82,
      -8,
      1,
      5.6,
      0.36,
    ),
    mountain: design("TIMBER CUT", "HOLD YOUR LINE", 0.9, 3, 1, 5.8, 0.28),
  });

/** Zero offset and first derivative at both joins preserves position and tangents. */
export function shortcutOffset(f: number, design: ShortcutDesign) {
  return (
    design.offset *
    Math.sin(Math.PI * f) ** 2 *
    Math.sin(2 * Math.PI * f * design.waves)
  );
}
