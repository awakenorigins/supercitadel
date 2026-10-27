/**
 * QLDN V1A — F7.5 TEST: scheduler auto-run mùng 1.
 * Kiểm: periodCodesFor, runMonthlyAutomation (tạo kỳ + calculate kỳ trước,
 * KHÔNG auto-approve), idempotent, điều kiện skip, event autorun_completed,
 * tick gate (chỉ chạy đúng ngày/giờ, 1 lần/ngày).
 * Chạy: npx tsx server/qldn.scheduler.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { periodCodesFor, runMonthlyAutomation, startQldnMonthlyAutomation } from './scheduler.js';
import { parseOfficialWorkbook, parseInternalWorkbook, importEmployees } from './import.js';
import { parseOfficialBcc, importBcc } from './timesheet.js';
import { createPolicyParams, createPeriod } from './service.js';
import { getRun } from './payroll.js';

let passed = 0, failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const fx = (f: string) => readFileSync(join(here, '..', 'tests', 'fixtures', f));

  console.log('=== F7.5: periodCodesFor ===');
  const j = periodCodesFor(new Date('2026-07-01T07:00:00Z'));
  check(j.current === '2026-07' && j.previous === '2026-06', 'Tháng 7 → current 2026-07, previous 2026-06');
  const jan = periodCodesFor(new Date('2026-01-01T07:00:00Z'));
  check(jan.current === '2026-01' && jan.previous === '2025-12', 'Tháng 1 → previous 2025-12 (qua năm)');

  const pg = new PGlite();
  await pg.exec(readFileSync(join(here, '..', 'migrations', '0000_init.sql'), 'utf8'));
  const db = drizzle(pg) as any;
  const orgA = randomUUID();

  // Outbox table cho emitEvent
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

  console.log('=== F7.5: điều kiện skip ===');
  const now = new Date('2026-07-01T07:00:00Z');
  let r = await runMonthlyAutomation(db, orgA, now);
  check(r.periodCreated === '2026-07', 'Auto tạo kỳ mới 2026-07');
  check(r.runCreated === null && !!r.skippedReason?.includes('Chưa có kỳ 2026-06'), 'Skip: chưa có kỳ trước', String(r.skippedReason));

  // Seed dữ liệu thật cho kỳ 2026-06 — tạo kỳ trước để test điều kiện BCC riêng
  const official = parseOfficialWorkbook(fx('bang-luong-t06.xlsx'));
  const internal = parseInternalWorkbook(fx('luongnb-t06.xls'));
  await importEmployees(db, orgA, { official, internal, effectiveFrom: '2026-06-01' });
  await createPeriod(db, orgA, { code: '2026-06' });
  r = await runMonthlyAutomation(db, orgA, now);
  check(!!r.skippedReason?.includes('chưa có chấm công'), 'Skip: kỳ trước chưa có BCC', String(r.skippedReason));

  await importBcc(db, orgA, parseOfficialBcc(fx('bang-luong-t06.xlsx')));
  r = await runMonthlyAutomation(db, orgA, now);
  check(!!r.skippedReason?.includes('policy_params'), 'Skip: chưa có policy', String(r.skippedReason));

  console.log('=== F7.5: auto-run đủ điều kiện ===');
  await createPolicyParams(db, orgA, { effectiveFrom: '2026-01-01' });
  r = await runMonthlyAutomation(db, orgA, now);
  check(!!r.runCreated && r.calculated?.lines === 40, `Auto tạo run + calculate 40 dòng`, JSON.stringify(r));
  const run = await getRun(db, orgA, r.runCreated!);
  check(run.status === 'calculated', 'Run dừng ở CALCULATED — KHÔNG auto-approve (người thật duyệt)');
  check(run.note?.includes('Auto-run'), 'Note ghi rõ auto-run scheduler');

  const evts = await db.select().from(outboxEvents);
  const autoEvt = evts.find((e: any) => e.topic === 'qldn.payroll.autorun_completed');
  check(!!autoEvt && (autoEvt.payload as any).lines === 40, 'Emit qldn.payroll.autorun_completed (40 NV, chờ duyệt)');

  console.log('=== F7.5: idempotent ===');
  const r2 = await runMonthlyAutomation(db, orgA, now);
  check(r2.runCreated === null && !!r2.skippedReason?.includes('đã có bảng lương'), 'Chạy lại: không tạo run trùng', String(r2.skippedReason));

  console.log('=== F7.5: tick gate (đúng ngày/giờ mới chạy) ===');
  const orgB = randomUUID();
  let calls = 0;
  const handle = startQldnMonthlyAutomation(db, async () => { calls++; return [orgB]; }, { dayOfMonth: 15, hour: 23 });
  await handle.tick(); // hôm nay không phải ngày 15 23h UTC (xác suất cực thấp) → không gọi listActiveOrgIds
  const nowReal = new Date();
  const wouldFire = nowReal.getUTCDate() === 15 && nowReal.getUTCHours() === 23;
  check(wouldFire ? calls === 1 : calls === 0, 'Tick ngoài khung giờ → không chạy', `calls=${calls}`);
  handle.stop();

  console.log('=== F7.5: tenant isolation ===');
  const rB = await runMonthlyAutomation(db, orgB, now);
  check(rB.runCreated === null, 'Org B trống: chỉ tạo kỳ, không đụng dữ liệu org A');

  console.log(`\n   KẾT QUẢ F7.5 SCHEDULER: ${passed} PASS, ${failed} FAIL`);
  await pg.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('[F7.5-SCHEDULER]', e); process.exit(1); });
