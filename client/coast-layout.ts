import { trackPoint, trackWidth, type Track } from "../shared/track.ts";
import { roadsideClear } from "./scenery.ts";
import { coastalShoreMargin } from "./coast-details.ts";
import { createReferenceLayout } from './reference-layout.ts';

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
  "tree-oak": 2.8,
  "tree-round": 2.7,
  "tree-slender": 2.1,
  "tree-blossom": 2.4,
  "rock-cluster": 2.1,
  "meadow-patch": 1.9,
  "shrub-cluster": 1.6,
};

/** Door-aligned approach origin, shared by paving and the planting exclusion. */
export function coastCottageApproach(house: CoastPlacement) {
  const offset =
    (house.asset === "cottage-hero"
      ? -1.5
      : house.asset === "cottage-low"
        ? -1.45
        : 0) * house.scale;
  return {
    x: house.x + Math.cos(house.heading) * offset,
    z: house.z - Math.sin(house.heading) * offset,
  };
}

export function createCoastLayout(track: Track): CoastPlacement[] {
  if(track.id==='reference-coast-v1')return createReferenceLayout(track,COAST_FOOTPRINTS);
  const result: CoastPlacement[] = [];
  const buildings: CoastPlacement[] = [];
  const solids: CoastPlacement[] = [];
  // Keep the village a walkable 130 m sequence when the racing route grows.
  const villageStart = track.id === "coast" ? 0.235 : 0.202;
  const villageT = (metres: number) => villageStart + metres / track.length;
  let seed = 91827;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
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
    const solid = /^(cottage|tree)|lighthouse/.test(asset);
    if (!roadsideClear(track, item.x, item.z, radius + 0.5)) return;
    if (
      buildings.some(
        (b) =>
          Math.hypot(b.x - item.x, b.z - item.z) <
          COAST_FOOTPRINTS[b.asset] * b.scale + radius + 1,
      )
    )
      return;
    if (
      solid &&
      solids.some(
        (other) =>
          Math.hypot(other.x - item.x, other.z - item.z) <
          COAST_FOOTPRINTS[other.asset] * other.scale + radius + 0.75,
      )
    )
      return;
    // Trees must not obscure the lighthouse's narrow silhouette or door paths.
    if (
      asset.startsWith("tree") &&
      buildings.some(
        (b) =>
          b.asset === "lighthouse" &&
          Math.hypot(b.x - item.x, b.z - item.z) < radius + 11,
      )
    )
      return;
    if (
      /meadow|shrub|tree/.test(asset) &&
      buildings.some((b) => {
        if (!b.asset.startsWith("cottage")) return false;
        const approach = coastCottageApproach(b);
        const dx = item.x - approach.x,
          dz = item.z - approach.z;
        const forward = dx * Math.sin(b.heading) + dz * Math.cos(b.heading);
        const sideways = dx * Math.cos(b.heading) - dz * Math.sin(b.heading);
        return forward > 0 && forward < 22 && Math.abs(sideways) < radius + 1;
      })
    )
      return;
    result.push(item);
    if (solid) solids.push(item);
    if (asset.startsWith("cottage") || asset === "lighthouse")
      buildings.push(item);
    return item;
  };
  // Short front gardens alternate with two deeper courts; physical spacing is
  // independent of route length and all three existing cottage profiles recur.
  for (let i = 0; i < 9; i++) {
    const t = villageT([0, 15, 29, 45, 61, 77, 94, 110, 127][i]);
    for (const extra of [0, 2, 4]) {
      if (
        place(
          ["cottage-hero", "cottage-low", "cottage-gable"][i % 3],
          t,
          -1,
          [7.8, 8.2, 8.1, 12.2, 7.5, 8.3, 8, 11.8, 7.8][i] + extra,
          [1.08, 0.93, 1][i % 3],
          ((i % 3) - 1) * 0.065,
        )
      )
        break;
    }
  }
  // The tower occupies the seaward grass shelf, separated from the roof line.
  // Its whole base fits inside the same shore profile used by the terrain.
  const towerT = villageT(140),
    towerScale = 1.02;
  const towerRadius = COAST_FOOTPRINTS.lighthouse * towerScale;
  const towerSetback = Math.min(
    5.2,
    coastalShoreMargin(towerT) - towerRadius - 0.8,
  );
  if (!place("lighthouse", towerT, 1, towerSetback, towerScale)) {
    for (const setback of [9, 13, 18, 24])
      if (place("lighthouse", towerT, -1, setback, towerScale)) break;
  }
  const trees = ["tree-oak", "tree-round", "tree-slender"];
  // Keep the same authored crowns readable along the full length of both courses.
  const treeCount = Math.min(240, Math.max(110, Math.ceil(track.length / 20)));
  for (let i = 0; i < treeCount; i++) {
    const t = (i + 0.18 + random() * 0.64) / treeCount;
    const scale = 1.06 + random() * 0.44;
    if (t < villageT(-25) || t > villageT(175))
      place(trees[i % 3], t, -1, 9 + random() * 19, scale, random() * 6.28);
    // The outer grass strip is bounded by the same shore profile as the terrain.
    const radius = COAST_FOOTPRINTS[trees[(i + 1) % 3]] * scale;
    if (coastalShoreMargin(t) > radius * 2 + 1.5 && i % 5 === 0)
      place(
        trees[(i + 1) % 3],
        t,
        1,
        coastalShoreMargin(t) - radius - 0.8,
        scale,
        i,
      );
  }
  for (let i = 0; i < 78; i++) {
    const t = (i + 0.43) / 78;
    const scale = 2.7 + random() * 0.5;
    place(
      "rock-cluster",
      t,
      1,
      coastalShoreMargin(t) + 1.1,
      scale,
      i * 1.7,
      -1.742078 * scale - 0.18 + random() * 0.42,
    );
  }
  const vergeCount = Math.min(780, Math.max(320, Math.ceil(track.length / 5)));
  for (let i = 0; i < vergeCount; i++) {
    const t = (i + 0.61) / vergeCount,
      side = i % 2 ? -1 : 1;
    const asset = i % 4 === 0 ? "shrub-cluster" : "meadow-patch";
    const radius = COAST_FOOTPRINTS[asset] * 0.85;
    const setback = side > 0 ? 3.4 + (i % 3) * 0.8 : 4 + (i % 7) * 1.3;
    if (side > 0 && setback + radius > coastalShoreMargin(t) - 0.4) continue;
    place(asset, t, side, setback, 0.85, i * 2.4);
  }
  // Framing trees occupy courts and the seaward verge without closing the view.
  for (const [metres, side, setback, scale, asset, turn] of [
    [-12, -1, 7.2, 1.3, "tree-oak"],
    [23, -1, 16, 1.16, "tree-round"],
    // Present the broad X-axis fork to the rear sample, not the narrow side.
    [40, 1, 6.3, 1.62, "tree-round", 2.03],
    [86, -1, 16.5, 1.38, "tree-blossom"],
    [76, -1, 23, 1.85, "tree-round", -Math.PI / 2],
  ] as const)
    place(asset, villageT(metres), side, setback, scale, turn ?? metres * 0.13);
  // A limited green grove backs the cottages; shared crown footprints keep air
  // between trees and keep the tower visible in both directions.
  for (let i = 0; i < 62; i++) {
    const t = villageT(-20 + random() * 178);
    place(
      trees[i % 3],
      t,
      -1,
      18 + random() * 24,
      0.88 + random() * 0.38,
      random() * Math.PI * 2,
    );
  }
  // Many small, irregular planted islands make the village ground legible close up.
  // Rejection keeps full footprints clear of both road ribbons and house walls.
  let patches = result.filter((p) => /meadow|shrub/.test(p.asset)).length;
  for (let attempt = 0; patches < 800 && attempt < 4000; attempt++) {
    const asset = random() < 0.27 ? "shrub-cluster" : "meadow-patch";
    if (
      place(
        asset,
        villageT(-22 + random() * 178),
        -1,
        4 + random() * 32,
        asset === "shrub-cluster"
          ? 0.55 + random() * 0.35
          : 0.5 + random() * 0.42,
        random() * Math.PI * 2,
      )
    )
      patches++;
  }
  // Foreground shore planting stays fully inside the narrow grass ribbon.
  let shorePatches = 0;
  for (let attempt = 0; shorePatches < 220 && attempt < 1800; attempt++) {
    const t = random() < 0.78 ? villageT(-30 + random() * 195) : random();
    const asset = random() < 0.22 ? "shrub-cluster" : "meadow-patch";
    const scale = 0.6 + random() * 0.25;
    const radius = COAST_FOOTPRINTS[asset] * scale;
    const minimum = radius + 0.8,
      maximum = coastalShoreMargin(t) - radius - 0.65;
    if (maximum <= minimum) continue;
    if (
      place(
        asset,
        t,
        1,
        minimum + random() * (maximum - minimum),
        scale,
        random() * Math.PI * 2,
      )
    )
      shorePatches++;
  }
  return result;
}
