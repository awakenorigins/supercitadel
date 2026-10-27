/**
 * SOUL-WALLET 1A — budget.service
 * · Envelope theo tháng + rollover (carried = dư kỳ trước nếu bật)
 * · Preset 6 Hũ (JARS): NEC 55 / FFA 10 / EDU 10 / LTS 10 / PLAY 10 / GIVE 5
 *   Mapping chi tiêu → hũ (v1, ghi rõ trong GUIDE):
 *     PLAY=Giải trí · EDU=Giáo dục · GIVE=Từ thiện · LTS=Tiết kiệm & Đầu tư
 *     FFA=đóng góp tay (mặc định 0) · NEC = tổng chi − (PLAY+EDU+GIVE+LTS)
 * · Budget theo danh mục: spent = Σ chi của danh mục + toàn bộ danh mục con
 * · Risk: tốc độ tiêu hiện tại → dự phóng cuối kỳ, cảnh báo vượt
 * · Goals: hũ mục tiêu — contribute có thể sinh giao dịch chi 'Nạp hũ mục tiêu'
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { SwCtx } from '../types.js';
import { SwError, SIX_JARS, money, isoMonth, isoDay } from '../types.js';
import {
  swBudgets, swBudgetPeriods, swGoals, swGoalContributions,
  swCategories, swCategoryMonthSummary,
} from '../db/schema.js';
import { own, writeAudit } from './ledger.service.js';
import { createTx } from './transaction.service.js';
import { listCategories } from './catalog.service.js';
import type {
  budgetUpsertSchema, sixJarsApplySchema, goalCreateSchema, goalContributeSchema,
} from '../validation/schemas.js';

function prevMonth(month: string): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return isoMonth(d);
}

async function ensurePeriod(ctx: SwCtx, budget: typeof swBudgets.$inferSelect, period: string) {
  const found = await ctx.db.select().from(swBudgetPeriods)
    .where(and(own(swBudgetPeriods, ctx), eq(swBudgetPeriods.budgetId, budget.id), eq(swBudgetPeriods.period, period)))
    .limit(1);
  if (found[0]) return found[0];

  let carried = '0';
  if (budget.rollover) {
    const prev = await ctx.db.select().from(swBudgetPeriods)
      .where(and(own(swBudgetPeriods, ctx), eq(swBudgetPeriods.budgetId, budget.id), eq(swBudgetPeriods.period, prevMonth(period))))
      .limit(1);
    if (prev[0]) {
      const spentPrev = await spentOf(ctx, budget, prevMonth(period));
      const remain = money.sub(money.add(String(prev[0].planned), String(prev[0].carried)), spentPrev);
      if (money.isPos(remain)) carried = remain;
    }
  }
  const rows = await ctx.db.insert(swBudgetPeriods).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId,
    budgetId: budget.id, period, planned: String(budget.amount), carried,
  }).returning();
  return rows[0]!;
}

/** Σ chi tháng của (danh mục + con) từ summary layer */
async function categorySpent(ctx: SwCtx, categoryId: string, month: string): Promise<string> {
  const cats = await listCategories(ctx, 'expense');
  const ids = new Set([categoryId, ...cats.filter((c) => c.parentId === categoryId).map((c) => c.id)]);
  const rows = await ctx.db.select().from(swCategoryMonthSummary)
    .where(and(own(swCategoryMonthSummary, ctx),
      eq(swCategoryMonthSummary.month, month), eq(swCategoryMonthSummary.kind, 'expense')));
  let s = '0';
  for (const r of rows) if (r.categoryId && ids.has(r.categoryId)) s = money.add(s, String(r.amount));
  return s;
}

const JAR_CATEGORY: Record<string, string | null> = {
  PLAY: 'Giải trí', EDU: 'Giáo dục', GIVE: 'Từ thiện', LTS: 'Tiết kiệm & Đầu tư', FFA: null, NEC: null,
};

async function spentOf(ctx: SwCtx, budget: typeof swBudgets.$inferSelect, month: string): Promise<string> {
  if (budget.categoryId) return categorySpent(ctx, budget.categoryId, month);
  if (budget.jarCode) {
    const cats = await ctx.db.select().from(swCategories).where(own(swCategories, ctx));
    const byName = new Map(cats.map((c) => [c.name, c.id]));
    if (budget.jarCode === 'NEC') {
      const rows = await ctx.db.select().from(swCategoryMonthSummary)
        .where(and(own(swCategoryMonthSummary, ctx),
          eq(swCategoryMonthSummary.month, month), eq(swCategoryMonthSummary.kind, 'expense')));
      let total = '0';
      for (const r of rows) total = money.add(total, String(r.amount));
      let others = '0';
      for (const jar of ['PLAY', 'EDU', 'GIVE', 'LTS']) {
        const catId = byName.get(JAR_CATEGORY[jar]!);
        if (catId) others = money.add(others, await categorySpent(ctx, catId, month));
      }
      const nec = money.sub(total, others);
      return money.isNeg(nec) ? '0' : nec;
    }
    const catName = JAR_CATEGORY[budget.jarCode];
    if (!catName) return '0'; // FFA — đóng góp tay
    const catId = byName.get(catName);
    return catId ? categorySpent(ctx, catId, month) : '0';
  }
  // budget tổng: toàn bộ chi tháng
  const rows = await ctx.db.select().from(swCategoryMonthSummary)
    .where(and(own(swCategoryMonthSummary, ctx),
      eq(swCategoryMonthSummary.month, month), eq(swCategoryMonthSummary.kind, 'expense')));
  let s = '0';
  for (const r of rows) s = money.add(s, String(r.amount));
  return s;
}

export async function upsertBudget(ctx: SwCtx, input: z.infer<typeof budgetUpsertSchema>) {
  const period = input.period ?? isoMonth(new Date());
  let budget: typeof swBudgets.$inferSelect;
  if (input.id) {
    const rows = await ctx.db.update(swBudgets).set({
      name: input.name, amount: input.amount, categoryId: input.category_id,
      jarCode: input.jar_code, rollover: input.rollover, updatedAt: new Date(),
    }).where(and(own(swBudgets, ctx), eq(swBudgets.id, input.id))).returning();
    if (!rows[0]) throw new SwError('BUDGET_NOT_FOUND', `Không tìm thấy ngân sách ${input.id}`);
    budget = rows[0];
    await ctx.db.update(swBudgetPeriods).set({ planned: input.amount })
      .where(and(own(swBudgetPeriods, ctx), eq(swBudgetPeriods.budgetId, budget.id), eq(swBudgetPeriods.period, period)));
  } else {
    const rows = await ctx.db.insert(swBudgets).values({
      orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
      name: input.name, amount: input.amount, categoryId: input.category_id,
      jarCode: input.jar_code, rollover: input.rollover,
    }).returning();
    budget = rows[0]!;
  }
  await ensurePeriod(ctx, budget, period);
  await writeAudit(ctx, { action: 'sw.budget.upsert', entity: 'sw_budgets', entityId: budget.id, after: input });
  return budget;
}

export async function sixJarsApply(ctx: SwCtx, input: z.infer<typeof sixJarsApplySchema>) {
  const period = input.period ?? isoMonth(new Date());
  const existing = await ctx.db.select().from(swBudgets).where(own(swBudgets, ctx));
  const byJar = new Map(existing.filter((b) => b.jarCode).map((b) => [b.jarCode!, b]));
  const out: Array<{ jar: string; name: string; amount: string }> = [];
  for (const jar of SIX_JARS) {
    const amount = money.pct(input.monthly_income, jar.percent);
    const cur = byJar.get(jar.code);
    await upsertBudget(ctx, {
      id: cur?.id, name: jar.name, amount,
      jar_code: jar.code as never, rollover: cur?.rollover ?? false, period,
    } as never);
    out.push({ jar: jar.code, name: jar.name, amount });
  }
  return { period, monthly_income: input.monthly_income, jars: out };
}

export async function budgetStatus(ctx: SwCtx, period?: string) {
  const month = period ?? isoMonth(new Date());
  const budgets = await ctx.db.select().from(swBudgets)
    .where(and(own(swBudgets, ctx), eq(swBudgets.active, true)));
  const today = new Date();
  const monthStart = new Date(`${month}T00:00:00Z`);
  const nextMonth = new Date(monthStart); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const daysInMonth = Math.round((nextMonth.getTime() - monthStart.getTime()) / 86400_000);
  const elapsed = Math.min(daysInMonth, Math.max(1,
    Math.floor((today.getTime() - monthStart.getTime()) / 86400_000) + 1));

  const items = [];
  for (const b of budgets) {
    const p = await ensurePeriod(ctx, b, month);
    const spent = await spentOf(ctx, b, month);
    const limit = money.add(String(p.planned), String(p.carried));
    const remaining = money.sub(limit, spent);
    const pctUsed = Number(limit) > 0 ? Math.round((Number(spent) / Number(limit)) * 100) : 0;
    const projected = String(Math.round((Number(spent) / elapsed) * daysInMonth));
    const exceeded = money.isNeg(remaining);
    const atRisk = !exceeded && money.cmp(projected, limit) > 0;
    if (exceeded) {
      await ctx.bus.emit('sw.budget.exceeded', {
        org_id: ctx.orgId, owner_user_id: ctx.ownerId,
        budget_id: b.id, name: b.name, spent, limit,
      });
    }
    items.push({
      id: b.id, name: b.name, jar_code: b.jarCode, category_id: b.categoryId,
      period: month, planned: String(p.planned), carried: String(p.carried),
      limit, spent, remaining, pct_used: pctUsed,
      projected_end: projected, at_risk: atRisk, exceeded,
    });
  }
  return { period: month, elapsed_days: elapsed, days_in_month: daysInMonth, budgets: items };
}

// ── GOALS ──────────────────────────────────────────────────────────────────
export async function createGoal(ctx: SwCtx, input: z.infer<typeof goalCreateSchema>) {
  const rows = await ctx.db.insert(swGoals).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId, createdBy: ctx.ownerId,
    name: input.name, target: input.target, deadline: input.deadline, accountId: input.account_id,
  }).returning();
  await writeAudit(ctx, { action: 'sw.goal.create', entity: 'sw_goals', entityId: rows[0]!.id, after: input });
  return rows[0]!;
}

export async function contributeGoal(ctx: SwCtx, input: z.infer<typeof goalContributeSchema>) {
  const rows = await ctx.db.select().from(swGoals)
    .where(and(own(swGoals, ctx), eq(swGoals.id, input.goal_id))).limit(1);
  const goal = rows[0];
  if (!goal) throw new SwError('GOAL_NOT_FOUND', `Không tìm thấy hũ mục tiêu ${input.goal_id}`);

  let txId: string | undefined;
  if (input.from_account_id) {
    const cats = await listCategories(ctx, 'expense');
    const cat = cats.find((c) => c.name === 'Nạp hũ mục tiêu') ?? cats.find((c) => c.name === 'Tiết kiệm & Đầu tư');
    const tx = await createTx(ctx, {
      kind: 'expense',
      occurred_at: input.occurred_at ?? new Date().toISOString(),
      account_id: input.from_account_id,
      category_id: cat?.id,
      amount: input.amount,
      memo: `Nạp hũ mục tiêu: ${goal.name}`,
      status: 'posted',
    } as never);
    txId = tx.id;
  }

  await ctx.db.insert(swGoalContributions).values({
    orgId: ctx.orgId, ownerUserId: ctx.ownerId,
    goalId: goal.id, amount: input.amount, txId,
  });
  const saved = money.add(String(goal.saved), input.amount);
  const reached = !goal.reachedAt && money.cmp(saved, String(goal.target)) >= 0;
  await ctx.db.update(swGoals)
    .set({ saved, reachedAt: reached ? new Date() : goal.reachedAt, updatedAt: new Date() })
    .where(and(own(swGoals, ctx), eq(swGoals.id, goal.id)));
  if (reached) {
    await ctx.bus.emit('sw.goal.reached', {
      org_id: ctx.orgId, owner_user_id: ctx.ownerId,
      goal_id: goal.id, name: goal.name, target: String(goal.target),
    });
  }
  await writeAudit(ctx, { action: 'sw.goal.contribute', entity: 'sw_goals', entityId: goal.id, after: { ...input, saved } });
  return { goal_id: goal.id, name: goal.name, saved, target: String(goal.target), reached, tx_id: txId };
}

export async function goalStatus(ctx: SwCtx) {
  const goals = await ctx.db.select().from(swGoals).where(own(swGoals, ctx));
  return goals.map((g) => ({
    id: g.id, name: g.name, target: String(g.target), saved: String(g.saved),
    pct: Number(g.target) > 0 ? Math.round((Number(g.saved) / Number(g.target)) * 100) : 0,
    deadline: g.deadline ? String(g.deadline) : null,
    reached: !!g.reachedAt,
    days_left: g.deadline ? Math.ceil((new Date(`${g.deadline}T00:00:00Z`).getTime() - Date.now()) / 86400_000) : null,
  }));
}

export { spentOf as _spentOfForTest, isoDay as _isoDay };
