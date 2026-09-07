import type { Car } from "./race.ts";
export type Phase =
  "waiting" | "countdown" | "racing" | "finished" | "cancelled";
export interface PlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  slot: number;
  dnf: boolean;
}
export interface RaceResult {
  id: string;
  name: string;
  time: number | null;
  rank: number;
  award: number;
}
export interface Snapshot {
  trackId: string;
  raceMode: "race" | "items";
  items: import("./items.ts").ItemWorld | null;
  roomId: string;
  phase: Phase;
  players: PlayerInfo[];
  cars: Car[];
  countdown: number;
  elapsed: number;
  laps: number;
  results: RaceResult[];
  reason: string;
}
export interface Account {
  id: string;
  tickets: number;
  pons: number;
  pending: { matchId: string; amount: number }[];
}
export interface Pool {
  received: number;
  available: number;
  reserved: number;
  pending: number;
  paid: number;
  ticketRevenue: number;
}
