/**
 * SOUL-WALLET 1A — catalog.service
 * Danh bạ đối tác · Danh mục 2 cấp (kèm seed bộ VN) · Tags
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { SwCtx } from '../types.js';
import { SwError } from '../types.js';
import { swCategories, swContacts, swTags } from '../db/schema.js';
import { own, writeAudit } from './ledger.service.js';
import type { contactUpsertSchema, categoryUpsertSchema, tagUpsertSchema } from '../validation/schemas.js';

// ── Contacts ───────────────────────────────────────────────────────────────
export async function upsertContact(ctx: SwCtx, input: z.infer<typeof contactUpsertSchema>) {
  if (input.id) {
    const rows = await ctx.db.update(swContacts)
      .set({ name: input.name, kind: input.kind, phone: input.phone, note: input.note, updatedAt: new Date() })
      .where(and(own(swContacts, ctx), eq(swContacts.id, input.id)))
      .returning();
    if (!rows[0]) throw new SwError('CONTACT_NOT_FOUND', `Không tìm thấy đối tác ${input.id}`);
    await writeAudit(ctx, { action: 'sw.contact.update', entity: 'sw_contacts', entityId: input.id, after: input });
    return rows[0];
  }
  const rows = await ctx.db.insert(swContacts).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    name: input.name, kind: input.kind, phone: input.phone, note: input.note,
  }).returning();
  await writeAudit(ctx, { action: 'sw.contact.create', entity: 'sw_contacts', entityId: rows[0]!.id, after: input });
  return rows[0]!;
}

export async function listContacts(ctx: SwCtx) {
  return ctx.db.select().from(swContacts).where(own(swContacts, ctx));
}

/** Tìm theo tên (không dấu-insensitive đơn giản: ILIKE) hoặc tạo mới — tiện cho Tiểu Tâm/sổ nợ */
export async function findOrCreateContact(ctx: SwCtx, name: string, kind: z.infer<typeof contactUpsertSchema>['kind'] = 'other') {
  const rows = await ctx.db.select().from(swContacts)
    .where(and(own(swContacts, ctx), eq(swContacts.name, name))).limit(1);
  if (rows[0]) return rows[0];
  return upsertContact(ctx, { name, kind });
}

// ── Categories ─────────────────────────────────────────────────────────────
export async function upsertCategory(ctx: SwCtx, input: z.infer<typeof categoryUpsertSchema>) {
  if (input.parent_id) {
    const p = await ctx.db.select().from(swCategories)
      .where(and(own(swCategories, ctx), eq(swCategories.id, input.parent_id))).limit(1);
    if (!p[0]) throw new SwError('CATEGORY_NOT_FOUND', 'Danh mục cha không tồn tại');
    if (p[0].kind !== input.kind) throw new SwError('CATEGORY_KIND_MISMATCH', 'Danh mục con phải cùng loại thu/chi với cha');
  }
  if (input.id) {
    const rows = await ctx.db.update(swCategories)
      .set({ name: input.name, kind: input.kind, parentId: input.parent_id, icon: input.icon, updatedAt: new Date() })
      .where(and(own(swCategories, ctx), eq(swCategories.id, input.id)))
      .returning();
    if (!rows[0]) throw new SwError('CATEGORY_NOT_FOUND', `Không tìm thấy danh mục ${input.id}`);
    return rows[0];
  }
  const rows = await ctx.db.insert(swCategories).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    name: input.name, kind: input.kind, parentId: input.parent_id, icon: input.icon,
  }).returning();
  return rows[0]!;
}

export async function listCategories(ctx: SwCtx, kind?: 'income' | 'expense') {
  const cond = kind ? and(own(swCategories, ctx), eq(swCategories.kind, kind)) : own(swCategories, ctx);
  return ctx.db.select().from(swCategories).where(cond);
}

export async function getCategory(ctx: SwCtx, id: string) {
  const rows = await ctx.db.select().from(swCategories)
    .where(and(own(swCategories, ctx), eq(swCategories.id, id))).limit(1);
  if (!rows[0]) throw new SwError('CATEGORY_NOT_FOUND', `Không tìm thấy danh mục ${id}`);
  return rows[0];
}

/** Seed bộ danh mục mặc định VN — idempotent (bỏ qua nếu chủ ví đã có danh mục) */
export const DEFAULT_CATEGORIES: Array<{ name: string; kind: 'income' | 'expense'; children?: string[] }> = [
  { name: 'Ăn uống', kind: 'expense', children: ['Đi chợ', 'Ăn ngoài', 'Cà phê'] },
  { name: 'Di chuyển', kind: 'expense', children: ['Xăng xe', 'Grab/Taxi', 'Bảo dưỡng xe'] },
  { name: 'Nhà cửa', kind: 'expense', children: ['Tiền nhà', 'Điện nước', 'Internet'] },
  { name: 'Công việc & Dự án', kind: 'expense', children: ['Server & AI', 'Phần mềm', 'Nhân sự riêng', 'Marketing'] },
  { name: 'Sức khỏe', kind: 'expense' },
  { name: 'Giải trí', kind: 'expense' },
  { name: 'Giáo dục', kind: 'expense' },
  { name: 'Từ thiện', kind: 'expense' },
  { name: 'Tiết kiệm & Đầu tư', kind: 'expense', children: ['Nạp hũ mục tiêu', 'Mua tài sản'] },
  { name: 'Khác (chi)', kind: 'expense' },
  { name: 'Lương', kind: 'income' },
  { name: 'Freelance & Dịch vụ', kind: 'income' },
  { name: 'Bán hàng cá nhân', kind: 'income' },
  { name: 'Lãi & Đầu tư', kind: 'income' },
  { name: 'Thu nợ', kind: 'income' },
  { name: 'Khác (thu)', kind: 'income' },
];

export async function seedDefaultCategories(ctx: SwCtx): Promise<{ seeded: number }> {
  const existing = await ctx.db.select({ id: swCategories.id }).from(swCategories)
    .where(own(swCategories, ctx)).limit(1);
  if (existing.length) return { seeded: 0 };
  let n = 0;
  for (const c of DEFAULT_CATEGORIES) {
    const parent = await ctx.db.insert(swCategories).values({
      orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
      name: c.name, kind: c.kind, isSystem: true,
    }).returning();
    n++;
    for (const child of c.children ?? []) {
      await ctx.db.insert(swCategories).values({
        orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
        name: child, kind: c.kind, parentId: parent[0]!.id, isSystem: true,
      });
      n++;
    }
  }
  await writeAudit(ctx, { action: 'sw.category.seed', entity: 'sw_categories', after: { seeded: n } });
  return { seeded: n };
}

// ── Tags ───────────────────────────────────────────────────────────────────
export async function upsertTag(ctx: SwCtx, input: z.infer<typeof tagUpsertSchema>) {
  if (input.id) {
    const rows = await ctx.db.update(swTags)
      .set({ name: input.name, updatedAt: new Date() })
      .where(and(own(swTags, ctx), eq(swTags.id, input.id))).returning();
    if (!rows[0]) throw new SwError('INVALID_INPUT', `Không tìm thấy tag ${input.id}`);
    return rows[0];
  }
  const found = await ctx.db.select().from(swTags)
    .where(and(own(swTags, ctx), eq(swTags.name, input.name))).limit(1);
  if (found[0]) return found[0];
  const rows = await ctx.db.insert(swTags).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId, name: input.name,
  }).returning();
  return rows[0]!;
}

export async function listTags(ctx: SwCtx) {
  return ctx.db.select().from(swTags).where(own(swTags, ctx));
}
