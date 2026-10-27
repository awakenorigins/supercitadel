/**
 * SOUL-WALLET 1A — rule.service (bộ não phân loại)
 * Rule = matcher (memo/payee contains, khoảng tiền, ví, kind) → set_fields
 * (category/contact/tags). Chạy theo priority tăng dần, RULE ĐẦU TIÊN khớp thắng.
 * Dùng bởi: import preview (gợi ý), tx.create qua Tiểu Tâm (gợi ý), testRules.
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { SwCtx } from '../types.js';
import { SwError, money } from '../types.js';
import { swRules, swContacts } from '../db/schema.js';
import { own, writeAudit } from './ledger.service.js';
import { searchTx } from './transaction.service.js';
import type { ruleUpsertSchema } from '../validation/schemas.js';

export interface RuleProbe {
  memo?: string | null;
  contact_name?: string | null;
  amount?: string;
  account_id?: string;
  kind?: string;
}
export interface RuleMatch {
  rule_id: string; rule_name: string;
  set_fields: { category_id?: string; contact_id?: string; tag_ids?: string[] };
}

type MatchSpec = {
  memo_contains?: string; payee_contains?: string;
  min_amount?: string; max_amount?: string;
  account_id?: string; kind?: string;
};

const norm = (s: string) => s.toLowerCase().normalize('NFC');

export async function upsertRule(ctx: SwCtx, input: z.infer<typeof ruleUpsertSchema>) {
  if (input.id) {
    const rows = await ctx.db.update(swRules).set({
      name: input.name, priority: input.priority,
      match: input.match as never, setFields: input.set_fields as never,
      active: input.active, updatedAt: new Date(),
    }).where(and(own(swRules, ctx), eq(swRules.id, input.id))).returning();
    if (!rows[0]) throw new SwError('RULE_NOT_FOUND', `Không tìm thấy rule ${input.id}`);
    await writeAudit(ctx, { action: 'sw.rule.update', entity: 'sw_rules', entityId: input.id, after: input });
    return rows[0];
  }
  const rows = await ctx.db.insert(swRules).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    name: input.name, priority: input.priority,
    match: input.match as never, setFields: input.set_fields as never, active: input.active,
  }).returning();
  await writeAudit(ctx, { action: 'sw.rule.create', entity: 'sw_rules', entityId: rows[0]!.id, after: input });
  return rows[0]!;
}

export async function listRules(ctx: SwCtx) {
  const rows = await ctx.db.select().from(swRules).where(own(swRules, ctx));
  return rows.sort((a, b) => a.priority - b.priority);
}

function matches(m: MatchSpec, probe: RuleProbe): boolean {
  if (m.memo_contains && !norm(probe.memo ?? '').includes(norm(m.memo_contains))) return false;
  if (m.payee_contains && !norm(probe.contact_name ?? '').includes(norm(m.payee_contains))) return false;
  if (m.account_id && m.account_id !== probe.account_id) return false;
  if (m.kind && m.kind !== probe.kind) return false;
  if (m.min_amount && (!probe.amount || money.cmp(probe.amount, m.min_amount) < 0)) return false;
  if (m.max_amount && (!probe.amount || money.cmp(probe.amount, m.max_amount) > 0)) return false;
  return true;
}

/** Rule đầu tiên (priority nhỏ nhất) khớp probe — null nếu không rule nào khớp */
export async function applyRules(ctx: SwCtx, probe: RuleProbe): Promise<RuleMatch | null> {
  const rules = (await listRules(ctx)).filter((r) => r.active);
  for (const r of rules) {
    if (matches(r.match as MatchSpec, probe)) {
      return { rule_id: r.id, rule_name: r.name, set_fields: r.setFields as RuleMatch['set_fields'] };
    }
  }
  return null;
}

/** Chạy thử rule trên các giao dịch gần nhất — trả gợi ý thay đổi phân loại */
export async function testRules(ctx: SwCtx, limit = 50) {
  const txs = await searchTx(ctx, { limit } as never);
  const contacts = new Map((await ctx.db.select().from(swContacts).where(own(swContacts, ctx))).map((c) => [c.id, c.name]));
  const suggestions = [];
  for (const t of txs) {
    const hit = await applyRules(ctx, {
      memo: t.memo, amount: String(t.amount),
      account_id: t.accountId, kind: t.kind,
      contact_name: t.contactId ? contacts.get(t.contactId) : undefined,
    });
    if (hit && hit.set_fields.category_id && hit.set_fields.category_id !== t.categoryId) {
      suggestions.push({
        tx_id: t.id, doc_no: t.docNo, memo: t.memo,
        current_category_id: t.categoryId,
        suggested: hit.set_fields, by_rule: hit.rule_name,
      });
    }
  }
  return { scanned: txs.length, suggestions };
}
