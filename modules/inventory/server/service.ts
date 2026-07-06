// Inventory service — org-scoped stock with low-stock detection.
import { eq, and, sql, desc } from 'drizzle-orm';
import { inventoryItems } from './schema.js';
import { Errors } from '@citadel/core';
type DB = any;

export async function listItems(db: DB, orgId: string) {
  return db.select().from(inventoryItems).where(eq(inventoryItems.orgId, orgId)).orderBy(desc(inventoryItems.updatedAt));
}
export async function createItem(db: DB, orgId: string, d: { name: string; unit?: string; qty?: number; lowThreshold?: number }) {
  if (!d.name?.trim()) throw Errors.validation('Tên hàng trống', 'name');
  const [row] = await db.insert(inventoryItems).values({ orgId, name: d.name, unit: d.unit ?? 'cái', qty: d.qty ?? 0, lowThreshold: d.lowThreshold ?? 5 }).returning();
  return row;
}
export async function adjustQty(db: DB, orgId: string, id: string, delta: number) {
  const [row] = await db.update(inventoryItems)
    .set({ qty: sql`GREATEST(qty + ${delta}, 0)`, updatedAt: new Date() })
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.orgId, orgId))).returning();
  if (!row) throw Errors.notFound('Không tìm thấy mặt hàng');
  return row;
}
export async function lowStock(db: DB, orgId: string) {
  return db.select().from(inventoryItems)
    .where(and(eq(inventoryItems.orgId, orgId), sql`qty <= low_threshold`));
}

export async function updateItem(db: DB, orgId: string, id: string, d: { name?: string; unit?: string; lowThreshold?: number }) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (d.name?.trim()) patch.name = d.name.trim();
  if (d.unit?.trim()) patch.unit = d.unit.trim();
  if (typeof d.lowThreshold === 'number' && d.lowThreshold >= 0) patch.lowThreshold = Math.floor(d.lowThreshold);
  const [row] = await db.update(inventoryItems).set(patch)
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.orgId, orgId))).returning();
  if (!row) throw Errors.notFound('Không tìm thấy mặt hàng');
  return row;
}
