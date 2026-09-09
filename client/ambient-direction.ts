/** Visual interpretation of the user's 19-map music brief. No audio/BPM claims. */
export type AmbientStageKind =
  | "winch"
  | "ventilation"
  | "piston"
  | "orrery"
  | "wind-banner"
  | "minecart"
  | "gears";
export interface AmbientDirection {
  mood: string;
  actor?: "whale" | "camel" | "bird";
  stage?: AmbientStageKind;
  cycle: number;
  active: number;
  amplitude: number;
  height: number;
}
export const AMBIENT_DIRECTIONS: Readonly<Record<string, AmbientDirection>> = {
  coast: {
    mood: "sunlit island / broad phrases",
    actor: "whale",
    cycle: 34,
    active: 5,
    amplitude: 1,
    height: 0,
  },
  "coast-causeway": {
    mood: "open coast / long forward motion",
    actor: "whale",
    cycle: 40,
    active: 5,
    amplitude: 0.85,
    height: 0,
  },
  "coast-harbor": {
    mood: "warm brass / busy freight",
    stage: "winch",
    cycle: 18,
    active: 10,
    amplitude: 1,
    height: 0,
  },
  "harbor-dual": {
    mood: "alternating freight phrases",
    stage: "winch",
    cycle: 14,
    active: 7,
    amplitude: 0.8,
    height: 0,
  },
  "coast-breakwater": {
    mood: "dune adventure / running hand drums",
    actor: "camel",
    cycle: 32,
    active: 27,
    amplitude: 1,
    height: 0,
  },
  "desert-canyon": {
    mood: "canyon pursuit / narrow calls and replies",
    actor: "camel",
    cycle: 38,
    active: 26,
    amplitude: 0.8,
    height: 0,
  },
  city: {
    mood: "neon breakbeat / distant city motion",
    stage: "ventilation",
    cycle: 14,
    active: 10,
    amplitude: 1,
    height: 0,
  },
  "city-switchback": {
    mood: "short syncopated street phrases",
    stage: "ventilation",
    cycle: 11,
    active: 7,
    amplitude: 0.7,
    height: 0,
  },
  "city-factory": {
    mood: "heavy industrial beat",
    stage: "piston",
    cycle: 12,
    active: 8,
    amplitude: 1,
    height: 0,
  },
  "factory-shift": {
    mood: "precise clockwork / interlocking figures",
    stage: "gears",
    cycle: 9,
    active: 6,
    amplitude: 0.8,
    height: 0,
  },
  "city-nightshift": {
    mood: "airy harmony / broad orbital scale",
    stage: "orrery",
    cycle: 32,
    active: 25,
    amplitude: 0.5,
    height: 0,
  },
  "space-interchange": {
    mood: "quick arpeggio / alternate orbital phrases",
    stage: "orrery",
    cycle: 18,
    active: 12,
    amplitude: 1,
    height: 0,
  },
  mountain: {
    mood: "wood flute / forest life with rests",
    actor: "bird",
    cycle: 26,
    active: 11,
    amplitude: 1,
    height: 5,
  },
  "forest-orchard": {
    mood: "bright guitar / playful short calls",
    actor: "bird",
    cycle: 19,
    active: 6,
    amplitude: 0.8,
    height: 3,
  },
  "forest-ridge": {
    mood: "panpipe / high canopy exploration",
    actor: "bird",
    cycle: 32,
    active: 17,
    amplitude: 1.4,
    height: 10,
  },
  "mountain-pass": {
    mood: "cold piano / vast restrained movement",
    stage: "wind-banner",
    cycle: 23,
    active: 15,
    amplitude: 0.45,
    height: 0,
  },
  "ice-lagoon": {
    mood: "glass and harp / delicate glide",
    stage: "wind-banner",
    cycle: 16,
    active: 10,
    amplitude: 0.25,
    height: 0,
  },
  "mountain-summit": {
    mood: "heavy low drums / weight and pressure",
    stage: "minecart",
    cycle: 30,
    active: 18,
    amplitude: 0.7,
    height: 0,
  },
  "mine-transit": {
    mood: "rail rhythm / travel into depth",
    stage: "minecart",
    cycle: 22,
    active: 17,
    amplitude: 1,
    height: 0,
  },
};
export function ambientDirection(
  trackId: string,
): AmbientDirection | undefined {
  return AMBIENT_DIRECTIONS[trackId];
}

/** Smooth round trip with a real rest interval, including a zero-velocity turn. */
export function ambientTravel(
  seconds: number,
  cycle: number,
  active: number,
): number {
  const phase = ((seconds % cycle) + cycle) % cycle;
  return phase >= active
    ? 0
    : (1 - Math.cos((Math.PI * 2 * phase) / active)) * 0.5;
}
