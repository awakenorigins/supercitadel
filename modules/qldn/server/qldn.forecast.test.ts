/**
 * QLDN V1A — F7 TEST: forecast dòng tiền + outbox events.
 * Golden: file DU_BAO_THU__CHI_CONG_NO.xlsx thật (400 dòng) — running balance
 * engine tính lại phải khớp cột "Tồn" Excel từng dòng + tổng thu/chi khớp dòng cuối.
 * Outbox: approve run → emit qldn.payroll.approved (334/338/3335), payout → qldn.payout.created.
 * Chạy: npx tsx server/qldn.forecast.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { parseForecastWorkbook, importForecast, forecastView, createForecastLine, settleForecastLine } from './forecast.js';
import { parseOfficialWorkbook, parseInternalWorkbook, importEmployees } from './import.js';
import { parseOfficialBcc, importBcc } from './timesheet.js';
import { createPayrollRun, calculateRun } from './payroll.js';
import { approveRun, createPayoutBatch } from './payout.js';
import { createPolicyParams } from './service.js';

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const fx = (f: string) => readFileSync(join(here, '..', 'tests', 'fixtures', f));

  console.log('=== F7: parse file dự báo thật (400 dòng) ===');
  const parsed = parseForecastWorkbook(fx('du-bao.xlsx'));
  check(parsed.openingBalance === 1_588_806_690, 'Opening: tồn quỹ 1.588.806.690', String(parsed.openingBalance));
  check(parsed.asOf === '2026-07-14', 'asOf 14/7/2026', String(parsed.asOf));
  // Excel ghi "Số dòng = 400" = 399 dòng chứng từ + 1 dòng tồn quỹ đầu (verify: tổng thu/chi khớp tuyệt đối)
  check(parsed.rows.length === 399, `Parse đủ 399 dòng chứng từ (+1 opening = 400 theo Excel)`, String(parsed.rows.length));
  check(parsed.totals.inflow === 49_130_873_793, 'Tổng THU khớp dòng tổng Excel: 49.130.873.793', String(parsed.totals.inflow));
  check(parsed.totals.outflow === 5_029_837_783, 'Tổng CHI khớp dòng tổng Excel: 5.029.837.783', String(parsed.totals.outflow));

  console.log('=== F7: GOLDEN running balance — khớp cột Tồn từng dòng ===');
  let bal = parsed.openingBalance, mismatch = 0, firstMis = '';
  for (const r of parsed.rows) {
    bal += r.inflow - r.outflow;
    if (Math.abs(bal - r.excelBalance) > 1) {
      mismatch++;
      if (!firstMis) firstMis = `${r.docNo} ${r.dueDate}: engine=${bal} excel=${r.excelBalance}`;
    }
  }
  check(mismatch === 0, `Running balance khớp 399/399 dòng với cột Tồn Excel`, firstMis);
  check(bal === 45_689_842_700, `Tồn cuối kỳ: ${bal.toLocaleString('vi')}`, String(bal));

  console.log('=== F7: phân loại chứng từ ===');
  const opn = parsed.rows.filter((r) => r.docType === 'OPN').length;
  const ar = parsed.rows.filter((r) => r.docType === 'AR').length;
  const ap = parsed.rows.filter((r) => r.docType === 'AP').length;
  check(opn + ar + ap === 399, `OPN ${opn} + AR ${ar} + AP ${ap} = 399`);
  const jp = parsed.rows.filter((r) => /^JP\d/.test(r.docNo));
  check(jp.length > 0 && jp.every((r) => r.docType === 'AR' || r.outflow > 0), `Đơn JP (${jp.length}) nhận diện AR`);

  console.log('=== F7: import DB + forecastView roll ===');
  const pg = new PGlite();
  await pg.exec(readFileSync(join(here, '..', 'migrations', '0000_init.sql'), 'utf8'));
  const db = drizzle(pg) as any;
  const orgA = randomUUID();
  const res = await importForecast(db, orgA, parsed);
  check(res.created === 400, 'Import 400 dòng (399 + OPENING)', String(res.created));
  const view = await forecastView(db, orgA);
  check(view.openingBalance === 1_588_806_690, 'View: opening đúng');
  check(view.closingBalance === 45_689_842_700, 'View: closing = tồn cuối Excel', String(view.closingBalance));
  check(view.lines.length === 400, 'View: đủ 400 dòng roll');
  // Re-import idempotent (replace-all cho source excel-import)
  const res2 = await importForecast(db, orgA, parsed);
  const view2 = await forecastView(db, orgA);
  check(res2.created === 400 && view2.lines.length === 400, 'Re-import: replace-all, không nhân đôi');

  // Thêm dòng tay + settle
  const manual = await createForecastLine(db, orgA, { dueDate: '2026-08-01', description: 'Chi lương T07', outflow: 400_000_000 });
  const view3 = await forecastView(db, orgA);
  check(view3.closingBalance === 45_689_842_700 - 400_000_000, 'Dòng tay trừ vào closing');
  await settleForecastLine(db, orgA, manual.id);
  const view4 = await forecastView(db, orgA);
  check(view4.closingBalance === 45_689_842_700, 'Settle → dòng rời khỏi sổ dự báo');

  console.log('=== F7: outbox events (payroll.approved + payout.created) ===');
  // Dựng outbox table giả lập theo contract core (globalThis registry)
  await pg.exec(`CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL, topic TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { pgTable, uuid: uuidCol, text, jsonb, timestamp } = await import('drizzle-orm/pg-core');
  const outboxEvents = pgTable('outbox_events', {
    id: uuidCol('id').defaultRandom().primaryKey(),
    orgId: uuidCol('org_id').notNull(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  });
  (globalThis as any).__citadelOutboxEventsTable = outboxEvents;
  (globalThis as any).__citadelOutboxEnabled = true;

  // Full-flow: import NV + BCC → run → calculate → approve → kiểm event
  const official = parseOfficialWorkbook(fx('bang-luong-t06.xlsx'));
  const internal = parseInternalWorkbook(fx('luongnb-t06.xls'));
  await importEmployees(db, orgA, { official, internal, effectiveFrom: '2026-06-01' });
  await createPolicyParams(db, orgA, { effectiveFrom: '2026-01-01' });
  await importBcc(db, orgA, parseOfficialBcc(fx('bang-luong-t06.xlsx')));
  const run = await createPayrollRun(db, orgA, { period: '2026-06', scheme: 'OFFICIAL' });
  await calculateRun(db, orgA, run.id);
  const userId = randomUUID();
  await approveRun(db, orgA, run.id, userId);

  const evts = await db.select().from(outboxEvents);
  const approvedEvt = evts.find((e: any) => e.topic === 'qldn.payroll.approved');
  check(!!approvedEvt, 'Approve → emit qldn.payroll.approved trong transaction');
  const p: any = approvedEvt.payload;
  check(p.totals.lines === 40 && p.totals.netPay > 400_000_000, `Payload totals: ${p.totals.lines} dòng, net ${Number(p.totals.netPay).toLocaleString('vi')}`);
  const e334 = p.suggestedEntries.find((x: any) => x.account === '334');
  const e338 = p.suggestedEntries.find((x: any) => x.account === '338');
  const e3335 = p.suggestedEntries.find((x: any) => x.account === '3335');
  check(!!e334 && !!e338 && !!e3335, 'suggestedEntries đủ 334/338/3335 cho k10a');
  check(e334.amount === p.totals.netPay && e3335.amount === p.totals.pit, 'Số tiền bút toán khớp totals');

  await createPayoutBatch(db, orgA, { runId: run.id }, userId);
  const evts2 = await db.select().from(outboxEvents);
  const payoutEvt = evts2.find((e: any) => e.topic === 'qldn.payout.created');
  check(!!payoutEvt && (payoutEvt.payload as any).lines === 40, 'Payout → emit qldn.payout.created (40 dòng)');

  console.log('=== F7: tenant isolation ===');
  const orgB = randomUUID();
  const viewB = await forecastView(db, orgB);
  check(viewB.lines.length === 0 && viewB.closingBalance === 0, 'Org B: sổ dự báo trống');

  console.log(`\n   KẾT QUẢ F7 FORECAST: ${passed} PASS, ${failed} FAIL`);
  await pg.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('[F7-FORECAST]', e); process.exit(1); });
