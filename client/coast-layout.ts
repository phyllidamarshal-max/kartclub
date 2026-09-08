import { trackPoint, trackWidth, type Track } from "../shared/track.ts";
import { roadsideClear } from "./scenery.ts";
import { coastalShoreMargin } from "./coast-details.ts";

export interface CoastPlacement {
  asset: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  scale: number;
}

/** Conservative circumscribed footprints, including roof overhangs and crowns. */
export const COAST_FOOTPRINTS: Record<string, number> = {
  "cottage-hero": 5.5,
  "cottage-gable": 5.4,
  "cottage-low": 5.6,
  lighthouse: 3.2,
  "tree-oak": 2.6,
  "tree-round": 2.6,
  "tree-slender": 2.1,
  "tree-blossom": 2.3,
  "rock-cluster": 2.1,
  "meadow-patch": 1.9,
  "shrub-cluster": 1.6,
};

export function createCoastLayout(track: Track): CoastPlacement[] {
  const result: CoastPlacement[] = [];
  const buildings: CoastPlacement[] = [];
  const place = (
    asset: string,
    t: number,
    side: number,
    setback: number,
    scale = 1,
    turn = 0,
    y = -0.18,
  ) => {
    const p = trackPoint(t, track),
      distance = trackWidth(t, track) / 2 + setback;
    const item = {
      asset,
      x: p.x + Math.cos(p.heading) * distance * side,
      z: p.z - Math.sin(p.heading) * distance * side,
      y,
      heading: p.heading - (side * Math.PI) / 2 + turn,
      scale,
    };
    const radius = COAST_FOOTPRINTS[asset] * scale;
    if (!roadsideClear(track, item.x, item.z, radius + 0.5)) return;
    if (
      buildings.some(
        (b) =>
          Math.hypot(b.x - item.x, b.z - item.z) <
          COAST_FOOTPRINTS[b.asset] * b.scale + radius + 1,
      )
    )
      return;
    result.push(item);
    if (asset.startsWith("cottage") || asset === "lighthouse")
      buildings.push(item);
    return item;
  };
  // Road-left village: alternating courts and gaps instead of a uniform terrace.
  for (let i = 0; i < 9; i++) {
    const t = 0.202 + i * 0.014;
    for (const extra of [0, 6, 12]) {
      if (
        place(
          ["cottage-hero", "cottage-low", "cottage-gable"][i % 3],
          t,
          -1,
          [11, 16, 12.5, 21, 13, 17, 11.5, 19, 13][i] + extra,
          [1, 0.88, 0.94][i % 3],
          ((i % 3) - 1) * 0.1,
        )
      )
        break;
    }
  }
  for (const setback of [19, 26, 33, 40])
    if (place("lighthouse", 0.335, -1, setback, 0.9)) break;
  const trees = ["tree-oak", "tree-round", "tree-slender", "tree-blossom"];
  for (let i = 0; i < 104; i++) {
    const t = (i + 0.37) / 104;
    const scale = 0.8 + ((i * 7) % 11) * 0.027;
    place(trees[i % 4], t, -1, 10 + ((i * 13) % 19), scale, i * 2.4);
    // The outer grass strip is bounded by the same shore profile as the terrain.
    const radius = COAST_FOOTPRINTS[trees[(i + 1) % 4]] * scale;
    if (coastalShoreMargin(t) > radius * 2 + 1.5 && i % 3 === 0)
      place(
        trees[(i + 1) % 4],
        t,
        1,
        coastalShoreMargin(t) - radius - 0.8,
        scale,
        i,
      );
  }
  for (let i = 0; i < 78; i++) {
    const t = (i + 0.43) / 78;
    place(
      "rock-cluster",
      t,
      1,
      coastalShoreMargin(t) + 0.5,
      1.2 + (i % 4) * 0.16,
      i * 1.7,
      -0.75 - (i % 3) * 0.3,
    );
  }
  for (let i = 0; i < 260; i++) {
    const t = (i + 0.61) / 260,
      side = i % 2 ? -1 : 1;
    const asset = i % 4 === 0 ? "shrub-cluster" : "meadow-patch";
    const radius = COAST_FOOTPRINTS[asset] * 0.85;
    const setback = side > 0 ? 3.4 + (i % 3) * 0.8 : 4 + (i % 7) * 1.3;
    if (side > 0 && setback + radius > coastalShoreMargin(t) - 0.4) continue;
    place(asset, t, side, setback, 0.85, i * 2.4);
  }
  return result;
}
