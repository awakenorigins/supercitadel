// Om economy service — ledger-based balance. Spend guarded against insufficient funds.
import { eq, desc, sql } from 'drizzle-orm';
import { omLedger } from './schema.js';
import { Errors } from '@citadel/core';
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
  const [row] = await db.insert(omLedger).values({ orgId, delta: amount, reason: 'Nạp Om', module: 'om' }).returning();
  return { transaction: row, balance: await getBalance(db, orgId) };
}
export async function spend(db: DB, orgId: string, amount: number, reason: string, module?: string) {
  if (amount <= 0) throw Errors.validation('Số Om chi phải > 0', 'amount');
  const bal = await getBalance(db, orgId);
  if (bal < amount) throw Errors.conflict(`Không đủ Om (cần ${amount}, có ${bal})`);
  const [row] = await db.insert(omLedger).values({ orgId, delta: -amount, reason, module }).returning();
  return { transaction: row, balance: await getBalance(db, orgId) };
}
