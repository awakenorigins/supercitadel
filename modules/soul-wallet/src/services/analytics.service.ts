/**
 * SOUL-WALLET 1A — analytics.service (tầng "siêu thông minh")
 * · refreshDailySnapshots: OHLC số dư theo ngày/tài khoản — nuôi NẾN cash-range,
 *   heatmap, line. Chiến lược: RANGED REBUILD từ ngày sớm nhất bị chạm — luôn
 *   đúng kể cả bút toán backdate; invariant test: full rebuild == ranged.
 * · refreshMonthAggregates: sw_monthly_summary + sw_category_month_summary
 *   (splits override category của tx; refund trừ vào chi; fee cộng vào chi)
 * · refreshNetworth: tài sản − nợ cuối tháng
 * · anomalyScan: z-score chi theo danh mục, giao dịch lớn, trùng khả nghi,
 *   subscription tăng giá — CHỈ ĐỀ XUẤT, không tự hành động
 * · forecastRunway: burn rate trọng số 30/90 ngày + recurring sắp tới
 * · chart-data: donut / candles / waterfall / heatmap / trend — JSON chuẩn hóa
 */
import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import type { SwCtx } from '../types.js';
import { money, isoDay, isoMonth } from '../types.js';
import {
  swAccounts, swLedgerEntries, swTransactions, swTransactionSplits,
  swSnapshotsDaily, swMonthlySummary, swCategoryMonthSummary, swNetworthSnapshots,
  swCategories, swRecurringRules, swContacts,
} from '../db/schema.js';
import { own } from './ledger.service.js';

const LIQUID_TYPES = ['cash', 'bank', 'ewallet'];

// ── SNAPSHOT OHLC ──────────────────────────────────────────────────────────
/** Rebuild snapshot của 1 tài khoản từ fromDay (mặc định: toàn bộ lịch sử). */
export async function refreshDailySnapshots(ctx: SwCtx, accountId: string, fromDay?: string): Promise<number> {
  const accRows = await ctx.db.select().from(swAccounts)
    .where(and(own(swAccounts, ctx), eq(swAccounts.id, accountId))).limit(1);
  const acc = accRows[0];
  if (!acc) return 0;

  // base = opening + Σdelta trước fromDay
  let base = String(acc.openingBalance);
  if (fromDay) {
    const pre = await ctx.db
      .select({ s: sql<string>`COALESCE(SUM(${swLedgerEntries.delta}), 0)::numeric(18,0)::text` })
      .from(swLedgerEntries)
      .where(and(own(swLedgerEntries, ctx), eq(swLedgerEntries.accountId, accountId),
        sql`${swLedgerEntries.occurredAt} < ${fromDay}::date`));
    base = money.add(base, pre[0]?.s ?? '0');
  }

  const entryCond = fromDay
    ? and(own(swLedgerEntries, ctx), eq(swLedgerEntries.accountId, accountId),
        sql`${swLedgerEntries.occurredAt} >= ${fromDay}::date`)
    : and(own(swLedgerEntries, ctx), eq(swLedgerEntries.accountId, accountId));
  const entries = await ctx.db.select().from(swLedgerEntries)
    .where(entryCond)
    .orderBy(swLedgerEntries.occurredAt, swLedgerEntries.createdAt);

  // xóa range cũ rồi ghi lại (rebuild — nguồn chân lý là ledger)
  const delCond = fromDay
    ? and(own(swSnapshotsDaily, ctx), eq(swSnapshotsDaily.accountId, accountId), gte(swSnapshotsDaily.day, fromDay))
    : and(own(swSnapshotsDaily, ctx), eq(swSnapshotsDaily.accountId, accountId));
  await ctx.db.delete(swSnapshotsDaily).where(delCond);

  let running = base;
  let curDay = '';
  let open = base, high = base, low = base, cashIn = '0', cashOut = '0';
  const out: Array<typeof swSnapshotsDaily.$inferInsert> = [];
  const flush = () => {
    if (!curDay) return;
    out.push({
      orgId: ctx.orgId, ownerUserId: ctx.ownerId, accountId,
      day: curDay, open, high, low, close: running, cashIn, cashOut,
    });
  };
  for (const e of entries) {
    const d = isoDay(e.occurredAt);
    if (d !== curDay) {
      flush();
      curDay = d; open = running; high = running; low = running; cashIn = '0'; cashOut = '0';
    }
    const delta = String(e.delta);
    running = money.add(running, delta);
    high = money.max(high, running);
    low = money.min(low, running);
    if (money.isPos(delta)) cashIn = money.add(cashIn, delta);
    else cashOut = money.add(cashOut, money.abs(delta));
  }
  flush();
  if (out.length) await ctx.db.insert(swSnapshotsDaily).values(out);
  return out.length;
}

/** Rebuild toàn bộ snapshot mọi tài khoản (job đêm / đối soát) */
export async function rebuildAllSnapshots(ctx: SwCtx): Promise<number> {
  const accs = await ctx.db.select({ id: swAccounts.id }).from(swAccounts).where(own(swAccounts, ctx));
  let n = 0;
  for (const a of accs) n += await refreshDailySnapshots(ctx, a.id);
  return n;
}

// ── TỔNG HỢP THÁNG ─────────────────────────────────────────────────────────
export async function refreshMonthAggregates(ctx: SwCtx, months: string[]): Promise<void> {
  for (const month of [...new Set(months)]) {
    const monthEnd = sql`(${month}::date + interval '1 month')`;
    const txs = await ctx.db.select().from(swTransactions)
      .where(and(own(swTransactions, ctx), eq(swTransactions.status, 'posted'),
        sql`${swTransactions.occurredAt} >= ${month}::date`,
        sql`${swTransactions.occurredAt} < ${monthEnd}`));

    const ids = txs.map((t) => t.id);
    const splits = ids.length
      ? await ctx.db.select().from(swTransactionSplits)
          .where(and(own(swTransactionSplits, ctx), inArray(swTransactionSplits.txId, ids)))
      : [];
    const splitsByTx = new Map<string, typeof splits>();
    for (const s of splits) {
      const arr = splitsByTx.get(s.txId) ?? [];
      arr.push(s); splitsByTx.set(s.txId, arr);
    }

    let income = '0', expense = '0';
    const catAmount = new Map<string, { kind: 'income' | 'expense'; amount: string }>();
    const addCat = (catId: string | null, kind: 'income' | 'expense', amt: string) => {
      const key = `${kind}:${catId ?? 'null'}`;
      const cur = catAmount.get(key) ?? { kind, amount: '0' };
      cur.amount = money.add(cur.amount, amt);
      catAmount.set(key, cur);
    };

    for (const t of txs) {
      const amt = String(t.amount);
      const parts = splitsByTx.get(t.id);
      const catParts: Array<{ catId: string | null; amt: string }> =
        parts?.length ? parts.map((p) => ({ catId: p.categoryId, amt: String(p.amount) }))
                      : [{ catId: t.categoryId, amt }];
      switch (t.kind) {
        case 'income':
          income = money.add(income, amt);
          for (const p of catParts) addCat(p.catId, 'income', p.amt);
          break;
        case 'expense':
        case 'fee':
          expense = money.add(expense, amt);
          for (const p of catParts) addCat(p.catId, 'expense', p.amt);
          break;
        case 'refund':
          expense = money.sub(expense, amt); // hoàn tiền giảm chi thực
          for (const p of catParts) addCat(p.catId, 'expense', money.neg(p.amt));
          break;
        // transfer/adjust không vào thu-chi
      }
    }

    // UPSERT nguyên tử — cùng bài race như networth (2 request refresh song song)
    await ctx.db.insert(swMonthlySummary)
      .values({ orgId: ctx.orgId, ownerUserId: ctx.ownerId, month, income, expense })
      .onConflictDoUpdate({
        target: [swMonthlySummary.orgId, swMonthlySummary.ownerUserId, swMonthlySummary.month],
        set: { income, expense },
      });

    await ctx.db.delete(swCategoryMonthSummary)
      .where(and(own(swCategoryMonthSummary, ctx), eq(swCategoryMonthSummary.month, month)));
    const catRows = [...catAmount.entries()].map(([key, v]) => ({
      orgId: ctx.orgId, ownerUserId: ctx.ownerId, month,
      categoryId: key.split(':')[1] === 'null' ? null : key.split(':')[1],
      kind: v.kind, amount: v.amount,
    }));
    if (catRows.length) await ctx.db.insert(swCategoryMonthSummary).values(catRows);
  }
}

/** Networth cuối tháng: assets = Σ số dư dương; liabilities = Σ |số dư âm| */
export async function refreshNetworth(ctx: SwCtx, month: string): Promise<{ assets: string; liabilities: string; net: string }> {
  const accs = await ctx.db.select().from(swAccounts).where(own(swAccounts, ctx));
  const endExpr = sql`(${month}::date + interval '1 month')`;
  let assets = '0', liabilities = '0';
  for (const a of accs) {
    const rows = await ctx.db
      .select({ s: sql<string>`COALESCE(SUM(${swLedgerEntries.delta}), 0)::numeric(18,0)::text` })
      .from(swLedgerEntries)
      .where(and(own(swLedgerEntries, ctx), eq(swLedgerEntries.accountId, a.id),
        sql`${swLedgerEntries.occurredAt} < ${endExpr}`));
    const bal = money.add(String(a.openingBalance), rows[0]?.s ?? '0');
    if (money.isNeg(bal)) liabilities = money.add(liabilities, money.abs(bal));
    else assets = money.add(assets, bal);
  }
  // UPSERT nguyên tử — tránh race delete+insert khi 2 request song song (executive + narrate)
  // cùng refresh → duplicate key (org_id, owner_user_id, month). Bài học: 500 narrate 06/07.
  await ctx.db.insert(swNetworthSnapshots)
    .values({ orgId: ctx.orgId, ownerUserId: ctx.ownerId, month, assets, liabilities })
    .onConflictDoUpdate({
      target: [swNetworthSnapshots.orgId, swNetworthSnapshots.ownerUserId, swNetworthSnapshots.month],
      set: { assets, liabilities },
    });
  return { assets, liabilities, net: money.sub(assets, liabilities) };
}

// ── ANOMALY — chỉ đề xuất ──────────────────────────────────────────────────
export interface AnomalyAlert { type: string; message: string; detail?: Record<string, unknown> }

export async function anomalyScan(ctx: SwCtx, lookbackDays = 90): Promise<{ alerts: AnomalyAlert[] }> {
  const alerts: AnomalyAlert[] = [];
  const since = new Date(Date.now() - lookbackDays * 86400_000);
  const txs = await ctx.db.select().from(swTransactions)
    .where(and(own(swTransactions, ctx), eq(swTransactions.status, 'posted'),
      inArray(swTransactions.kind, ['expense', 'fee']),
      gte(swTransactions.occurredAt, since)));

  // 1. Giao dịch lớn bất thường: > mean + 3σ toàn cục
  if (txs.length >= 8) {
    const vals = txs.map((t) => Number(t.amount));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    for (const t of txs) {
      const z = (Number(t.amount) - mean) / sd;
      if (z >= 3) alerts.push({
        type: 'large_tx',
        message: `Chi bất thường ${t.amount} VND (${t.memo ?? t.docNo}) — lệch ${z.toFixed(1)}σ so với thói quen`,
        detail: { tx_id: t.id, z: Number(z.toFixed(2)) },
      });
    }
  }

  // 2. Danh mục tháng này lệch chuẩn so với lịch sử (z-score trên summary)
  const curMonth = isoMonth(new Date());
  const hist = await ctx.db.select().from(swCategoryMonthSummary)
    .where(and(own(swCategoryMonthSummary, ctx), eq(swCategoryMonthSummary.kind, 'expense')));
  const byCat = new Map<string, Array<{ month: string; amount: number }>>();
  for (const r of hist) {
    const k = r.categoryId ?? 'null';
    const arr = byCat.get(k) ?? [];
    arr.push({ month: String(r.month), amount: Number(r.amount) });
    byCat.set(k, arr);
  }
  const catNames = new Map((await ctx.db.select().from(swCategories).where(own(swCategories, ctx))).map((c) => [c.id, c.name]));
  for (const [catId, arr] of byCat) {
    const past = arr.filter((x) => x.month !== curMonth).map((x) => x.amount);
    const cur = arr.find((x) => x.month === curMonth)?.amount;
    if (past.length >= 3 && cur !== undefined) {
      const mean = past.reduce((a, b) => a + b, 0) / past.length;
      const sd = Math.sqrt(past.reduce((a, b) => a + (b - mean) ** 2, 0) / past.length) || 1;
      const z = (cur - mean) / sd;
      if (z >= 2) alerts.push({
        type: 'category_spike',
        message: `Danh mục "${catNames.get(catId) ?? 'Không phân loại'}" tháng này ${cur} VND — cao ${z.toFixed(1)}σ so với trung bình ${Math.round(mean)}`,
        detail: { category_id: catId === 'null' ? null : catId, z: Number(z.toFixed(2)) },
      });
    }
  }

  // 3. Trùng khả nghi: cùng ví + cùng tiền + cùng ngày ≥2 lần
  const seen = new Map<string, string[]>();
  for (const t of txs) {
    const k = `${t.accountId}|${t.amount}|${isoDay(t.occurredAt)}`;
    const arr = seen.get(k) ?? [];
    arr.push(t.docNo); seen.set(k, arr);
  }
  for (const [k, docs] of seen) {
    if (docs.length >= 2) alerts.push({
      type: 'possible_duplicate',
      message: `Nghi trùng: ${docs.length} giao dịch cùng số tiền cùng ngày (${docs.join(', ')})`,
      detail: { key: k, doc_nos: docs },
    });
  }

  // 4. Subscription tăng giá: amount hiện tại > last_amount
  const recs = await ctx.db.select().from(swRecurringRules)
    .where(and(own(swRecurringRules, ctx), eq(swRecurringRules.active, true)));
  for (const r of recs) {
    if (r.lastAmount && money.cmp(String(r.amount), String(r.lastAmount)) > 0) {
      alerts.push({
        type: 'subscription_hike',
        message: `"${r.name}" âm thầm tăng giá: ${r.lastAmount} → ${r.amount} VND`,
        detail: { recurring_id: r.id, old: String(r.lastAmount), new: String(r.amount) },
      });
    }
  }

  // 5. Payee lạ tuần này chi đậm (> 2× median chi lookback)
  const contactsNew = await ctx.db.select().from(swContacts)
    .where(and(own(swContacts, ctx), gte(swContacts.createdAt, new Date(Date.now() - 7 * 86400_000))));
  if (contactsNew.length && txs.length >= 4) {
    const sorted = txs.map((t) => Number(t.amount)).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const newIds = new Set(contactsNew.map((c) => c.id));
    for (const t of txs) {
      if (t.contactId && newIds.has(t.contactId) && Number(t.amount) > 2 * median) {
        alerts.push({
          type: 'new_payee_large',
          message: `Payee mới + chi đậm: ${t.amount} VND (${t.memo ?? t.docNo})`,
          detail: { tx_id: t.id, contact_id: t.contactId },
        });
      }
    }
  }

  if (alerts.length) {
    await ctx.bus.emit('sw.anomaly.detected', {
      org_id: ctx.orgId, owner_user_id: ctx.ownerId, count: alerts.length,
      types: [...new Set(alerts.map((a) => a.type))],
    });
  }
  return { alerts };
}

// ── FORECAST RUNWAY ────────────────────────────────────────────────────────
export async function forecastRunway(ctx: SwCtx, horizonDays = 30) {
  const now = new Date();
  const netOver = async (days: number): Promise<string> => {
    const since = new Date(now.getTime() - days * 86400_000);
    const rows = await ctx.db.select().from(swTransactions)
      .where(and(own(swTransactions, ctx), eq(swTransactions.status, 'posted'),
        gte(swTransactions.occurredAt, since)));
    let net = '0';
    for (const t of rows) {
      const amt = String(t.amount);
      if (t.kind === 'income' || t.kind === 'refund') net = money.add(net, amt);
      else if (t.kind === 'expense' || t.kind === 'fee') net = money.sub(net, amt);
    }
    return net;
  };
  const net30 = Number(await netOver(30)) / 30;
  const net90 = Number(await netOver(90)) / 90;
  const dailyNet = Math.round(net30 * 0.7 + net90 * 0.3);

  const accs = await ctx.db.select().from(swAccounts).where(own(swAccounts, ctx));
  let liquid = '0';
  for (const a of accs) {
    if (!LIQUID_TYPES.includes(a.type) || a.isArchived) continue;
    const rows = await ctx.db
      .select({ s: sql<string>`COALESCE(SUM(${swLedgerEntries.delta}), 0)::numeric(18,0)::text` })
      .from(swLedgerEntries)
      .where(and(own(swLedgerEntries, ctx), eq(swLedgerEntries.accountId, a.id)));
    liquid = money.add(liquid, money.add(String(a.openingBalance), rows[0]?.s ?? '0'));
  }

  // recurring trong horizon
  const recs = await ctx.db.select().from(swRecurringRules)
    .where(and(own(swRecurringRules, ctx), eq(swRecurringRules.active, true)));
  const horizonEnd = isoDay(new Date(now.getTime() + horizonDays * 86400_000));
  let upcomingOut = '0', upcomingIn = '0';
  for (const r of recs) {
    if (String(r.nextRunAt) <= horizonEnd) {
      if (r.kind === 'income') upcomingIn = money.add(upcomingIn, String(r.amount));
      else upcomingOut = money.add(upcomingOut, String(r.amount));
    }
  }

  const projected = money.add(money.add(liquid, String(dailyNet * horizonDays)),
    money.sub(upcomingIn, upcomingOut));
  const runwayDays = dailyNet < 0 ? Math.floor(Number(liquid) / Math.abs(dailyNet)) : null;

  return {
    liquid_now: liquid,
    daily_net_weighted: String(dailyNet),
    horizon_days: horizonDays,
    upcoming_recurring_in: upcomingIn,
    upcoming_recurring_out: upcomingOut,
    projected_end_balance: projected,
    runway_days: runwayDays,       // null = dòng tiền dương, không cạn
    will_run_dry: runwayDays !== null && runwayDays <= horizonDays,
  };
}

// ── CHART DATA ─────────────────────────────────────────────────────────────
/** Donut cơ cấu thu/chi theo danh mục của 1 tháng */
export async function donutData(ctx: SwCtx, month: string, kind: 'income' | 'expense') {
  const rows = await ctx.db.select().from(swCategoryMonthSummary)
    .where(and(own(swCategoryMonthSummary, ctx),
      eq(swCategoryMonthSummary.month, month), eq(swCategoryMonthSummary.kind, kind)));
  const names = new Map((await ctx.db.select().from(swCategories).where(own(swCategories, ctx))).map((c) => [c.id, c.name]));
  return rows
    .filter((r) => money.isPos(String(r.amount)))
    .map((r) => ({ label: r.categoryId ? (names.get(r.categoryId) ?? 'Không rõ') : 'Không phân loại', value: String(r.amount) }))
    .sort((a, b) => money.cmp(b.value, a.value));
}

/** NẾN cash-range: OHLC số dư — 1 ví hoặc gộp toàn danh mục ví */
export async function candlesData(ctx: SwCtx, opts: { account_id?: string; from?: string; to?: string }) {
  if (opts.account_id) {
    const conds = [own(swSnapshotsDaily, ctx), eq(swSnapshotsDaily.accountId, opts.account_id)];
    if (opts.from) conds.push(gte(swSnapshotsDaily.day, opts.from));
    if (opts.to) conds.push(lte(swSnapshotsDaily.day, opts.to));
    const rows = await ctx.db.select().from(swSnapshotsDaily)
      .where(and(...conds)).orderBy(swSnapshotsDaily.day);
    return rows.map((r) => ({
      day: String(r.day), open: String(r.open), high: String(r.high),
      low: String(r.low), close: String(r.close),
      cash_in: String(r.cashIn), cash_out: String(r.cashOut),
    }));
  }
  // Gộp toàn bộ ví: walk toàn bộ ledger như MỘT danh mục (portfolio candle)
  const accs = await ctx.db.select().from(swAccounts).where(own(swAccounts, ctx));
  let base = accs.reduce((s, a) => money.add(s, String(a.openingBalance)), '0');
  const conds = [own(swLedgerEntries, ctx)];
  if (opts.from) {
    const pre = await ctx.db
      .select({ s: sql<string>`COALESCE(SUM(${swLedgerEntries.delta}), 0)::numeric(18,0)::text` })
      .from(swLedgerEntries)
      .where(and(own(swLedgerEntries, ctx), sql`${swLedgerEntries.occurredAt} < ${opts.from}::date`));
    base = money.add(base, pre[0]?.s ?? '0');
    conds.push(sql`${swLedgerEntries.occurredAt} >= ${opts.from}::date`);
  }
  if (opts.to) conds.push(sql`${swLedgerEntries.occurredAt} < (${opts.to}::date + interval '1 day')`);
  const entries = await ctx.db.select().from(swLedgerEntries)
    .where(and(...conds)).orderBy(swLedgerEntries.occurredAt, swLedgerEntries.createdAt);

  const out: Array<{ day: string; open: string; high: string; low: string; close: string; cash_in: string; cash_out: string }> = [];
  let running = base, curDay = '', open = base, high = base, low = base, cin = '0', cout = '0';
  const flush = () => { if (curDay) out.push({ day: curDay, open, high, low, close: running, cash_in: cin, cash_out: cout }); };
  for (const e of entries) {
    const d = isoDay(e.occurredAt);
    if (d !== curDay) { flush(); curDay = d; open = running; high = running; low = running; cin = '0'; cout = '0'; }
    const delta = String(e.delta);
    running = money.add(running, delta);
    high = money.max(high, running); low = money.min(low, running);
    if (money.isPos(delta)) cin = money.add(cin, delta); else cout = money.add(cout, money.abs(delta));
  }
  flush();
  return out;
}

/** Waterfall: đầu kỳ → +thu → −chi → +hoàn → −phí → cuối kỳ (tiền lỏng) */
export async function waterfallData(ctx: SwCtx, month: string) {
  const accs = await ctx.db.select().from(swAccounts).where(own(swAccounts, ctx));
  const liquidIds = accs.filter((a) => LIQUID_TYPES.includes(a.type)).map((a) => a.id);
  const openingSum = accs.filter((a) => LIQUID_TYPES.includes(a.type))
    .reduce((s, a) => money.add(s, String(a.openingBalance)), '0');
  let startBal = openingSum;
  if (liquidIds.length) {
    const pre = await ctx.db
      .select({ s: sql<string>`COALESCE(SUM(${swLedgerEntries.delta}), 0)::numeric(18,0)::text` })
      .from(swLedgerEntries)
      .where(and(own(swLedgerEntries, ctx), inArray(swLedgerEntries.accountId, liquidIds),
        sql`${swLedgerEntries.occurredAt} < ${month}::date`));
    startBal = money.add(startBal, pre[0]?.s ?? '0');
  }
  const txs = await ctx.db.select().from(swTransactions)
    .where(and(own(swTransactions, ctx), eq(swTransactions.status, 'posted'),
      sql`${swTransactions.occurredAt} >= ${month}::date`,
      sql`${swTransactions.occurredAt} < (${month}::date + interval '1 month')`));
  let income = '0', expense = '0', refund = '0', fee = '0';
  for (const t of txs) {
    const amt = String(t.amount);
    if (t.kind === 'income') income = money.add(income, amt);
    else if (t.kind === 'expense') expense = money.add(expense, amt);
    else if (t.kind === 'refund') refund = money.add(refund, amt);
    else if (t.kind === 'fee') fee = money.add(fee, amt);
  }
  const end = money.sub(money.add(money.add(startBal, income), refund), money.add(expense, fee));
  return {
    steps: [
      { label: 'Đầu kỳ', value: startBal, kind: 'base' },
      { label: 'Thu', value: income, kind: 'up' },
      { label: 'Hoàn tiền', value: refund, kind: 'up' },
      { label: 'Chi', value: money.neg(expense), kind: 'down' },
      { label: 'Phí', value: money.neg(fee), kind: 'down' },
      { label: 'Cuối kỳ (dòng thu-chi)', value: end, kind: 'total' },
    ],
  };
}

/** Heatmap ngày đốt tiền trong tháng: [{day, out}] */
export async function heatmapData(ctx: SwCtx, month: string) {
  const rows = await ctx.db.select().from(swSnapshotsDaily)
    .where(and(own(swSnapshotsDaily, ctx),
      gte(swSnapshotsDaily.day, month),
      sql`${swSnapshotsDaily.day} < (${month}::date + interval '1 month')`));
  const byDay = new Map<string, string>();
  for (const r of rows) {
    const d = String(r.day);
    byDay.set(d, money.add(byDay.get(d) ?? '0', String(r.cashOut)));
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([day, out]) => ({ day, out }));
}

/** Trend thu-chi-ròng theo tháng từ summary */
export async function trendData(ctx: SwCtx, from?: string, to?: string) {
  const conds = [own(swMonthlySummary, ctx)];
  if (from) conds.push(gte(swMonthlySummary.month, from));
  if (to) conds.push(lte(swMonthlySummary.month, to));
  const rows = await ctx.db.select().from(swMonthlySummary)
    .where(and(...conds)).orderBy(swMonthlySummary.month);
  return rows.map((r) => ({
    month: String(r.month), income: String(r.income), expense: String(r.expense),
    net: money.sub(String(r.income), String(r.expense)),
  }));
}
