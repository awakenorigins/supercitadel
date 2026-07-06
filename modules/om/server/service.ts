// Om economy service — ledger-based balance. Spend guarded against insufficient funds.
import { eq, desc, sql } from 'drizzle-orm';
import { omLedger } from './schema.js';
import { Errors, emitEvent } from '@citadel/core';
type DB = any;

export async function getBalance(db: DB, orgId: string): Promise<number> {
  const [r] = await db.select({ bal: sql<number>`COALESCE(SUM(delta),0)::int` }).from(omLedger).where(eq(omLedger.orgId, orgId));
  return r?.bal ?? 0;
}
export async function listTransactions(db: DB, orgId: string) {
  return db.select().from(omLedger).where(eq(omLedger.orgId, orgId)).orderBy(desc(omLedger.createdAt)).limit(50);
}
export async function topup(db: DB, orgId: string, amount: number) {
  if (amount <= 0) throw Errors.validation('Số Om nạp phải > 0', 'amount');
  return db.transaction(async (tx: DB) => {
    const [row] = await tx.insert(omLedger).values({ orgId, delta: amount, reason: 'Nạp Om', module: 'om' }).returning();
    await emitEvent(tx, { orgId, topic: 'om.wallet.topped_up', payload: { id: row.id, amount } });
    return { transaction: row, balance: await getBalance(tx, orgId) };
  });
}
export async function spend(db: DB, orgId: string, amount: number, reason: string, module?: string) {
  if (amount <= 0) throw Errors.validation('Số Om chi phải > 0', 'amount');
  const bal = await getBalance(db, orgId);
  if (bal < amount) throw Errors.conflict(`Không đủ Om (cần ${amount}, có ${bal})`);
  return db.transaction(async (tx: DB) => {
    const [row] = await tx.insert(omLedger).values({ orgId, delta: -amount, reason, module }).returning();
    await emitEvent(tx, { orgId, topic: 'om.wallet.spent', payload: { id: row.id, amount, reason, module } });
    return { transaction: row, balance: await getBalance(tx, orgId) };
  });
}
