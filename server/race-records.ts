import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
export class RaceRecords {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS race_results (race_id TEXT PRIMARY KEY, digest TEXT NOT NULL, result_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS race_events (race_id TEXT NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(race_id,event_id));",
    );
  }
  event(raceId: string, eventId: string, payload: unknown) {
    this.db
      .prepare("INSERT OR IGNORE INTO race_events VALUES(?,?,?)")
      .run(raceId, eventId, JSON.stringify(payload));
  }
  freeze(raceId: string, result: unknown) {
    const body = JSON.stringify(result),
      digest = createHash("sha256").update(body).digest("hex");
    const prior = this.db
      .prepare("SELECT digest FROM race_results WHERE race_id=?")
      .get(raceId);
    if (prior && prior.digest !== digest) throw Error("比赛结果已冻结");
    this.db
      .prepare("INSERT OR IGNORE INTO race_results VALUES(?,?,?)")
      .run(raceId, digest, body);
    return digest;
  }
  close() {
    this.db.close();
  }
}
