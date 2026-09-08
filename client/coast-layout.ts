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
  "cottage-hero": 7.8, "cottage-gable": 7.2, "cottage-low": 7.6,
  lighthouse: 5.8, "tree-oak": 3.7, "tree-round": 3.5,
  "tree-slender": 2.5, "tree-blossom": 3.8,
  "rock-cluster": 4.5, "meadow-patch": 2.1, "shrub-cluster": 2.8,
};

export function createCoastLayout(track: Track): CoastPlacement[] {
  const result: CoastPlacement[] = [];
  const buildings: CoastPlacement[] = [];
  const place = (asset: string, t: number, side: number, setback: number, scale = 1, turn = 0, y = -.18) => {
    const p = trackPoint(t, track), distance = trackWidth(t, track) / 2 + setback;
    const item = { asset, x: p.x + Math.cos(p.heading) * distance * side,
      z: p.z - Math.sin(p.heading) * distance * side, y,
      heading: p.heading - side * Math.PI / 2 + turn, scale };
    const radius = COAST_FOOTPRINTS[asset] * scale;
    if (!roadsideClear(track, item.x, item.z, radius + .5)) return;
    if (buildings.some(b => Math.hypot(b.x-item.x,b.z-item.z) < COAST_FOOTPRINTS[b.asset]*b.scale + radius + 1)) return;
    result.push(item);
    if (asset.startsWith("cottage") || asset === "lighthouse") buildings.push(item);
    return item;
  };
  // Road-left village: alternating courts and gaps instead of a uniform terrace.
  for (let i = 0; i < 9; i++) {
    const t = .202 + i * .014;
    for (const extra of [0, 6, 12]) {
      if (place(["cottage-hero", "cottage-low", "cottage-gable"][i % 3], t, -1,
        [11, 16, 12.5, 21, 13, 17, 11.5, 19, 13][i] + extra, [1, .88, .94][i % 3], (i % 3 - 1) * .10)) break;
    }
  }
  place("lighthouse", .335, -1, 31, .9);
  const trees = ["tree-oak", "tree-round", "tree-slender", "tree-blossom"];
  for (let i = 0; i < 104; i++) {
    const t = (i + .37) / 104;
    const scale = .8 + (i * 7 % 11) * .027;
    place(trees[i % 4], t, -1, 10 + (i * 13 % 19), scale, i * 2.4);
    // The outer grass strip is bounded by the same shore profile as the terrain.
    const radius = COAST_FOOTPRINTS[trees[(i + 1) % 4]] * scale;
    if (coastalShoreMargin(t) > radius * 2 + 1.5 && i % 3 === 0)
      place(trees[(i + 1) % 4], t, 1, coastalShoreMargin(t) - radius - .8, scale, i);
  }
  for (let i = 0; i < 78; i++) {
    const t = (i + .43) / 78;
    place("rock-cluster", t, 1, coastalShoreMargin(t) + .5, .8 + (i % 4) * .1, i * 1.7, -1.35 - i % 3 * .4);
  }
  for (let i = 0; i < 260; i++) {
    const t = (i + .61) / 260, side = i % 2 ? -1 : 1;
    const asset = i % 4 === 0 ? "shrub-cluster" : "meadow-patch";
    const radius = COAST_FOOTPRINTS[asset] * .85;
    const setback = side > 0 ? 3.4 + i % 3 * .8 : 4 + i % 7 * 1.3;
    if (side > 0 && setback + radius > coastalShoreMargin(t) - .4) continue;
    place(asset, t, side, setback, .85, i * 2.4);
  }
  return result;
}
