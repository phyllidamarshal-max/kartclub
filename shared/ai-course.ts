import type { Car } from "./race.ts";
import type { ItemWorld } from "./items.ts";
import { continuousTrack, type Track } from "./track.ts";

/** Perceive reachable boxes and live traps without changing the item world. */
export function itemCourse(
  c: Readonly<Car>,
  track: Track,
  world?: ItemWorld | null,
) {
  const result: {
    pickupLane: number | null;
    traps: { lane: number; forward: number }[];
  } = {
    pickupLane: null,
    traps: [],
  };
  const state = world?.players[c.id];
  if (!world || !state || c.routeBranch !== "main") return result;
  const p = continuousTrack(c.x, c.z, c.lastT, track, "main");
  const projection = (x: number, z: number) => {
    const point = continuousTrack(x, z, c.lastT, track, "main");
    const forward = (((point.t - p.t + 1.5) % 1) - 0.5) * track.length;
    return { ...point, forward };
  };
  let best = Infinity;
  if (!state.held && c.ghostTime <= 0)
    for (const box of world.boxes) {
      if (
        box.readyAt > world.time ||
        state.pickedLaps[box.band] >= Math.floor(c.progress) ||
        Math.abs(box.y - p.y) >= 3
      )
        continue;
      // Avoid inspecting the rest of the circuit, including physically nearby but
      // unconnected roads: local projection must land within the pickup radius.
      if (Math.hypot(box.x - c.x, box.z - c.z) > 35) continue;
      const b = projection(box.x, box.z);
      if (b.forward < 3 || b.forward > 32 || b.distance > b.roadWidth / 2 - 1.5)
        continue;
      const score = b.forward + Math.abs(b.lateral - p.lateral) * 3;
      if (score < best) {
        best = score;
        result.pickupLane = b.lateral;
      }
    }
  for (const trap of world.traps) {
    if (trap.ttl <= 0 || Math.hypot(trap.x - c.x, trap.z - c.z) > 30) continue;
    const t = projection(trap.x, trap.z);
    const arrival = t.forward / Math.max(8, c.speed);
    // The item engine also permits the owner's trap to hit its owner once armed.
    if (
      t.forward < 0 ||
      t.forward > 28 ||
      t.distance > t.roadWidth / 2 ||
      trap.ttl <= arrival ||
      15 - trap.ttl + arrival < 0.7
    )
      continue;
    result.traps.push({ lane: t.lateral, forward: t.forward });
  }
  return result;
}
