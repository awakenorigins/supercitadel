/**
 * SOUL-WALLET 1A — SMOKE DISCIPLINE (Beat 4–7)
 * Budget 6 Hũ + rollover · Goals + reached event · Debt + aging 5 bucket +
 * PAYMENT_EXCEEDS_REMAINING · Recurring catch-up + draft + clamp cuối tháng ·
 * Rules engine · Anomaly scan · Forecast runway.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { EventBus, SwCtx, SwEventPayload } from '../src/types.js';
import { SwError, isoMonth, isoDay } from '../src/types.js';
import { seedDefaultCategories, listCategories } from '../src/services/catalog.service.js';
import { createAccount } from '../src/services/account.service.js';
import { createTx, searchTx, postDraft } from '../src/services/transaction.service.js';
import { accountBalance } from '../src/services/ledger.service.js';
import { sixJarsApply, budgetStatus, upsertBudget, createGoal, contributeGoal, goalStatus } from '../src/services/budget.service.js';
import { createDebt, payDebt, listDebts, debtAging, bucketOf, interestAccrued } from '../src/services/debt.service.js';
import { upsertRecurring, runRecurring, upcomingRecurring, advanceDate } from '../src/services/recurring.service.js';
import { upsertRule, applyRules, testRules } from '../src/services/rule.service.js';
import { anomalyScan, forecastRunway } from '../src/services/analytics.service.js';

const __dir = dirname(fileURLToPath(import.meta.url));
let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, String(actual) === String(expected), `(actual=${actual}, expected=${expected})`);
}
async function expectErr(name: string, code: string, fn: () => Promise<unknown>) {
  try { await fn(); check(name, false, '(không ném lỗi)'); }
  catch (e) { check(name, e instanceof SwError && e.code === code, `(nhận ${e instanceof SwError ? e.code : e})`); }
}

const events: Array<{ name: string; payload: SwEventPayload }> = [];
const bus: EventBus = { emit: (n, p) => { events.push({ name: n, payload: p }); } };

async function main() {
  console.log('— SOUL-WALLET SMOKE DISCIPLINE —');
  const client = new PGlite();
  const db = drizzle(client);
  for (const f of ['0000_init.sql', '0001_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }
  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);
  const ORG = randomUUID(); const USER = 'user-from';
  async function t<T>(fn: (ctx: SwCtx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${ORG}, true)`);
      return fn({ db: tx as unknown as SwCtx['db'], orgId: ORG, ownerId: USER, bus });
    });
  }

  await t((c) => seedDefaultCategories(c));
  const cash = await t((c) => createAccount(c, { name: 'Tiền mặt', type: 'cash', opening_balance: '30000000' } as never));
  const cats = await t((c) => listCategories(c));
  const catGiaiTri = cats.find((c) => c.name === 'Giải trí')!;
  const catAn = cats.find((c) => c.name === 'Ăn uống')!;
  const thisMonth = isoMonth(new Date());
  const nowIso = () => new Date().toISOString();

  // ============================================================
  console.log('\n— A. BUDGET 6 HŨ + STATUS + RISK —');
  // ============================================================
  const jars = await t((c) => sixJarsApply(c, { monthly_income: '20000000' } as never));
  eq('1. 6 hũ được tạo', jars.jars.length, 6);
  eq('2. NEC = 55% của 20tr', jars.jars.find((j) => j.jar === 'NEC')!.amount, '11000000');
  eq('3. GIVE = 5% của 20tr', jars.jars.find((j) => j.jar === 'GIVE')!.amount, '1000000');

  await t((c) => createTx(c, {
    kind: 'expense', occurred_at: nowIso(), account_id: cash.id,
    category_id: catGiaiTri.id, amount: '2500000', memo: 'Netflix + game + nhậu',
  } as never));
  const st1 = await t((c) => budgetStatus(c));
  const play = st1.budgets.find((b) => b.jar_code === 'PLAY')!;
  eq('4. PLAY spent = 2.5tr (map Giải trí)', play.spent, '2500000');
  check('5. PLAY exceeded (2.5tr > 2tr)', play.exceeded);
  check('6. event sw.budget.exceeded bắn ra', events.some((e) => e.name === 'sw.budget.exceeded'));
  const nec = st1.budgets.find((b) => b.jar_code === 'NEC')!;
  eq('7. NEC spent = 0 (Giải trí không tính vào NEC)', nec.spent, '0');

  await t((c) => createTx(c, {
    kind: 'expense', occurred_at: nowIso(), account_id: cash.id,
    category_id: catAn.id, amount: '3000000', memo: 'Đi chợ tháng',
  } as never));
  const st2 = await t((c) => budgetStatus(c));
  eq('8. NEC spent = 3tr (Ăn uống → NEC)', st2.budgets.find((b) => b.jar_code === 'NEC')!.spent, '3000000');

  // budget theo danh mục cha gộp cả con
  const bAn = await t((c) => upsertBudget(c, { name: 'NS Ăn uống', amount: '5000000', category_id: catAn.id } as never));
  const catCafe = cats.find((c) => c.name === 'Cà phê')!;
  await t((c) => createTx(c, {
    kind: 'expense', occurred_at: nowIso(), account_id: cash.id,
    category_id: catCafe.id, amount: '400000', memo: 'Cafe',
  } as never));
  const st3 = await t((c) => budgetStatus(c));
  eq('9. budget danh mục cha gộp con: 3tr + 400k', st3.budgets.find((b) => b.id === bAn.id)!.spent, '3400000');

  // ============================================================
  console.log('\n— B. GOALS —');
  // ============================================================
  const goal = await t((c) => createGoal(c, { name: 'Mua MacBook', target: '40000000' } as never));
  const balBefore = await t((c) => accountBalance(c, cash.id));
  const c1 = await t((c) => contributeGoal(c, { goal_id: goal.id, amount: '25000000', from_account_id: cash.id } as never));
  check('10. contribute sinh tx chi từ ví', !!c1.tx_id);
  eq('11. ví bị trừ đúng 25tr', await t((c) => accountBalance(c, cash.id)),
    (BigInt(balBefore) - 25000000n).toString());
  const c2 = await t((c) => contributeGoal(c, { goal_id: goal.id, amount: '15000000' } as never));
  check('12. đạt mục tiêu → reached', c2.reached);
  check('13. event sw.goal.reached', events.some((e) => e.name === 'sw.goal.reached'));
  const gs = await t((c) => goalStatus(c));
  eq('14. goal pct = 100', gs[0]!.pct, 100);

  // ============================================================
  console.log('\n— C. DEBT + AGING —');
  // ============================================================
  const today = isoDay(new Date());
  const d40 = isoDay(new Date(Date.now() - 40 * 86400_000));   // quá hạn 40 ngày
  const d100 = isoDay(new Date(Date.now() - 100 * 86400_000)); // quá hạn 100 ngày
  const debt1 = await t((c) => createDebt(c, {
    contact_name: 'Khách A', direction: 'receivable', principal: '10000000',
    interest_rate: 12, start_date: d100, due_date: d40, account_id: cash.id,
  } as never));
  check('15. cho vay sinh tx dòng tiền ra', !!debt1.cashflow_tx_id);
  await t((c) => createDebt(c, {
    contact_name: 'Anh B', direction: 'receivable', principal: '5000000',
    interest_rate: 0, start_date: d100, due_date: d100,
  } as never));
  await t((c) => createDebt(c, {
    contact_name: 'Ngân hàng X', direction: 'payable', principal: '20000000',
    interest_rate: 0, start_date: d100,
  } as never));

  const pay1 = await t((c) => payDebt(c, { debt_id: debt1.id, amount: '4000000', paid_at: today, account_id: cash.id } as never));
  eq('16. trả 4tr → còn 6tr', pay1.remaining, '6000000');
  await expectErr('17. trả vượt → PAYMENT_EXCEEDS_REMAINING', 'PAYMENT_EXCEEDS_REMAINING', () =>
    t((c) => payDebt(c, { debt_id: debt1.id, amount: '7000000', paid_at: today } as never)));
  const pay2 = await t((c) => payDebt(c, { debt_id: debt1.id, amount: '6000000', paid_at: today } as never));
  check('18. trả hết → settled', pay2.settled);

  // lãi đơn: 10tr × 12%/năm × 100 ngày / 365 = 328_767
  eq('19. lãi đơn tính đúng', interestAccrued('10000000', 12, d100, today), '328767');
  eq('20. bucketOf(40) = 31-60', bucketOf(40), '31-60');
  eq('21. bucketOf(100) = 90+', bucketOf(100), '90+');
  const aging = await t((c) => debtAging(c));
  eq('22. aging receivable 90+ = 5tr (Anh B)', aging.receivable['90+'], '5000000');
  eq('23. payable not_due = 20tr', aging.payable['not_due'], '20000000');
  const openList = await t((c) => listDebts(c, { status: 'open' } as never));
  eq('24. còn 2 khoản open (debt1 đã settled)', openList.length, 2);

  // ============================================================
  console.log('\n— D. RECURRING: catch-up + draft + clamp —');
  // ============================================================
  eq('25. advanceDate clamp: 2026-01-31 +1m → 2026-02-28', advanceDate('2026-01-31', 'monthly', 1), '2026-02-28');
  const back2m = isoDay(new Date(Date.now() - 62 * 86400_000));
  await t((c) => upsertRecurring(c, {
    name: 'Server DigitalOcean', kind: 'subscription', account_id: cash.id,
    category_id: cats.find((x) => x.name === 'Server & AI')!.id,
    amount: '1200000', freq: 'monthly', interval_n: 1,
    next_run_at: back2m, auto_post: true, active: true,
  } as never));
  await t((c) => upsertRecurring(c, {
    name: 'Lương freelance dự án', kind: 'income', account_id: cash.id,
    amount: '8000000', freq: 'monthly', interval_n: 1,
    next_run_at: today, auto_post: false, active: true,
  } as never));
  const run = await t((c) => runRecurring(c));
  check('26. catch-up ≥ 3 kỳ subscription (62 ngày)', run.posted >= 3, `(posted=${run.posted})`);
  eq('27. income sinh 1 draft chờ duyệt', run.drafts, 1);
  check('28. event sw.recurring.posted', events.some((e) => e.name === 'sw.recurring.posted'));
  const drafts = await t((c) => searchTx(c, { status: 'draft', limit: 10 } as never));
  eq('29. có đúng 1 draft trong sổ', drafts.length, 1);
  const balBeforePost = await t((c) => accountBalance(c, cash.id));
  await t((c) => postDraft(c, drafts[0]!.id));
  eq('30. duyệt draft → ví cộng 8tr', await t((c) => accountBalance(c, cash.id)),
    (BigInt(balBeforePost) + 8000000n).toString());
  const run2 = await t((c) => runRecurring(c));
  eq('31. chạy lại không double-post', run2.posted + run2.drafts, 0);
  const up = await t((c) => upcomingRecurring(c, 35));
  check('32. upcoming 35 ngày thấy ≥1 khoản', up.length >= 1);

  // ============================================================
  console.log('\n— E. RULES ENGINE —');
  // ============================================================
  await t((c) => upsertRule(c, {
    name: 'Grab → Di chuyển', priority: 10,
    match: { memo_contains: 'grab' },
    set_fields: { category_id: cats.find((x) => x.name === 'Grab/Taxi')!.id },
    active: true,
  } as never));
  await t((c) => upsertRule(c, {
    name: 'Chi to → cần review', priority: 50,
    match: { min_amount: '5000000' },
    set_fields: { category_id: cats.find((x) => x.name === 'Khác (chi)')!.id },
    active: true,
  } as never));
  const hit = await t((c) => applyRules(c, { memo: 'GRAB *TRIP 7h sáng', amount: '85000' }));
  eq('33. rule khớp memo không phân biệt hoa thường', hit?.rule_name, 'Grab → Di chuyển');
  const hit2 = await t((c) => applyRules(c, { memo: 'mua máy', amount: '9000000' }));
  eq('34. rule khoảng tiền khớp', hit2?.rule_name, 'Chi to → cần review');
  await t((c) => createTx(c, {
    kind: 'expense', occurred_at: nowIso(), account_id: cash.id, amount: '85000', memo: 'Grab đi họp',
  } as never));
  const tr = await t((c) => testRules(c, 100));
  check('35. testRules gợi ý phân loại cho tx Grab chưa gắn danh mục', tr.suggestions.some((s) => s.by_rule === 'Grab → Di chuyển'));

  // ============================================================
  console.log('\n— F. ANOMALY + RUNWAY —');
  // ============================================================
  for (let i = 0; i < 10; i++) {
    await t((c) => createTx(c, {
      kind: 'expense', occurred_at: new Date(Date.now() - i * 86400_000).toISOString(),
      account_id: cash.id, category_id: catAn.id, amount: '150000', memo: `Ăn trưa ${i}`,
    } as never));
  }
  await t((c) => createTx(c, {
    kind: 'expense', occurred_at: nowIso(), account_id: cash.id,
    category_id: catAn.id, amount: '30000000', memo: 'Mua đồ khủng',
  } as never));
  const scan = await t((c) => anomalyScan(c, 90));
  check('36. anomaly bắt giao dịch lớn (large_tx)', scan.alerts.some((a) => a.type === 'large_tx'));
  check('37. event sw.anomaly.detected', events.some((e) => e.name === 'sw.anomaly.detected'));

  const rw = await t((c) => forecastRunway(c, 30));
  check('38. runway trả liquid_now + daily_net', typeof rw.liquid_now === 'string' && typeof rw.daily_net_weighted === 'string');
  check('39. runway có projected_end_balance', typeof rw.projected_end_balance === 'string');

  console.log(`\n═══ SMOKE DISCIPLINE: ${passed} passed, ${failed} failed ═══`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
