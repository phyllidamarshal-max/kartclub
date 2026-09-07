import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { Economy } from "../server/economy.ts";
function run(file: string, expression: string) {
  return new Promise<any>((resolve, reject) => {
    const code = `import {Economy} from './server/economy.ts';const e=new Economy(${JSON.stringify(file)});try{console.log(JSON.stringify({ok:true,value:${expression}}));}catch(err){console.log(JSON.stringify({ok:false,message:err.message}));}finally{e.close();}`;
    const p = spawn(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      code,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("exit", () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(Error(out));
      }
    });
  });
}
test(
  "two independent processes cannot over-reserve the same remaining budget or double claim",
  { timeout: 15000 },
  async () => {
    const file = path.join(
        mkdtempSync(path.join(tmpdir(), "pons-concurrent-")),
        "e.sqlite",
      ),
      e = new Economy(file);
    for (const id of ["a", "b", "c", "d"]) e.ensureAccount(id);
    const db = new DatabaseSync(file);
    db.exec("UPDATE pool SET received=15000,available=15000");
    db.close();
    const results = await Promise.all([
      run(file, "e.reserve('r1',['a','b'])"),
      run(file, "e.reserve('r2',['c','d'])"),
    ]);
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(e.pool().reserved, 10000);
    assert.equal(e.pool().available, 5000);
    const winner = results[0].ok ? "r1" : "r2",
      account = results[0].ok ? "a" : "c";
    e.settle(winner, [account]);
    const claims = await Promise.all([
      run(file, `e.claim('${account}','${winner}')`),
      run(file, `e.claim('${account}','${winner}')`),
    ]);
    assert.ok(claims.every((c) => c.ok));
    assert.deepEqual(claims[0].value, claims[1].value);
    assert.equal(e.account(account).pons, 10000);
    assert.equal(e.pool().pending, 0);
    e.close();
  },
);
