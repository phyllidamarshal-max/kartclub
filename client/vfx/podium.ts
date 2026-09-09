export interface PodiumResult {
  id: string;
  rank: number;
  finished: boolean;
}

export interface PodiumContext {
  raceId: string;
  playerId: string;
  mode: string;
  phase: string;
  failed?: boolean;
  results: readonly PodiumResult[];
}

export type PodiumRank = 1 | 2 | 3;

const MAX_IDENTITIES = 64;
const GHOST_ID = /^ghost(?:$|[-_:])/i;
const MEDAL_SEEN = 1;
const STANDINGS_SEEN = 2;

function isPodiumRank(rank: number): rank is PodiumRank {
  return rank === 1 || rank === 2 || rank === 3;
}

function isRealCompetitor(id: string): boolean {
  return id.length > 0 && !GHOST_ID.test(id);
}

export function isPodiumRace(context: PodiumContext): boolean {
  if (
    !context.raceId ||
    !context.playerId ||
    context.phase !== "finished" ||
    (context.mode !== "race" && context.mode !== "items") ||
    context.failed
  )
    return false;

  const competitors = new Set(
    context.results.map((result) => result.id).filter(isRealCompetitor),
  );
  return competitors.size >= 2 && competitors.has(context.playerId);
}

export function podiumRank(context: PodiumContext): PodiumRank | null {
  if (!isPodiumRace(context)) return null;

  const local = context.results.find(
    (result) => result.id === context.playerId,
  );
  return local?.finished && isPodiumRank(local.rank) ? local.rank : null;
}

export class PodiumGate {
  readonly #identities = new Map<string, number>();

  #consume(context: PodiumContext, flag: number): boolean {
    const identity = JSON.stringify([context.raceId, context.playerId]);
    const flags = this.#identities.get(identity) ?? 0;
    this.#identities.delete(identity);
    this.#identities.set(identity, flags | flag);
    if (this.#identities.size > MAX_IDENTITIES) {
      const oldest = this.#identities.keys().next().value;
      if (oldest !== undefined) this.#identities.delete(oldest);
    }
    return (flags & flag) === 0;
  }

  take(context: PodiumContext): { rank: PodiumRank; animate: boolean } | null {
    const rank = podiumRank(context);
    if (rank === null) return null;
    return { rank, animate: this.#consume(context, MEDAL_SEEN) };
  }

  takeStandings(context: PodiumContext): boolean {
    return isPodiumRace(context) && this.#consume(context, STANDINGS_SEEN);
  }

  clear(): void {
    this.#identities.clear();
  }
}
