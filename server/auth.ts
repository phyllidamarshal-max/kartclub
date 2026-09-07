import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
export class Auth {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, id TEXT UNIQUE NOT NULL)",
    );
  }
  issue() {
    const token = randomBytes(32).toString("hex"),
      id = randomUUID();
    this.db
      .prepare("INSERT INTO sessions VALUES (?,?)")
      .run(this.hash(token), id);
    return { token, id };
  }
  resolve(token: unknown): string {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      throw Error("身份已失效，请重新进入大厅");
    const row = this.db
      .prepare("SELECT id FROM sessions WHERE hash=?")
      .get(this.hash(token)) as { id: string } | undefined;
    if (!row) throw Error("身份已失效，请重新进入大厅");
    return row.id;
  }
  private hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
  close() {
    this.db.close();
  }
}
