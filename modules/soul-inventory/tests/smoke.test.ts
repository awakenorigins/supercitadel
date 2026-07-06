/**
 * MODULE KHO — Smoke test trên Postgres THẬT (PGlite in-process)
 *
 * Chứng minh ngưỡng đạt của milestone:
 *   1. ≥5 tools Tiểu Tâm CHẠY THẬT (chạy cả 8, qua handler + Zod, DB thật)
 *   2. RLS có hiệu lực: cross-tenant bị chặn ở tầng database
 *   3. Golden path 7 bước trong docs/GUIDE.md đúng từng con số
 *   4. Event payload luôn mang org_id
 *
 * PGlite user mặc định là superuser (bypass RLS) → test tạo role
 * `citadel_app` KHÔNG superuser và SET ROLE trong mỗi transaction —
 * đúng khuyến cáo vận hành trong GUIDE.md.
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
import { getKhoTool, khoTools } from '../src/tools/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// ---------- test harness ----------
let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, String(actual) === String(expected), `(actual=${actual}, expected=${expected})`);
}

// Bus ghi lại mọi event để audit payload
const events: Array<{ name: string; payload: KhoEventPayload }> = [];
const captureBus: EventBus = { emit: (name, payload) => { events.push({ name, payload }); } };

async function main() {
  console.log('— Khởi tạo Postgres in-process (PGlite) —');
  const client = new PGlite();
  const db = drizzle(client);

  // migrations (multi-statement → chạy qua client.exec)
  for (const f of ['0000_init.sql', '0001_rls.sql', '0003_v2_final.sql', '0004_v2_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }

  // Role app KHÔNG superuser — RLS mới có hiệu lực thật
  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);

  const ORG_A = randomUUID();
  const ORG_B = randomUUID();
  const USER = randomUUID();

  /** Chạy fn trong transaction chuẩn tenant: SET ROLE app + SET LOCAL org */
  async function withTenant<T>(orgId: string, fn: (ctx: KhoCtx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      return fn({ db: tx as unknown as KhoCtx['db'], orgId, userId: USER, bus: captureBus });
    });
  }

  async function runTool(orgId: string, name: string, input: unknown) {
    const tool = getKhoTool(name);
    if (!tool) throw new Error(`Tool không tồn tại: ${name}`);
    const res = await withTenant(orgId, (ctx) => tool.handler(ctx, input));
    // v2.0: write actions trả {ok, message, data} — unwrap cho test đọc field trực tiếp
    if (res && typeof res === 'object' && 'ok' in res && 'data' in res) {
      return (res as { data: unknown }).data;
    }
    return res;
  }

  // ============================================================
  console.log('\n— A. GOLDEN PATH (docs/GUIDE.md §4) — 8 tools chạy thật —');
  // ============================================================

  // 1. Thêm mặt hàng
  const item = await runTool(ORG_A, 'kho.item.upsert',
    { sku: 'GAO-ST25', name: 'Gạo ST25', unit: 'kg', min_stock: '50' }) as { sku: string };
  eq('1. item.upsert tạo GAO-ST25', item.sku, 'GAO-ST25');

  // 2. Nhập 200
  const rcv = await runTool(ORG_A, 'kho.stock.receive',
    { sku: 'GAO-ST25', quantity: '200', unit_cost: '28000', note: 'Lô đầu' }) as Record<string, string>;
  eq('2. receive: stocked = 200', Number(rcv.stocked), 200);
  eq('2. receive: available = 200', Number(rcv.available), 200);

  // 3. Giữ 20
  const rsv = await runTool(ORG_A, 'kho.reservation.manage',
    { action: 'create', sku: 'GAO-ST25', quantity: '20', note: 'Đơn chị Lan' }) as Record<string, string>;
  eq('3. reservation.create: available_after = 180', Number(rsv.available_after), 180);
  check('3. reservation trả về reservation_id', typeof rsv.reservation_id === 'string');

  // 4. Xuất 30
  const iss = await runTool(ORG_A, 'kho.stock.issue',
    { sku: 'GAO-ST25', quantity: '30', note: 'Giao anh Minh' }) as Record<string, string>;
  eq('4. issue: stocked = 170', Number(iss.stocked), 170);
  eq('4. issue: available = 150', Number(iss.available), 150);

  // 5. Fulfill phần đã giữ
  const ful = await runTool(ORG_A, 'kho.reservation.manage',
    { action: 'fulfill', reservation_id: rsv.reservation_id }) as Record<string, string>;
  eq('5. fulfill: stocked_after = 150', Number(ful.stocked_after), 150);
  eq('5. fulfill: status = fulfilled', ful.status, 'fulfilled');

  // 6. Query + low_alerts (chưa dưới định mức)
  const q = await runTool(ORG_A, 'kho.stock.query', { sku: 'GAO-ST25' }) as Array<Record<string, string>>;
  eq('6. query: available = 150', Number(q[0].available), 150);
  const alerts0 = await runTool(ORG_A, 'kho.stock.low_alerts', {}) as unknown[];
  eq('6. low_alerts: chưa có cảnh báo', alerts0.length, 0);

  // 7. Kiểm kê 148 → lệch −2, chốt
  const st = await runTool(ORG_A, 'kho.stocktake.execute',
    { counts: [{ sku: 'GAO-ST25', counted: '148' }], note: 'Cuối tháng' }) as {
      status: string; lines: Array<Record<string, string>>;
      summary: { variance: number };
    };
  eq('7. stocktake: variance = -2', Number(st.lines[0].variance), -2);
  eq('7. stocktake: finalized', st.status, 'finalized');
  const q2 = await runTool(ORG_A, 'kho.stock.query', { sku: 'GAO-ST25' }) as Array<Record<string, string>>;
  eq('7. sau kiểm kê: stocked = 148', Number(q2[0].stocked), 148);

  // 8. Transfer sang kho mới + low_alerts kích hoạt
  await withTenant(ORG_A, async (ctx) => {
    const { upsertLocation } = await import('../src/services/catalog.service.js');
    await upsertLocation(ctx, { code: 'KHO-Q7', name: 'Kho Quận 7', is_default: false });
  });
  const tr = await runTool(ORG_A, 'kho.stock.transfer',
    { sku: 'GAO-ST25', from_location_code: 'KHO-CHINH', to_location_code: 'KHO-Q7', quantity: '100' }) as {
      from: { stocked: string }; to: { stocked: string };
    };
  eq('8. transfer: kho nguồn còn 48', Number(tr.from.stocked), 48);
  eq('8. transfer: kho đích nhận 100', Number(tr.to.stocked), 100);

  const alerts1 = await runTool(ORG_A, 'kho.stock.low_alerts', {}) as Array<Record<string, string>>;
  // tổng khả dụng = 48 + 100 = 148 > 50 → vẫn 0. Xuất bớt để kích cảnh báo:
  await runTool(ORG_A, 'kho.stock.issue', { sku: 'GAO-ST25', quantity: '100', location_code: 'KHO-Q7' });
  await runTool(ORG_A, 'kho.stock.issue', { sku: 'GAO-ST25', quantity: '3', location_code: 'KHO-CHINH' });
  const alerts2 = await runTool(ORG_A, 'kho.stock.low_alerts', {}) as Array<Record<string, string>>;
  eq('8. low_alerts sau khi xuất gần hết: 1 cảnh báo', alerts2.length, 1);
  eq('8. low_alerts available = 45', Number(alerts2[0]?.available), 45);
  check('8. low_alerts có suggest_reorder', Number(alerts2[0]?.suggest_reorder) === 55,
    `(=${alerts2[0]?.suggest_reorder})`);
  void alerts1;

  // ============================================================
  console.log('\n— B. GUARD NGHIỆP VỤ —');
  // ============================================================
  try {
    await runTool(ORG_A, 'kho.stock.issue', { sku: 'GAO-ST25', quantity: '9999' });
    check('issue quá tồn phải bị chặn', false);
  } catch (e) {
    check('issue quá tồn → KhoError INSUFFICIENT_STOCK',
      e instanceof KhoError && e.code === 'INSUFFICIENT_STOCK');
    check('  lỗi kèm details available', e instanceof KhoError && !!e.details?.available);
  }
  try {
    await runTool(ORG_A, 'kho.stock.receive', { sku: 'GAO-ST25', quantity: '-5' });
    check('quantity âm phải bị Zod chặn tại biên', false);
  } catch (e) {
    check('quantity âm → ZodError tại biên (⑦)', (e as { issues?: unknown }).issues !== undefined);
  }

  // ============================================================
  console.log('\n— C. RLS CROSS-TENANT (mặt cắt ④, fail-closed) —');
  // ============================================================
  const qB = await runTool(ORG_B, 'kho.stock.query', { keyword: 'gạo' }) as unknown[];
  eq('Org B query "gạo" → 0 dòng (không thấy dữ liệu Org A)', qB.length, 0);

  try {
    await runTool(ORG_B, 'kho.stock.receive', { sku: 'GAO-ST25', quantity: '10' });
    check('Org B nhập vào SKU của Org A phải fail', false);
  } catch (e) {
    check('Org B receive SKU Org A → ITEM_NOT_FOUND (RLS che khuất)',
      e instanceof KhoError && e.code === 'ITEM_NOT_FOUND');
  }

  // Tấn công trực tiếp bằng SQL (bỏ qua service): update/delete cross-org phải 0 rows
  const upd = await withTenant(ORG_B, (ctx) =>
    ctx.db.execute(sql`UPDATE kho_items SET name = 'HACKED' WHERE sku = 'GAO-ST25'`));
  const affected = (upd as unknown as { rowCount?: number; affectedRows?: number });
  check('UPDATE cross-org qua SQL thô → 0 rows',
    (affected.rowCount ?? affected.affectedRows ?? 0) === 0,
    JSON.stringify(upd).slice(0, 120));

  // Không set org (mô phỏng middleware quên chạy) → fail closed
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT * FROM kho_items`);
    });
    check('Không set app.current_org_id → phải lỗi (fail closed)', false);
  } catch {
    check('Không set app.current_org_id → lỗi (fail closed) ✔', true);
  }

  // Xác nhận dữ liệu Org A còn nguyên tên
  const nameA = await withTenant(ORG_A, (ctx) =>
    ctx.db.execute(sql`SELECT name FROM kho_items WHERE sku = 'GAO-ST25'`));
  const rowsA = (nameA as unknown as { rows?: Array<{ name: string }> }).rows
    ?? (nameA as unknown as Array<{ name: string }>);
  eq('Dữ liệu Org A không bị Org B sửa', rowsA[0]?.name, 'Gạo ST25');

  // ============================================================
  console.log('\n— D. EVENT PAYLOAD —');
  // ============================================================
  check('Đã phát ≥ 10 events', events.length >= 10, `(=${events.length})`);
  check('MỌI event payload đều mang org_id',
    events.every(ev => typeof ev.payload.org_id === 'string' && ev.payload.org_id.length > 0));
  check('Tên event đều prefix "kho."', events.every(ev => ev.name.startsWith('kho.')));
  check('Có event kho.stock.low', events.some(ev => ev.name === 'kho.stock.low'));
  check('Có event kho.stocktake.finalized', events.some(ev => ev.name === 'kho.stocktake.finalized'));

  // ============================================================
  console.log('\n— E. LỊCH SỬ SỔ (ledger) —');
  // ============================================================
  const { movementHistory } = await import('../src/services/stock.service.js');
  const hist = await withTenant(ORG_A, (ctx) => movementHistory(ctx, 'GAO-ST25', 50));
  const types = hist.movements.map(m => m.type);
  check('Ledger đủ loại: receive/issue/reserve_fulfill/adjust/transfer_in/transfer_out',
    ['receive', 'issue', 'reserve_fulfill', 'adjust', 'transfer_in', 'transfer_out']
      .every(t => types.includes(t as never)), types.join(','));

  check(`Toàn bộ định nghĩa tools/actions khai đủ (${khoTools.length} = 13 read + 16 write)`, khoTools.length === 29);

  // ============================================================
  console.log(`\n════════ KẾT QUẢ: ${passed} pass / ${failed} fail ════════`);
  await client.close();
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

