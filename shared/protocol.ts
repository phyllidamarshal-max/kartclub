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
  status?: "FINISHED" | "DNF";
  reason?: string;
}
export interface Snapshot {
  serverTick: number;
  raceId: string;
  rulesVersion: string;
  trackVersion: string;
  performanceClass: string;
  assistClass: string;
  free: boolean;
  maxPlayers: number;
  deadline: number;
  stage: string;
  resultDigest: string;
  diagnostics: { stepP95: number; stepP99: number };
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
  waitingRemaining?: number;
  nextRoomId?: string;
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
