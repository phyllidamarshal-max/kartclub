import type { Item } from "./items.ts";

export interface ItemVfxEvent {
  seq: number;
  time: number;
  kind: "pickup" | "use" | "launch" | "deploy" | "hit" | "block";
  item: Item;
  actor: string;
  target?: string;
  x: number;
  y: number;
  z: number;
}
export interface VfxJournal {
  sequence: number;
  events: ItemVfxEvent[];
}
type Source = { time: number; vfx?: VfxJournal };

/** Presentation-only history. It never reads/writes the gameplay RNG or rules. */
export function recordVfx(
  source: Source,
  event: Omit<ItemVfxEvent, "seq" | "time">,
  time = source.time,
): number {
  const journal = (source.vfx ??= { sequence: 0, events: [] });
  const seq = ++journal.sequence;
  journal.events.push({ ...event, seq, time });
  if (journal.events.length > 64)
    journal.events.splice(0, journal.events.length - 64);
  return seq;
}
export function pruneVfx(source: Source) {
  if (source.vfx)
    source.vfx.events = source.vfx.events.filter(
      (event) => source.time - event.time <= 2,
    );
}
