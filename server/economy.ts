import { DatabaseSync } from "node:sqlite";

export const UNIT = 100;
export const TICKET = 1_000;
export const PRIZE = 10_000;
const STARTING_TICKETS = 100_000;
// Simulated money only: seed the prize pool once with a hypothetical 12,840 PONS opening tax fund.
const OPENING_FUND = 1_284_000;

export type PendingAward = { matchId: string; amount: number };
export type Account = {
  id: string;
  tickets: number;
  pons: number;
  pending: PendingAward[];
};
export type Pool = {
  received: number;
  available: number;
  reserved: number;
  pending: number;
  paid: number;
  ticketRevenue: number;
};
export type ReserveReceipt = {
  matchId: string;
  players: string[];
  ticketCost: number;
  prize: number;
};
export type SettlementReceipt = {
  matchId: string;
  finishers: string[];
  ranks?: number[];
  allocations: Array<{ id: string; amount: number }>;
};
export type CancelReceipt = {
  matchId: string;
  players: string[];
  refundPerPlayer: number;
  released: number;
};
export type ClaimReceipt = { id: string; matchId: string; amount: number };
export type TaxReceipt = { eventId: string; volume: number; amount: number };

type Row = Record<string, unknown>;

export class Economy {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    if (typeof path !== "string" || path.length === 0)
      throw new Error("invalid database path");
    this.#db = new DatabaseSync(path);
    this.#db.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000",
    );
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS pool (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        received INTEGER NOT NULL CHECK (received >= 0),
        available INTEGER NOT NULL CHECK (available >= 0),
        reserved INTEGER NOT NULL CHECK (reserved >= 0),
        pending INTEGER NOT NULL CHECK (pending >= 0),
        paid INTEGER NOT NULL CHECK (paid >= 0),
        ticket_revenue INTEGER NOT NULL CHECK (ticket_revenue >= 0)
      );
      INSERT OR IGNORE INTO pool VALUES (1, ${OPENING_FUND}, ${OPENING_FUND}, 0, 0, 0, 0);
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        tickets INTEGER NOT NULL CHECK (tickets >= 0),
        pons INTEGER NOT NULL CHECK (pons >= 0)
      );
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('reserved','settled','cancelled')),
        players_json TEXT NOT NULL,
        finishers_json TEXT,
        reserve_receipt TEXT NOT NULL,
        settlement_receipt TEXT,
        cancel_receipt TEXT
      );
      CREATE TABLE IF NOT EXISTS match_players (
        match_id TEXT NOT NULL REFERENCES matches(id),
        player_id TEXT NOT NULL REFERENCES accounts(id),
        position INTEGER NOT NULL,
        PRIMARY KEY (match_id, player_id), UNIQUE (match_id, position)
      );
      CREATE TABLE IF NOT EXISTS awards (
        match_id TEXT NOT NULL REFERENCES matches(id),
        player_id TEXT NOT NULL REFERENCES accounts(id),
        position INTEGER NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0,1)),
        claim_receipt TEXT,
        PRIMARY KEY (match_id, player_id), UNIQUE (match_id, position)
      );
      CREATE TABLE IF NOT EXISTS tax_events (
        id TEXT PRIMARY KEY, volume INTEGER NOT NULL, amount INTEGER NOT NULL, receipt TEXT NOT NULL
      );
    `);
  }

  #transaction<T>(operation: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  #identifier(value: unknown, kind = "identifier"): asserts value is string {
    if (
      typeof value !== "string" ||
      value.length < 1 ||
      value.length > 128 ||
      !/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value)
    ) {
      throw new Error(`invalid ${kind} identifier`);
    }
  }

  #match(matchId: string): Row {
    this.#identifier(matchId, "match");
    const row = this.#db
      .prepare("SELECT * FROM matches WHERE id = ?")
      .get(matchId) as Row | undefined;
    if (!row) throw new Error("unknown match");
    return row;
  }

  ensureAccount(id: string): Account {
    this.#identifier(id, "account");
    this.#db
      .prepare("INSERT OR IGNORE INTO accounts(id,tickets,pons) VALUES (?,?,0)")
      .run(id, STARTING_TICKETS);
    return this.account(id);
  }

  account(id: string): Account {
    this.#identifier(id, "account");
    const row = this.#db
      .prepare("SELECT id,tickets,pons FROM accounts WHERE id = ?")
      .get(id) as Row | undefined;
    if (!row) throw new Error("unknown account");
    const awards = this.#db
      .prepare(
        `SELECT match_id,amount FROM awards WHERE player_id = ? AND claimed = 0 ORDER BY match_id`,
      )
      .all(id) as Row[];
    return {
      id: String(row.id),
      tickets: Number(row.tickets),
      pons: Number(row.pons),
      pending: awards.map((award) => ({
        matchId: String(award.match_id),
        amount: Number(award.amount),
      })),
    };
  }

  pool(): Pool {
    const row = this.#db
      .prepare("SELECT * FROM pool WHERE singleton = 1")
      .get() as Row;
    return {
      received: Number(row.received),
      available: Number(row.available),
      reserved: Number(row.reserved),
      pending: Number(row.pending),
      paid: Number(row.paid),
      ticketRevenue: Number(row.ticket_revenue),
    };
  }

  reserve(matchId: string, players: string[]): ReserveReceipt {
    this.#identifier(matchId, "match");
    if (!Array.isArray(players) || players.length < 2 || players.length > 4)
      throw new Error("players must contain 2 to 4 accounts");
    for (const player of players) this.#identifier(player, "account");
    if (new Set(players).size !== players.length)
      throw new Error("players must be distinct; duplicate entrant");
    return this.#transaction(() => {
      const existing = this.#db
        .prepare(
          "SELECT players_json,reserve_receipt FROM matches WHERE id = ?",
        )
        .get(matchId) as Row | undefined;
      if (existing) {
        if (String(existing.players_json) !== JSON.stringify(players))
          throw new Error("match reservation conflict");
        return JSON.parse(String(existing.reserve_receipt)) as ReserveReceipt;
      }
      for (const id of players) {
        const account = this.#db
          .prepare("SELECT tickets FROM accounts WHERE id = ?")
          .get(id) as Row | undefined;
        if (!account) throw new Error(`unknown account: ${id}`);
        if (Number(account.tickets) < TICKET)
          throw new Error(`insufficient tickets: ${id}`);
      }
      if (this.pool().available < PRIZE)
        throw new Error("insufficient pool funds");
      const receipt: ReserveReceipt = {
        matchId,
        players: [...players],
        ticketCost: TICKET,
        prize: PRIZE,
      };
      this.#db
        .prepare(
          `INSERT INTO matches(id,status,players_json,reserve_receipt) VALUES (?,'reserved',?,?)`,
        )
        .run(matchId, JSON.stringify(players), JSON.stringify(receipt));
      const debit = this.#db.prepare(
        "UPDATE accounts SET tickets = tickets - ? WHERE id = ?",
      );
      const entrant = this.#db.prepare(
        "INSERT INTO match_players(match_id,player_id,position) VALUES (?,?,?)",
      );
      players.forEach((id, index) => {
        debit.run(TICKET, id);
        entrant.run(matchId, id, index);
      });
      this.#db
        .prepare(
          "UPDATE pool SET available=available-?, reserved=reserved+?, ticket_revenue=ticket_revenue+? WHERE singleton=1",
        )
        .run(PRIZE, PRIZE, TICKET * players.length);
      return receipt;
    });
  }

  settle(
    matchId: string,
    finishers: string[],
    ranks?: number[],
  ): SettlementReceipt {
    const positions = ranks ?? finishers.map((_, i) => i + 1);
    if (
      positions.length !== finishers.length ||
      positions.some(
        (r, i) =>
          !Number.isInteger(r) ||
          r < 1 ||
          r > i + 1 ||
          (i === 0 && r !== 1) ||
          (i > 0 && r !== positions[i - 1] && r !== i + 1),
      )
    )
      throw Error("invalid tied ranks");
    this.#identifier(matchId, "match");
    if (!Array.isArray(finishers))
      throw new Error("finishers must be an array");
    for (const id of finishers) this.#identifier(id, "account");
    if (new Set(finishers).size !== finishers.length)
      throw new Error("finishers must be distinct; duplicate finisher");
    return this.#transaction(() => {
      const match = this.#match(matchId);
      if (String(match.status) === "settled") {
        if (String(match.finishers_json) !== JSON.stringify(finishers))
          throw new Error("settlement conflict");
        const prior = JSON.parse(
          String(match.settlement_receipt),
        ) as SettlementReceipt;
        if (
          JSON.stringify(prior.ranks ?? finishers.map((_, i) => i + 1)) !==
          JSON.stringify(positions)
        )
          throw Error("settlement ranks conflict");
        return prior;
      }
      if (String(match.status) !== "reserved")
        throw new Error("cancelled match cannot be settled");
      const entrants = new Set(
        JSON.parse(String(match.players_json)) as string[],
      );
      for (const id of finishers)
        if (!entrants.has(id))
          throw new Error(`finisher is not an original entrant: ${id}`);
      const shares =
        finishers.length === 1
          ? [10_000]
          : finishers.length === 2
            ? [7_000, 3_000]
            : finishers.length >= 3
              ? [6_000, 3_000, 1_000]
              : [];
      const allocations: Array<{ id: string; amount: number }> = [];
      for (let i = 0; i < finishers.length;) {
        let end = i + 1;
        while (end < finishers.length && positions[end] === positions[i]) end++;
        const amount = Math.floor(
          shares.slice(i, end).reduce((n, x) => n + x, 0) / (end - i),
        );
        for (let j = i; j < end; j++)
          if (amount > 0) allocations.push({ id: finishers[j], amount });
        i = end;
      }
      const allocated = allocations.reduce((n, a) => n + a.amount, 0);
      const receipt: SettlementReceipt = {
        matchId,
        finishers: [...finishers],
        allocations,
        ...(ranks ? { ranks: [...positions] } : {}),
      };
      const insert = this.#db.prepare(
        "INSERT INTO awards(match_id,player_id,position,amount) VALUES (?,?,?,?)",
      );
      allocations.forEach((award, index) =>
        insert.run(matchId, award.id, index, award.amount),
      );
      this.#db
        .prepare(
          "UPDATE pool SET reserved=reserved-?, pending=pending+?, available=available+? WHERE singleton=1",
        )
        .run(PRIZE, allocated, PRIZE - allocated);
      this.#db
        .prepare(
          `UPDATE matches SET status='settled', finishers_json=?, settlement_receipt=? WHERE id=?`,
        )
        .run(JSON.stringify(finishers), JSON.stringify(receipt), matchId);
      return receipt;
    });
  }

  cancel(matchId: string): CancelReceipt {
    this.#identifier(matchId, "match");
    return this.#transaction(() => this.#cancelInside(matchId));
  }

  #cancelInside(matchId: string): CancelReceipt {
    const match = this.#match(matchId);
    if (String(match.status) === "cancelled")
      return JSON.parse(String(match.cancel_receipt)) as CancelReceipt;
    if (String(match.status) === "settled")
      throw new Error("settled match cannot be cancelled");
    const players = JSON.parse(String(match.players_json)) as string[];
    const receipt: CancelReceipt = {
      matchId,
      players,
      refundPerPlayer: TICKET,
      released: PRIZE,
    };
    const refund = this.#db.prepare(
      "UPDATE accounts SET tickets=tickets+? WHERE id=?",
    );
    for (const id of players) refund.run(TICKET, id);
    this.#db
      .prepare(
        "UPDATE pool SET available=available+?, reserved=reserved-?, ticket_revenue=ticket_revenue-? WHERE singleton=1",
      )
      .run(PRIZE, PRIZE, TICKET * players.length);
    this.#db
      .prepare(
        `UPDATE matches SET status='cancelled', cancel_receipt=? WHERE id=?`,
      )
      .run(JSON.stringify(receipt), matchId);
    return receipt;
  }

  claim(id: string, matchId: string): ClaimReceipt {
    this.#identifier(id, "account");
    this.#identifier(matchId, "match");
    return this.#transaction(() => {
      this.#match(matchId);
      if (!this.#db.prepare("SELECT 1 FROM accounts WHERE id=?").get(id))
        throw new Error("unknown account");
      const award = this.#db
        .prepare(
          "SELECT amount,claimed,claim_receipt FROM awards WHERE match_id=? AND player_id=?",
        )
        .get(matchId, id) as Row | undefined;
      if (!award) throw new Error("no award for account in match");
      if (Number(award.claimed) === 1)
        return JSON.parse(String(award.claim_receipt)) as ClaimReceipt;
      const receipt: ClaimReceipt = {
        id,
        matchId,
        amount: Number(award.amount),
      };
      this.#db
        .prepare("UPDATE accounts SET pons=pons+? WHERE id=?")
        .run(receipt.amount, id);
      this.#db
        .prepare(
          "UPDATE pool SET pending=pending-?, paid=paid+? WHERE singleton=1",
        )
        .run(receipt.amount, receipt.amount);
      this.#db
        .prepare(
          "UPDATE awards SET claimed=1,claim_receipt=? WHERE match_id=? AND player_id=?",
        )
        .run(JSON.stringify(receipt), matchId, id);
      return receipt;
    });
  }

  injectTax(eventId: string, volume: number): TaxReceipt {
    this.#identifier(eventId, "event");
    if (!Number.isSafeInteger(volume) || volume < 0)
      throw new Error("amount must be a nonnegative safe integer");
    const amount =
      Math.floor(volume / 100) * 2 + Math.floor(((volume % 100) * 2) / 100);
    if (!Number.isSafeInteger(amount)) throw new Error("tax overflow");
    return this.#transaction(() => {
      const existing = this.#db
        .prepare("SELECT volume,receipt FROM tax_events WHERE id=?")
        .get(eventId) as Row | undefined;
      if (existing) {
        if (Number(existing.volume) !== volume)
          throw new Error("tax event conflict");
        return JSON.parse(String(existing.receipt)) as TaxReceipt;
      }
      const pool = this.pool();
      if (
        !Number.isSafeInteger(pool.received + amount) ||
        !Number.isSafeInteger(pool.available + amount)
      ) {
        throw new Error("pool total would overflow safe integer range");
      }
      const receipt: TaxReceipt = { eventId, volume, amount };
      this.#db
        .prepare(
          "INSERT INTO tax_events(id,volume,amount,receipt) VALUES (?,?,?,?)",
        )
        .run(eventId, volume, amount, JSON.stringify(receipt));
      this.#db
        .prepare(
          "UPDATE pool SET received=received+?,available=available+? WHERE singleton=1",
        )
        .run(amount, amount);
      return receipt;
    });
  }

  recover(): { cancelled: string[] } {
    return this.#transaction(() => {
      const matches = this.#db
        .prepare(`SELECT id FROM matches WHERE status='reserved' ORDER BY id`)
        .all() as Row[];
      const cancelled = matches.map((row) => {
        const id = String(row.id);
        this.#cancelInside(id);
        return id;
      });
      return { cancelled };
    });
  }

  close(): void {
    this.#db.close();
  }
}
