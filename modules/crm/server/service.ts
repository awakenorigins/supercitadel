// CRM service — contacts & deals, all org-scoped.
import { eq, and, desc, sql } from 'drizzle-orm';
import { crmContacts, crmDeals } from './schema.js';
import { Errors } from '@citadel/core';
type DB = any;

export async function createContact(db: DB, orgId: string, data: { name: string; phone?: string; email?: string; tag?: string; note?: string }) {
  if (!data.name?.trim()) throw Errors.validation('Tên không được trống', 'name');
  const [row] = await db.insert(crmContacts).values({ orgId, ...data }).returning();
  return row;
}
export async function listContacts(db: DB, orgId: string) {
  return db.select().from(crmContacts).where(eq(crmContacts.orgId, orgId)).orderBy(desc(crmContacts.createdAt));
}
export async function createDeal(db: DB, orgId: string, data: { title: string; valueVnd?: number; contactId?: string; stage?: string; ownerId?: string }) {
  if (!data.title?.trim()) throw Errors.validation('Tiêu đề trống', 'title');
  const [row] = await db.insert(crmDeals).values({ orgId, title: data.title, valueVnd: data.valueVnd ?? 0, contactId: data.contactId, stage: (data.stage ?? 'lead') as any, ownerId: data.ownerId }).returning();
  return row;
}
export async function listDeals(db: DB, orgId: string) {
  return db.select().from(crmDeals).where(eq(crmDeals.orgId, orgId)).orderBy(desc(crmDeals.updatedAt));
}
export async function moveDealStage(db: DB, orgId: string, dealId: string, stage: string) {
  const valid = ['lead','quote','negotiation','won','lost'];
  if (!valid.includes(stage)) throw Errors.validation('Stage không hợp lệ', 'stage');
  const res = await db.update(crmDeals).set({ stage: stage as any, updatedAt: new Date() })
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.orgId, orgId))).returning();
  if (!res.length) throw Errors.notFound('Không tìm thấy deal');
  return res[0];
}
export async function crmStats(db: DB, orgId: string) {
  const open = await db.select().from(crmDeals)
    .where(and(eq(crmDeals.orgId, orgId), sql`stage NOT IN ('won','lost')`));
  const totalValue = open.reduce((s: number, d: any) => s + Number(d.valueVnd), 0);
  return { openDeals: open.length, totalValueVnd: totalValue };
}
