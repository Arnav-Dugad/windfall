import type { GiftKind } from "../../shared/domain";

/**
 * The internal ledger. Every money movement is one atomic D1 batch (a single transaction).
 *
 * Gift:
 *   1. INSERT gift — only if the request is active and the amount still fits under the goal.
 *   2. UPDATE request totals — only if that gift row now exists.
 *   3. Two ledger rows (patron −, request +) and two balance upserts — same guard.
 * If step 1's guard fails, nothing else applies, so a request can never be over-funded
 * and `funded_cents` always equals the sum of its settled gifts.
 */

export const patronAccount = (id: string) => `patron:${id}`;
export const requestAccount = (id: string) => `request:${id}`;

export interface GiftInput {
  giftId: string;
  requestId: string;
  patronId: string;
  amountCents: number;
  kind: GiftKind;
  anonymous: boolean;
  paymentRef: string;
  now: number;
}

export function giftStatements(db: D1Database, g: GiftInput): D1PreparedStatement[] {
  const giftExists = `EXISTS (SELECT 1 FROM gifts WHERE id = ?1 AND status = 'settled')`;
  return [
    db
      .prepare(
        `INSERT INTO gifts (id, request_id, patron_id, amount_cents, kind, anonymous, status, payment_ref, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'settled', ?7, ?8
         WHERE EXISTS (SELECT 1 FROM requests WHERE id = ?2 AND status = 'active' AND funded_cents + ?4 <= goal_cents)`,
      )
      .bind(g.giftId, g.requestId, g.patronId, g.amountCents, g.kind, g.anonymous ? 1 : 0, g.paymentRef, g.now),
    db
      .prepare(
        `UPDATE requests SET
           funded_cents = funded_cents + ?2,
           gift_count = gift_count + 1,
           status = CASE WHEN funded_cents + ?2 >= goal_cents THEN 'funded' ELSE status END,
           funded_at = CASE WHEN funded_cents + ?2 >= goal_cents THEN ?4 ELSE funded_at END
         WHERE id = ?3 AND ${giftExists}`,
      )
      .bind(g.giftId, g.amountCents, g.requestId, g.now),
    ledgerRow(db, `${g.giftId}:p`, g.giftId, patronAccount(g.patronId), -g.amountCents, "gift", g.now),
    ledgerRow(db, `${g.giftId}:r`, g.giftId, requestAccount(g.requestId), g.amountCents, "gift", g.now),
    balanceUpsert(db, g.giftId, patronAccount(g.patronId), -g.amountCents, g.now, "settled"),
    balanceUpsert(db, g.giftId, requestAccount(g.requestId), g.amountCents, g.now, "settled"),
  ];
}

export interface ReversalInput {
  giftId: string;
  patronId: string;
  requestId: string;
  amountCents: number;
  /** Gifts older than this (ms epoch) can no longer be undone. */
  notBefore: number;
  now: number;
}

/** Undo: flips the gift to `reversed` once, then applies compensating entries guarded on that flip. */
export function reversalStatements(db: D1Database, r: ReversalInput): D1PreparedStatement[] {
  const firstReversal = `EXISTS (SELECT 1 FROM gifts WHERE id = ?1 AND status = 'reversed')
    AND NOT EXISTS (SELECT 1 FROM ledger_entries WHERE gift_id = ?1 AND memo = 'reversal')`;
  return [
    db
      .prepare(
        `UPDATE gifts SET status = 'reversed'
         WHERE id = ?1 AND patron_id = ?2 AND status = 'settled' AND created_at >= ?3`,
      )
      .bind(r.giftId, r.patronId, r.notBefore),
    db
      .prepare(
        `UPDATE requests SET
           funded_cents = funded_cents - ?2,
           gift_count = gift_count - 1,
           status = CASE WHEN status = 'funded' THEN 'active' ELSE status END,
           funded_at = CASE WHEN status = 'funded' THEN NULL ELSE funded_at END
         WHERE id = ?3 AND funded_cents >= ?2 AND ${firstReversal}`,
      )
      .bind(r.giftId, r.amountCents, r.requestId),
    db
      .prepare(
        `UPDATE balances SET balance_cents = balance_cents + ?2, updated_at = ?4 WHERE account = ?3 AND ${firstReversal}`,
      )
      .bind(r.giftId, r.amountCents, patronAccount(r.patronId), r.now),
    db
      .prepare(
        `UPDATE balances SET balance_cents = balance_cents - ?2, updated_at = ?4 WHERE account = ?3 AND ${firstReversal}`,
      )
      .bind(r.giftId, r.amountCents, requestAccount(r.requestId), r.now),
    // Ledger rows last: they are what marks the reversal as applied.
    db
      .prepare(
        `INSERT OR IGNORE INTO ledger_entries (id, gift_id, account, delta_cents, memo, created_at)
         SELECT ?1 || ':rp', ?1, ?2, ?3, 'reversal', ?5 WHERE EXISTS (SELECT 1 FROM gifts WHERE id = ?1 AND status = 'reversed')
         UNION ALL
         SELECT ?1 || ':rr', ?1, ?4, -?3, 'reversal', ?5 WHERE EXISTS (SELECT 1 FROM gifts WHERE id = ?1 AND status = 'reversed')`,
      )
      .bind(r.giftId, patronAccount(r.patronId), r.amountCents, requestAccount(r.requestId), r.now),
  ];
}

function ledgerRow(
  db: D1Database,
  id: string,
  giftId: string,
  account: string,
  delta: number,
  memo: "gift" | "reversal",
  now: number,
) {
  return db
    .prepare(
      `INSERT INTO ledger_entries (id, gift_id, account, delta_cents, memo, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM gifts WHERE id = ?2 AND status = 'settled')`,
    )
    .bind(id, giftId, account, delta, memo, now);
}

function balanceUpsert(db: D1Database, giftId: string, account: string, delta: number, now: number, status: string) {
  return db
    .prepare(
      `INSERT INTO balances (account, balance_cents, updated_at)
       SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM gifts WHERE id = ?4 AND status = ?5)
       ON CONFLICT(account) DO UPDATE SET balance_cents = balance_cents + excluded.balance_cents, updated_at = excluded.updated_at`,
    )
    .bind(account, delta, now, giftId, status);
}
