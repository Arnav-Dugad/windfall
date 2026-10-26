import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { giftStatements, reversalStatements } from "../worker/lib/ledger";

/**
 * Runs the Worker's real ledger statements against SQLite (the engine behind D1), through a minimal
 * D1 shim whose batch() is a single transaction — the same atomicity D1 guarantees.
 */
type Shim = { sql: string; args: unknown[] };

function makeD1(db: DatabaseSync) {
  const prepare = (sql: string) => {
    const s: Shim & { bind: (...a: unknown[]) => Shim } = {
      sql,
      args: [],
      bind(...a: unknown[]) {
        s.args = a;
        return s;
      },
    };
    return s;
  };
  const batch = async (stmts: Shim[]) => {
    db.exec("BEGIN");
    try {
      const out = stmts.map((s) => ({ meta: { changes: Number(db.prepare(s.sql).run(...(s.args as never[])).changes) } }));
      db.exec("COMMIT");
      return out;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  return { prepare, batch } as unknown as D1Database;
}

let db: DatabaseSync;
let d1: D1Database;
const now = 1_800_000_000_000;

function totals() {
  return db
    .prepare(
      `SELECT
        (SELECT funded_cents FROM requests WHERE id = 'req_a') AS funded,
        (SELECT status FROM requests WHERE id = 'req_a') AS status,
        (SELECT gift_count FROM requests WHERE id = 'req_a') AS giftCount,
        (SELECT COALESCE(SUM(amount_cents),0) FROM gifts WHERE status = 'settled') AS settled,
        (SELECT COALESCE(SUM(delta_cents),0) FROM ledger_entries) AS ledgerSum,
        (SELECT COALESCE(SUM(balance_cents),0) FROM balances) AS balanceSum,
        (SELECT balance_cents FROM balances WHERE account = 'patron:usr_p') AS patronBalance`,
    )
    .get() as Record<string, number | string>;
}

const give = (giftId: string, amountCents: number) =>
  d1.batch(
    giftStatements(d1, {
      giftId,
      requestId: "req_a",
      patronId: "usr_p",
      amountCents,
      kind: "give",
      anonymous: false,
      paymentRef: `demo_${giftId}`,
      now,
    }),
  );

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(`migrations/${f}`, "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) db.exec(stmt);
    }
  }
  db.exec(`INSERT INTO users (id, role, display_name, avatar_seed) VALUES ('usr_p','patron','P','p'), ('usr_s','seeker','S','s');
    INSERT INTO requests (id, seeker_id, first_name, city, country, country_code, category, headline, story, breakdown, goal_cents, avatar_seed)
    VALUES ('req_a','usr_s','Ana','Lima','Peru','PE','medical','h','s','[]', 10000, 'a');`);
  d1 = makeD1(db);
});

describe("ledger", () => {
  it("records a gift atomically with double-entry rows", async () => {
    const r = await give("g1", 4_000);
    expect(r[0]!.meta.changes).toBe(1);
    expect(totals()).toMatchObject({ funded: 4_000, giftCount: 1, settled: 4_000, ledgerSum: 0, balanceSum: 0, patronBalance: -4_000, status: "active" });
  });

  it("marks the request funded when the goal is reached", async () => {
    await give("g1", 4_000);
    await give("g2", 6_000);
    expect(totals()).toMatchObject({ funded: 10_000, status: "funded", giftCount: 2 });
  });

  it("refuses to over-fund and writes nothing when the guard fails", async () => {
    await give("g1", 9_000);
    const r = await give("g2", 2_000);
    expect(r[0]!.meta.changes).toBe(0);
    expect(r.every((x) => x.meta.changes === 0)).toBe(true);
    expect(totals()).toMatchObject({ funded: 9_000, settled: 9_000, ledgerSum: 0, giftCount: 1 });
  });

  it("refuses gifts to a request that is not active", async () => {
    db.exec(`UPDATE requests SET status = 'paused'`);
    const r = await give("g1", 1_000);
    expect(r[0]!.meta.changes).toBe(0);
    expect(totals()).toMatchObject({ funded: 0, settled: 0 });
  });

  it("reverses a gift exactly once (idempotent undo) and reopens a funded request", async () => {
    await give("g1", 10_000);
    expect(totals().status).toBe("funded");
    const input = { giftId: "g1", patronId: "usr_p", requestId: "req_a", amountCents: 10_000, notBefore: now - 1, now };
    const first = await d1.batch(reversalStatements(d1, input));
    expect(first[0]!.meta.changes).toBe(1);
    const second = await d1.batch(reversalStatements(d1, input));
    expect(second[0]!.meta.changes).toBe(0);
    expect(totals()).toMatchObject({ funded: 0, status: "active", giftCount: 0, settled: 0, ledgerSum: 0, balanceSum: 0, patronBalance: 0 });
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM ledger_entries WHERE gift_id = 'g1'`).get() as { n: number };
    expect(rows.n).toBe(4);
  });

  it("won't undo a gift outside the window or someone else's gift", async () => {
    await give("g1", 3_000);
    const late = await d1.batch(
      reversalStatements(d1, { giftId: "g1", patronId: "usr_p", requestId: "req_a", amountCents: 3_000, notBefore: now + 1, now }),
    );
    expect(late[0]!.meta.changes).toBe(0);
    const other = await d1.batch(
      reversalStatements(d1, { giftId: "g1", patronId: "usr_s", requestId: "req_a", amountCents: 3_000, notBefore: 0, now }),
    );
    expect(other[0]!.meta.changes).toBe(0);
    expect(totals()).toMatchObject({ funded: 3_000, settled: 3_000 });
  });
});
