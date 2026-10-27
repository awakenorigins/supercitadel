/**
 * SOUL-INVENTORY v1.1 — Smoke test phần mở rộng
 * Cover: lot/serial/expiry flow, LOT_REQUIRED guard, weighted avg cost,
 * expiry alerts, stock card, summary, backfill legacy migration.
 * Chạy trên PGlite + role non-superuser (RLS thật).
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { EventBus, KhoCtx, KhoEventPayload } from '../src/types.js';
import { KhoError } from '../src/types.js';
import { getKhoTool, khoReadTools, khoWriteActions } from '../src/tools/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));
let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, String(actual) === String(expected), `(actual=${actual}, expected=${expected})`);
}

const events: Array<{ name: string; payload: KhoEventPayload }> = [];
const bus: EventBus = { emit: (n, p) => { events.push({ name: n, payload: p }); } };

async function main() {
  console.log('— SOUL-INVENTORY v1.1 SMOKE — Postgres in-process —');
  const client = new PGlite();
  const db = drizzle(client);

  // Giả lập hệ CŨ: bảng inventory_items legacy có sẵn data (test backfill)
  await client.exec(`
    CREATE TABLE inventory_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      sku text, name text NOT NULL, unit text,
      qty integer NOT NULL DEFAULT 0,
      low_threshold integer
    );
  `);
  const ORG_LEGACY = randomUUID();
  await client.exec(`
    INSERT INTO inventory_items (org_id, sku, name, unit, qty, low_threshold) VALUES
    ('${ORG_LEGACY}', 'CU-01', 'Hàng cũ 01', 'cái', 42, 5),
    ('${ORG_LEGACY}', NULL, 'Hàng cũ không SKU', NULL, 7, NULL),
    ('${ORG_LEGACY}', 'CU-02', 'Hàng cũ hết tồn', 'cái', 0, NULL);
  `);

  for (const f of ['0000_init.sql', '0001_rls.sql', '0002_backfill_legacy.sql', '0003_v2_final.sql', '0004_v2_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }

  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);

  const ORG = randomUUID();
  const USER = randomUUID();

  async function withTenant<T>(orgId: string, fn: (ctx: KhoCtx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      return fn({ db: tx as unknown as KhoCtx['db'], orgId, userId: USER, bus });
    });
  }
  async function run(orgId: string, name: string, input: unknown) {
    const t = getKhoTool(name);
    if (!t) throw new Error(`tool missing: ${name}`);
    const res = await withTenant(orgId, (ctx) => t.handler(ctx, input));
    // v2.0: write actions trả {ok, message, data} — unwrap cho test đọc field trực tiếp
    if (res && typeof res === 'object' && 'ok' in res && 'data' in res) {
      return (res as { data: unknown }).data;
    }
    return res;
  }

  // ── A. BACKFILL LEGACY ──
  console.log('\n— A. Backfill từ inventory_items cũ —');
  const legacy = await withTenant(ORG_LEGACY, (ctx) =>
    ctx.db.execute(sql`SELECT sku, name FROM kho_items ORDER BY sku`));
  const lrows = (('rows' in legacy ? (legacy as any).rows : legacy) as Array<{ sku: string; name: string }>);
  eq('backfill: 3 item cũ → kho_items', lrows.length, 3);
  check('backfill: item không SKU nhận LEGACY-*', lrows.some(r => r.sku.startsWith('LEGACY-')));
  const legacyStock = await run(ORG_LEGACY, 'kho.stock.query', { sku: 'CU-01' }) as Array<Record<string, string>>;
  eq('backfill: CU-01 tồn 42', Number(legacyStock[0]?.stocked), 42);
  const legacyCard = await run(ORG_LEGACY, 'kho.report.stock_card', { sku: 'CU-01' }) as { card: unknown[] };
  eq('backfill: có movement initial backfill', legacyCard.card.length, 1);
  // idempotent: chạy lại 0002 không nhân đôi
  await client.exec(await readFile(join(__dir, '..', 'migrations', '0002_backfill_legacy.sql'), 'utf8'));
  const legacy2 = await run(ORG_LEGACY, 'kho.stock.query', { sku: 'CU-01' }) as Array<Record<string, string>>;
  eq('backfill idempotent: tồn vẫn 42 sau khi chạy lại', Number(legacy2[0]?.stocked), 42);

  // ── B. LOT / SERIAL / EXPIRY ──
  console.log('\n— B. Lot / Serial / Expiry —');
  await run(ORG, 'kho.item.upsert', {
    sku: 'SUA-VNM', name: 'Sữa tươi Vinamilk 1L', unit: 'hộp',
    min_stock: '20', track_lot: true,
  });
  // nhập không lot → phải LOT_REQUIRED
  try {
    await run(ORG, 'kho.stock.receive', { sku: 'SUA-VNM', quantity: '50' });
    check('receive thiếu lot khi track_lot → phải chặn', false);
  } catch (e) {
    check('receive thiếu lot → KhoError LOT_REQUIRED',
      e instanceof KhoError && e.code === 'LOT_REQUIRED');
  }
  // nhập 2 lô khác hạn
  const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const far = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const r1 = await run(ORG, 'kho.stock.receive', {
    sku: 'SUA-VNM', quantity: '60', unit_cost: '25000',
    lot_no: 'LOT-A', expiry_date: soon,
  }) as Record<string, string>;
  eq('nhập LOT-A 60 hộp', Number(r1.stocked), 60);
  await run(ORG, 'kho.stock.receive', {
    sku: 'SUA-VNM', quantity: '40', unit_cost: '27000',
    lot_no: 'LOT-B', expiry_date: far,
  });
  const q1 = await run(ORG, 'kho.stock.query', { sku: 'SUA-VNM' }) as Array<Record<string, string>>;
  const totalAvail = q1.reduce((s, r) => s + Number(r.available), 0);
  eq('tổng khả dụng 2 lô = 100', totalAvail, 100);

  // weighted avg cost: (60×25000 + 40×27000) / 100 = 25800
  const itemRow = await withTenant(ORG, (ctx) =>
    ctx.db.execute(sql`SELECT avg_cost FROM kho_items WHERE sku = 'SUA-VNM'`));
  const avg = ((('rows' in itemRow ? (itemRow as any).rows : itemRow) as Array<{ avg_cost: string }>)[0]).avg_cost;
  eq('avg_cost bình quân gia quyền = 25800.00', avg, '25800.00');

  // xuất theo lot: LOT-A 30 hộp
  const i1 = await run(ORG, 'kho.stock.issue', {
    sku: 'SUA-VNM', quantity: '30', lot_no: 'LOT-A',
  }) as Record<string, string>;
  eq('xuất LOT-A 30 → lot còn 30', Number(i1.stocked), 30);
  // xuất lot không tồn tại
  try {
    await run(ORG, 'kho.stock.issue', { sku: 'SUA-VNM', quantity: '1', lot_no: 'LOT-X' });
    check('xuất lot không tồn tại → phải chặn', false);
  } catch (e) {
    check('xuất lot lạ → LOT_NOT_FOUND', e instanceof KhoError && e.code === 'LOT_NOT_FOUND');
  }

  // expiry alerts trong 30 ngày → chỉ LOT-A
  const exp = await run(ORG, 'kho.lot.expiry_alerts', { within_days: 30 }) as Array<Record<string, unknown>>;
  eq('expiry_alerts 30 ngày: 1 lô (LOT-A)', exp.length, 1);
  eq('  lô đúng là LOT-A', exp[0]?.lot_no, 'LOT-A');
  eq('  lô LOT-A còn 30', Number(exp[0]?.stocked), 30);

  // serial tracking
  await run(ORG, 'kho.item.upsert', {
    sku: 'TIVI-SS55', name: 'Tivi Samsung 55"', unit: 'cái', track_serial: true,
  });
  await run(ORG, 'kho.stock.receive', { sku: 'TIVI-SS55', quantity: '1', serial_no: 'SN-001' });
  await run(ORG, 'kho.stock.receive', { sku: 'TIVI-SS55', quantity: '1', serial_no: 'SN-002' });
  const qtv = await run(ORG, 'kho.stock.query', { sku: 'TIVI-SS55' }) as Array<Record<string, string>>;
  eq('serial: 2 serial = 2 dòng level', qtv.length, 2);
  await run(ORG, 'kho.stock.issue', { sku: 'TIVI-SS55', quantity: '1', serial_no: 'SN-001' });
  const card = await run(ORG, 'kho.report.stock_card', { sku: 'TIVI-SS55' }) as {
    totals: Record<string, string>;
  };
  eq('thẻ kho tivi: tổng nhập 2', Number(card.totals.total_in), 2);
  eq('thẻ kho tivi: tổng xuất 1', Number(card.totals.total_out), 1);
  eq('thẻ kho tivi: số dư 1', Number(card.totals.balance), 1);

  // ── C. SUMMARY ──
  console.log('\n— C. Summary —');
  const sum = await run(ORG, 'kho.report.summary', {}) as Record<string, string>;
  eq('summary: 2 mặt hàng', sum.items, '2');
  check('summary: có estimated_value > 0', Number(sum.estimated_value) > 0, sum.estimated_value);
  check('summary: active_lots ≥ 3 (LOT-A, LOT-B, 2 serial)', Number(sum.active_lots) >= 3, sum.active_lots);

  // ── D. TÁCH READ/WRITE ──
  console.log('\n— D. Read tools / Write actions —');
  eq('13 read tools', khoReadTools.length, 13);
  eq('16 write actions', khoWriteActions.length, 16);
  check('read đều kind=tool', khoReadTools.every(t => t.kind === 'tool'));
  check('write đều kind=action', khoWriteActions.every(t => t.kind === 'action'));

  // ── E. EVENT PAYLOAD ──
  check('mọi event mang org_id', events.every(e => typeof e.payload.org_id === 'string'));
  check('có event kho.lot.created', events.some(e => e.name === 'kho.lot.created'));

  console.log(`\n════════ SOUL-INVENTORY v1.1: ${passed} pass / ${failed} fail ════════`);
  await client.close();
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
