/**
 * SOUL-WALLET 1A — SMOKE IMPORT + REPORTS (Beat 8–9)
 * · Import xlsx preset VCB: parse, dup-hash (trong file + giữa các phiên),
 *   preview → commit → số dư đúng; re-import → skip sạch
 * · Reconcile: lệch → adjust đúng dấu; khớp → RECONCILE_NO_DIFF
 * · INVARIANT: rebuild full == snapshot ranged (nguồn chân lý là ledger)
 * · 8 báo cáo trả đúng shape + narrate tiếng Việt
 * · Charts: donut/candles/waterfall/heatmap/trend · Export CSV + XLSX round-trip
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import type { EventBus, SwCtx, SwEventPayload } from '../src/types.js';
import { SwError, isoMonth, isoDay, money } from '../src/types.js';
import { seedDefaultCategories, listCategories } from '../src/services/catalog.service.js';
import { createAccount } from '../src/services/account.service.js';
import { createTx } from '../src/services/transaction.service.js';
import { accountBalance } from '../src/services/ledger.service.js';
import { upsertRule } from '../src/services/rule.service.js';
import { createImport, previewImport, commitImport, reconcileAccount, exportLedgerCsv, exportMonthlyReportXlsx, parseStatement } from '../src/services/import.service.js';
import { rebuildAllSnapshots, candlesData, donutData, waterfallData, heatmapData, trendData } from '../src/services/analytics.service.js';
import { executiveSummary, cashflowReport, expenseReport, incomeReport, budgetReport, debtReport, networthReport, recurringReport, narrateExecutive } from '../src/services/reports.service.js';
import { sixJarsApply } from '../src/services/budget.service.js';
import { createDebt } from '../src/services/debt.service.js';
import { upsertRecurring } from '../src/services/recurring.service.js';
import { swSnapshotsDaily } from '../src/db/schema.js';

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

/** Dựng sao kê VCB giả bằng xlsx → base64 */
function makeVcbStatement(rows: Array<[string, string, string, string, string]>): string {
  const grid: unknown[][] = [
    ['NGÂN HÀNG TMCP NGOẠI THƯƠNG VIỆT NAM'],
    ['SAO KÊ TÀI KHOẢN'],
    [],
    ['Ngày giao dịch', 'Số tham chiếu', 'Số tiền ghi nợ', 'Số tiền ghi có', 'Nội dung chi tiết'],
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(grid);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SaoKe');
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

async function main() {
  console.log('— SOUL-WALLET SMOKE IMPORT + REPORTS —');
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
  const cats = await t((c) => listCategories(c));
  const bank = await t((c) => createAccount(c, { name: 'VCB', type: 'bank', opening_balance: '10000000' } as never));
  const cash = await t((c) => createAccount(c, { name: 'Tiền mặt', type: 'cash', opening_balance: '2000000' } as never));

  // rule để import gợi ý danh mục
  await t((c) => upsertRule(c, {
    name: 'Grab → Di chuyển', priority: 10,
    match: { memo_contains: 'grab' },
    set_fields: { category_id: cats.find((x) => x.name === 'Grab/Taxi')!.id },
    active: true,
  } as never));

  // ============================================================
  console.log('\n— A. IMPORT PRESET VCB —');
  // ============================================================
  // 5 dòng: 3 hợp lệ, 1 TRÙNG trong file, 1 lỗi ngày
  const b64 = makeVcbStatement([
    ['01/07/2026', 'FT001', '', '15.000.000', 'LUONG THANG 7 CTY ABC'],
    ['02/07/2026', 'FT002', '85.000', '', 'GRAB *TRIP SANG'],
    ['03/07/2026', 'FT003', '1.200.000', '', 'THANH TOAN SERVER DO'],
    ['02/07/2026', 'FT002', '85.000', '', 'GRAB *TRIP SANG'],
    ['ngày hỏng', 'FTX', '9.999', '', 'DONG RAC'],
  ]);
  const job1 = await t((c) => createImport(c, {
    file_name: 'saoke-vcb-072026.xlsx', preset: 'vcb', account_id: bank.id, content_base64: b64,
  } as never));
  eq('1. tổng 5 dòng', job1.total, 5);
  eq('2. 3 dòng sẵn sàng', job1.ready, 3);
  eq('3. 1 dòng trùng trong file', job1.duplicates, 1);
  eq('4. 1 dòng lỗi', job1.errors, 1);

  const pv = await t((c) => previewImport(c, job1.job_id));
  const grabRow = pv.rows.find((r) => (r.parsed as { memo?: string } | null)?.memo?.includes('GRAB') && r.status === 'pending');
  check('5. preview gợi ý danh mục từ rule (Grab)', !!(grabRow?.suggestion as { category_id?: string } | null)?.category_id);

  const balBefore = await t((c) => accountBalance(c, bank.id));
  const cm = await t((c) => commitImport(c, { job_id: job1.job_id, skip_duplicates: true } as never));
  eq('6. commit ghi 3 giao dịch', cm.imported, 3);
  eq('7. skip 2 dòng (trùng + lỗi)', cm.skipped, 2);
  // +15tr −85k −1.2tr = +13.715.000
  eq('8. số dư sau import đúng', await t((c) => accountBalance(c, bank.id)),
    (BigInt(balBefore) + 13715000n).toString());
  check('9. event sw.import.completed', events.some((e) => e.name === 'sw.import.completed'));
  await expectErr('10. commit lần 2 → IMPORT_ALREADY_COMMITTED', 'IMPORT_ALREADY_COMMITTED', () =>
    t((c) => commitImport(c, { job_id: job1.job_id, skip_duplicates: true } as never)));

  // re-import cùng file → dup-hash chặn hết
  const job2 = await t((c) => createImport(c, {
    file_name: 'saoke-vcb-072026-lan2.xlsx', preset: 'vcb', account_id: bank.id, content_base64: b64,
  } as never));
  eq('11. re-import: 0 dòng sẵn sàng (dup-hash liên phiên)', job2.ready, 0);
  eq('12. re-import: 4 dòng trùng', job2.duplicates, 4);

  // parse trực tiếp preset generic (csv)
  const csv = Buffer.from('date,amount,memo\n2026-07-04,-50000,tra phi app\n2026-07-05,200000,ban do cu\n', 'utf8');
  const gen = parseStatement(csv, 'generic');
  eq('13. generic csv parse 2 dòng', gen.rows.filter((r) => r.parsed).length, 2);
  eq('14. amount âm → expense', gen.rows[0]!.parsed!.kind, 'expense');

  // ============================================================
  console.log('\n— B. RECONCILE —');
  // ============================================================
  const derived = await t((c) => accountBalance(c, cash.id));
  const rec = await t((c) => reconcileAccount(c, {
    account_id: cash.id, actual_balance: money.sub(derived, '137000'), note: 'đếm ví thấy hụt',
  } as never));
  eq('15. diff = −137000', rec.diff, '-137000');
  eq('16. số dư sau reconcile = thực tế', await t((c) => accountBalance(c, cash.id)), money.sub(derived, '137000'));
  await expectErr('17. reconcile khớp → RECONCILE_NO_DIFF', 'RECONCILE_NO_DIFF', () =>
    t((c) => reconcileAccount(c, { account_id: cash.id, actual_balance: money.sub(derived, '137000') } as never)));

  // ============================================================
  console.log('\n— C. INVARIANT: rebuild full == snapshot ranged —');
  // ============================================================
  // thêm 1 giao dịch BACKDATE để ép ranged rebuild chạy giữa lịch sử
  await t((c) => createTx(c, {
    kind: 'expense', occurred_at: '2026-07-02T05:00:00Z', account_id: bank.id,
    category_id: cats.find((x) => x.name === 'Ăn uống')!.id, amount: '300000', memo: 'backdate bữa sáng',
  } as never));
  const snapRanged = await t((c) => c.db.select().from(swSnapshotsDaily).where(sql`account_id = ${bank.id}`).orderBy(swSnapshotsDaily.day));
  await t((c) => rebuildAllSnapshots(c));
  const snapFull = await t((c) => c.db.select().from(swSnapshotsDaily).where(sql`account_id = ${bank.id}`).orderBy(swSnapshotsDaily.day));
  eq('18. số ngày snapshot khớp', snapFull.length, snapRanged.length);
  const same = snapFull.every((f, i) => {
    const r = snapRanged[i]!;
    return String(f.day) === String(r.day) && String(f.open) === String(r.open)
      && String(f.high) === String(r.high) && String(f.low) === String(r.low)
      && String(f.close) === String(r.close) && String(f.cashIn) === String(r.cashIn)
      && String(f.cashOut) === String(r.cashOut);
  });
  check('19. OHLC từng ngày identical (ranged == full rebuild)', same);
  const lastClose = String(snapFull[snapFull.length - 1]!.close);
  eq('20. close cuối == số dư derive', lastClose, await t((c) => accountBalance(c, bank.id)));

  // ============================================================
  console.log('\n— D. 8 BÁO CÁO + NARRATE —');
  // ============================================================
  const m = isoMonth(new Date('2026-07-06T00:00:00Z'));
  await t((c) => sixJarsApply(c, { monthly_income: '20000000', period: m } as never));
  await t((c) => createDebt(c, { contact_name: 'Anh B', direction: 'receivable', principal: '5000000', interest_rate: 0, start_date: '2026-06-01', due_date: '2026-06-15' } as never));
  await t((c) => upsertRecurring(c, {
    name: 'Netflix', kind: 'subscription', account_id: bank.id, amount: '260000',
    freq: 'monthly', interval_n: 1, next_run_at: isoDay(new Date(Date.now() + 3 * 86400_000)), auto_post: true, active: true,
  } as never));

  const ex = await t((c) => executiveSummary(c, m));
  check('21. executive có net_worth + runway + aging', !!ex.net_worth && !!ex.runway && !!ex.debt_aging);
  const cf = await t((c) => cashflowReport(c, m));
  eq('22. cashflow waterfall 6 bậc', cf.waterfall.steps.length, 6);
  check('23. cashflow có nến', cf.candles.length >= 1);
  const er = await t((c) => expenseReport(c, m));
  check('24. expense report có donut + movers', er.donut.length >= 1 && Array.isArray(er.movers));
  const ir = await t((c) => incomeReport(c, m));
  check('25. income report total > 0', money.isPos(ir.total));
  const br = await t((c) => budgetReport(c, m));
  eq('26. budget report đủ 6 hũ', br.budgets.length, 6);
  const dr = await t((c) => debtReport(c));
  eq('27. debt report receivable còn 5tr', dr.totals.receivable_remaining, '5000000');
  const nw = await t((c) => networthReport(c, m));
  eq('28. networth series 6 tháng', nw.series.length, 6);
  const rr = await t((c) => recurringReport(c));
  check('29. recurring report thấy Netflix trong 30 ngày', rr.upcoming_30d.some((u) => u.name === 'Netflix'));
  const na = await t((c) => narrateExecutive(c, m));
  check('30. narrate tiếng Việt có số liệu', na.text.includes('Thu') && na.text.includes('đ'));

  // ============================================================
  console.log('\n— E. CHARTS + EXPORT —');
  // ============================================================
  const donut = await t((c) => donutData(c, m, 'expense'));
  check('31. donut expense có mục', donut.length >= 1);
  const candles = await t((c) => candlesData(c, {}));
  check('32. nến portfolio gộp toàn ví', candles.length >= 2);
  const wf = await t((c) => waterfallData(c, m));
  check('33. waterfall cuối kỳ = đầu + thu + hoàn − chi − phí', (() => {
    const s = wf.steps;
    const calc = money.sub(money.add(money.add(String(s[0]!.value), String(s[1]!.value)), String(s[2]!.value)),
      money.add(money.abs(String(s[3]!.value)), money.abs(String(s[4]!.value))));
    return calc === String(s[5]!.value);
  })());
  const hm = await t((c) => heatmapData(c, m));
  check('34. heatmap có ngày đốt tiền', hm.length >= 1);
  const tr = await t((c) => trendData(c));
  check('35. trend có tháng hiện tại', tr.some((x) => x.month === m));

  const csvExp = await t((c) => exportLedgerCsv(c, {}));
  check('36. export CSV > 5 dòng ledger', csvExp.content.split('\n').length > 5);
  const xls = await t((c) => exportMonthlyReportXlsx(c, m));
  const wbBack = XLSX.read(Buffer.from(xls.content_base64, 'base64'), { type: 'buffer' });
  eq('37. export XLSX round-trip 3 sheet', wbBack.SheetNames.length, 3);

  console.log(`\n═══ SMOKE IMPORT+REPORTS: ${passed} passed, ${failed} failed ═══`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
