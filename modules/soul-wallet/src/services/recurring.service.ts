/**
 * SOUL-WALLET 1A — recurring.service
 * · Khoản định kỳ: subscription/bill (chi) · income (thu)
 * · runRecurring: catch-up mọi kỳ đến hạn — auto_post=true ghi thẳng,
 *   false sinh DRAFT chờ duyệt (postDraft)
 * · addMonths clamp cuối tháng (31/1 + 1m → 28/2)
 * · last_amount lưu giá kỳ trước → anomaly bắt "âm thầm tăng giá"
 */
import { and, eq, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { SwCtx, RecurringFreq } from '../types.js';
import { SwError, isoDay } from '../types.js';
import { swRecurringRules } from '../db/schema.js';
import { own, writeAudit } from './ledger.service.js';
import { createTx } from './transaction.service.js';
import type { recurringUpsertSchema } from '../validation/schemas.js';

export function advanceDate(day: string, freq: RecurringFreq, interval: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (freq === 'daily') d.setUTCDate(d.getUTCDate() + interval);
  else if (freq === 'weekly') d.setUTCDate(d.getUTCDate() + 7 * interval);
  else if (freq === 'monthly') {
    const dom = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + interval);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dom, lastDay));
  } else {
    d.setUTCFullYear(d.getUTCFullYear() + interval);
  }
  return isoDay(d);
}

export async function upsertRecurring(ctx: SwCtx, input: z.infer<typeof recurringUpsertSchema>) {
  if (input.id) {
    const found = await ctx.db.select().from(swRecurringRules)
      .where(and(own(swRecurringRules, ctx), eq(swRecurringRules.id, input.id))).limit(1);
    if (!found[0]) throw new SwError('RECURRING_NOT_FOUND', `Không tìm thấy khoản định kỳ ${input.id}`);
    const rows = await ctx.db.update(swRecurringRules).set({
      name: input.name, kind: input.kind, accountId: input.account_id,
      categoryId: input.category_id, contactId: input.contact_id,
      amount: input.amount, freq: input.freq, intervalN: input.interval_n,
      nextRunAt: input.next_run_at, autoPost: input.auto_post, active: input.active,
      // đổi giá: giữ last_amount cũ để anomaly so sánh
      lastAmount: found[0].lastAmount ?? String(found[0].amount),
      updatedAt: new Date(),
    }).where(and(own(swRecurringRules, ctx), eq(swRecurringRules.id, input.id))).returning();
    await writeAudit(ctx, { action: 'sw.recurring.update', entity: 'sw_recurring_rules', entityId: input.id, before: found[0], after: input });
    return rows[0]!;
  }
  const rows = await ctx.db.insert(swRecurringRules).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    name: input.name, kind: input.kind, accountId: input.account_id,
    categoryId: input.category_id, contactId: input.contact_id,
    amount: input.amount, freq: input.freq, intervalN: input.interval_n,
    nextRunAt: input.next_run_at, autoPost: input.auto_post, active: input.active,
  }).returning();
  await writeAudit(ctx, { action: 'sw.recurring.create', entity: 'sw_recurring_rules', entityId: rows[0]!.id, after: input });
  return rows[0]!;
}

export async function upcomingRecurring(ctx: SwCtx, days = 30) {
  const horizon = isoDay(new Date(Date.now() + days * 86400_000));
  const rows = await ctx.db.select().from(swRecurringRules)
    .where(and(own(swRecurringRules, ctx), eq(swRecurringRules.active, true),
      lte(swRecurringRules.nextRunAt, horizon)));
  return rows
    .map((r) => ({
      id: r.id, name: r.name, kind: r.kind, amount: String(r.amount),
      next_run_at: String(r.nextRunAt), freq: r.freq, auto_post: r.autoPost,
      price_hiked: !!(r.lastAmount && BigInt(String(r.amount)) > BigInt(String(r.lastAmount))),
    }))
    .sort((a, b) => a.next_run_at.localeCompare(b.next_run_at));
}

/** Chạy mọi kỳ đến hạn (catch-up). now cho test — mặc định hôm nay. */
export async function runRecurring(ctx: SwCtx, now?: string) {
  const today = now ?? isoDay(new Date());
  const rules = await ctx.db.select().from(swRecurringRules)
    .where(and(own(swRecurringRules, ctx), eq(swRecurringRules.active, true),
      lte(swRecurringRules.nextRunAt, today)));

  let posted = 0, drafts = 0;
  const details: Array<{ rule: string; occurred_at: string; status: string; tx_id: string }> = [];
  for (const r of rules) {
    let cursor = String(r.nextRunAt);
    let guard = 0;
    while (cursor <= today && guard < 120) {
      guard++;
      const tx = await createTx(ctx, {
        kind: r.kind === 'income' ? 'income' : 'expense',
        occurred_at: `${cursor}T00:00:00Z`,
        account_id: r.accountId,
        category_id: r.categoryId ?? undefined,
        contact_id: r.contactId ?? undefined,
        amount: String(r.amount),
        memo: r.name,
        status: r.autoPost ? 'posted' : 'draft',
        meta: { recurring_id: r.id },
      } as never);
      if (r.autoPost) posted++; else drafts++;
      details.push({ rule: r.name, occurred_at: cursor, status: r.autoPost ? 'posted' : 'draft', tx_id: tx.id });
      cursor = advanceDate(cursor, r.freq as RecurringFreq, r.intervalN);
    }
    await ctx.db.update(swRecurringRules)
      .set({ nextRunAt: cursor, lastAmount: String(r.amount), updatedAt: new Date() })
      .where(and(own(swRecurringRules, ctx), eq(swRecurringRules.id, r.id)));
  }
  if (posted + drafts > 0) {
    await ctx.bus.emit('sw.recurring.posted', {
      org_id: ctx.orgId, owner_user_id: ctx.ownerId, posted, drafts,
    });
  }
  return { posted, drafts, details };
}
