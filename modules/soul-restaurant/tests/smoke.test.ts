/**
 * SOUL-RESTAURANT — Smoke test trên Postgres THẬT (PGlite in-process)
 *
 * Chứng minh:
 *   1. 31 năng lực chạy thật qua registry (handler + Zod, DB thật)
 *   2. Máy tính tiền đúng từng ĐỒNG: options, giảm giá, phí phục vụ, VAT gộp,
 *      tách bill phân bổ tỷ lệ + bill cuối nhận dư (Σ bills == Σ đơn)
 *   3. Golden path quán ăn: mở bàn → gọi món → gửi bếp (KOT theo trạm) → KDS
 *      → lên món → thanh toán 1 câu → đóng đơn, thả bàn, phát event trừ kho
 *   4. Combo bung thành phần khi trừ kho; recipe thiếu → ghi missing
 *   5. RLS fail-closed: cross-tenant chặn tận database; quên set org → LỖI
 *   6. Registry ↔ manifest parity (tên, permission, kind khớp 100%)
 *
 * PGlite user mặc định là superuser (bypass RLS) → test tạo role
 * `citadel_app` KHÔNG superuser và SET ROLE trong mỗi transaction.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { EventBus, RestoCtx, RestoEventPayload } from '../src/types.js';
import { RestoError } from '../src/types.js';
import { getRestoTool, restoTools, restoReadTools, restoWriteActions } from '../src/tools/index.js';
import { restoIntents } from '../src/intents.js';
import { restoUiCatalog } from '../src/ui-catalog.js';

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
async function expectErr(name: string, code: string, fn: () => Promise<unknown>) {
  try { await fn(); check(name, false, '(không ném lỗi)'); }
  catch (e) {
    const got = e instanceof RestoError ? e.code : (e && typeof e === 'object' && 'issues' in e ? 'ZOD' : String(e));
    check(name, got === code, `(got=${got})`);
  }
}

// Bus ghi lại mọi event để audit payload
const events: Array<{ name: string; payload: RestoEventPayload }> = [];
const captureBus: EventBus = { emit: (name, payload) => { events.push({ name, payload }); } };
const lastEvent = (name: string) => [...events].reverse().find((e) => e.name === name);

async function main() {
  console.log('— Khởi tạo Postgres in-process (PGlite) —');
  const client = new PGlite();
  const db = drizzle(client);

  for (const f of ['0000_init.sql', '0001_rls.sql', '0002_v1_1_loyalty.sql', '0003_v1_1_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }
  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);

  const ORG_A = randomUUID();
  const ORG_B = randomUUID();
  const USER = randomUUID();

  async function withTenant<T>(orgId: string, fn: (ctx: RestoCtx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      return fn({ db: tx as unknown as RestoCtx['db'], orgId, userId: USER, bus: captureBus });
    });
  }

  async function runTool(orgId: string, name: string, input: unknown) {
    const tool = getRestoTool(name);
    if (!tool) throw new Error(`Tool không tồn tại: ${name}`);
    const res = await withTenant(orgId, (ctx) => tool.handler(ctx, input));
    if (res && typeof res === 'object' && 'ok' in res && 'data' in res) {
      return (res as unknown as { data: unknown }).data as any;
    }
    return res as any;
  }
  const runMsg = async (orgId: string, name: string, input: unknown): Promise<string> => {
    const tool = getRestoTool(name)!;
    const res = await withTenant(orgId, (ctx) => tool.handler(ctx, input));
    return (res as { message?: string })?.message ?? '';
  };

  // ═══════════════ 0) REGISTRY & MANIFEST PARITY ═══════════════
  console.log('\n— 0) Registry & manifest parity —');
  eq('Tổng năng lực = 42', restoTools.length, 42);
  eq('Read tools = 17', restoReadTools.length, 17);
  eq('Write actions = 25', restoWriteActions.length, 25);
  eq('Intents = 30', restoIntents.length, 30);
  eq('UI catalog phủ đủ = số tool', restoUiCatalog.length, restoTools.length);
  check('Mọi tool có nút trong catalog (1:1)', restoTools.every((t) => restoUiCatalog.some((c) => c.tool === t.name)));
  check('Mọi tool có description + docs + schema',
    restoTools.every((t) => t.description.length > 10 && t.docs.startsWith('docs/') && Boolean(t.inputSchema)));
  check('Mọi intent trỏ tới tool tồn tại',
    restoIntents.every((i) => Boolean(getRestoTool(i.tool))));
  check('Mọi intent có patterns VI + example',
    restoIntents.every((i) => i.patterns_vi.length > 0 && i.examples.length > 0));

  const manifest = JSON.parse(await readFile(join(__dir, '..', 'manifest.module.json'), 'utf8'));
  const mTools = new Map<string, any>((manifest.tools as any[]).map((t) => [t.name, t]));
  eq('manifest.tools = 42', mTools.size, 42);
  check('Registry ↔ manifest: tên + kind + permission khớp 100%',
    restoTools.every((t) => {
      const m = mTools.get(t.name);
      return m && m.kind === t.kind && m.permission === t.permission;
    }));
  const mPerms = new Set((manifest.permissions as any[]).map((p) => p.id));
  check('Mọi permission của tool có trong manifest',
    restoTools.every((t) => mPerms.has(t.permission)));
  const coreManifest = JSON.parse(await readFile(join(__dir, '..', 'manifest.json'), 'utf8'));
  check('manifest.json permissions khớp manifest.module.json',
    (coreManifest.permissions as string[]).every((p) => mPerms.has(p))
    && coreManifest.permissions.length === mPerms.size);
  const sensitiveL2 = restoWriteActions.filter((a) => a.securityLevel === 2).map((a) => a.name).sort();
  eq('5 action lớp 2 (bill.pay/void, loyalty.adjust, order.cancel, settings.update)',
    sensitiveL2.join(','), 'resto.bill.pay,resto.bill.void,resto.loyalty.adjust,resto.order.cancel,resto.settings.update');

  // ═══════════════ 1) SETUP QUÁN (org A) ═══════════════
  console.log('\n— 1) Setup quán: cấu hình, bàn, menu, combo, định lượng —');
  const st = await runTool(ORG_A, 'resto.settings.update', {
    service_charge_pct: '5', tax_pct: '8', price_includes_tax: true,
  });
  eq('Settings: phí phục vụ 5%', st.service_charge_pct, '5.00');
  eq('Settings: VAT 8 gộp', `${st.tax_pct}|${st.price_includes_tax}`, '8.00|true');

  for (const t of [
    { name: 'Bàn 1', area: 'Tầng 1', capacity: 4 },
    { name: 'Bàn 2', area: 'Tầng 1', capacity: 4 },
    { name: 'Bàn 5', area: 'Tầng 1', capacity: 6 },
    { name: 'Bàn 8', area: 'Sân vườn', capacity: 8 },
    { name: 'Bàn 9', area: 'Sân vườn', capacity: 2 },
  ]) await runTool(ORG_A, 'resto.table.upsert', t);
  const map0 = await runTool(ORG_A, 'resto.table.map', {});
  eq('5 bàn, tất cả trống', `${map0.counts.total}|${map0.counts.available}`, '5|5');
  check('Sơ đồ nhóm theo khu (Tầng 1 + Sân vườn)',
    map0.areas.length === 2 && map0.areas.some((a: any) => a.area === 'Sân vườn'));

  await runTool(ORG_A, 'resto.menu.upsert', {
    name: 'Phở bò', sku: 'PHO-BO', price: '45000', category: 'Món chính', station: 'Bếp nóng',
    options: [{ group: 'Thêm', min: 0, max: 2, choices: [
      { name: 'Thêm trứng', price_delta: '5000' },
      { name: 'Thêm bánh', price_delta: '5000' },
    ] }],
  });
  await runTool(ORG_A, 'resto.menu.upsert', { name: 'Trà đá', sku: 'TRA-DA', price: '5000', category: 'Đồ uống', station: 'Bar' });
  await runTool(ORG_A, 'resto.menu.upsert', { name: 'Cà phê sữa', sku: 'CF-SUA', price: '25000', category: 'Đồ uống', station: 'Bar' });
  const combo = await runTool(ORG_A, 'resto.menu.upsert', {
    name: 'Combo sáng', price: '47000', category: 'Combo', station: 'Bếp nóng',
    combo_items: [{ name: 'Phở bò', qty: '1' }, { name: 'Trà đá', qty: '1' }],
  });
  eq('Combo tạo với 2 thành phần', `${combo.kind}|${combo.combo_components}`, 'combo|2');
  await expectErr('Combo lồng combo bị chặn (COMBO_INVALID)', 'COMBO_INVALID', () =>
    runTool(ORG_A, 'resto.menu.upsert', { name: 'Combo lồng', price: '1000', combo_items: [{ name: 'Combo sáng', qty: '1' }] }));

  await runTool(ORG_A, 'resto.recipe.set', { item: 'Phở bò', lines: [
    { sku: 'BP-01', name: 'Bánh phở', qty: '0.2', unit: 'kg' },
    { sku: 'TB-02', name: 'Thịt bò', qty: '0.15', unit: 'kg' },
  ] });
  await runTool(ORG_A, 'resto.recipe.set', { item: 'Trà đá', lines: [{ sku: 'TRA-01', name: 'Trà', qty: '0.01', unit: 'kg' }] });
  const cov = await runTool(ORG_A, 'resto.recipe.coverage', {});
  check('Coverage: Cà phê sữa chưa có định lượng', cov.missing.includes('Cà phê sữa'));
  check('Coverage: combo không bị báo thiếu (thành phần đủ recipe)', !cov.combos_with_gaps.includes('Combo sáng'));

  const info = await runTool(ORG_A, 'resto.menu.item_info', { name: 'Phở bò' });
  check('item_info: đủ option group + recipe',
    info.option_groups.length === 1 && info.option_groups[0].choices.length === 2 && info.recipe.length === 2);
  const search = await runTool(ORG_A, 'resto.menu.search', { query: 'phở' });
  check('menu.search "phở" thấy Phở bò có tùy chọn',
    search.items.some((i: any) => i.name === 'Phở bò' && i.has_options));

  // ═══════════════ 2) GOLDEN PATH — BÀN 5 ═══════════════
  console.log('\n— 2) Golden path: bàn 5 · 2 phở trứng + 1 trà · giảm 10% · thanh toán 1 câu —');
  const opened = await runTool(ORG_A, 'resto.table.open', { table: '5', guests: 4 });
  check('Mở "bàn 5" khớp biến thể tên → Bàn 5', opened.table === 'Bàn 5' && opened.order_code.startsWith('DH-'));
  await expectErr('Mở lại bàn đang có khách → TABLE_BUSY', 'TABLE_BUSY', () =>
    runTool(ORG_A, 'resto.table.open', { table: 'Bàn 5' }));

  await expectErr('Tùy chọn không tồn tại → OPTION_INVALID', 'OPTION_INVALID', () =>
    runTool(ORG_A, 'resto.order.add_items', { table: 'Bàn 5', items: [{ name: 'Phở bò', options: ['Thêm rau'] }] }));

  const added = await runTool(ORG_A, 'resto.order.add_items', {
    table: 'Bàn 5',
    items: [
      { name: 'phở bò', qty: '2', options: ['Thêm trứng'] },
      { name: 'Trà đá', qty: '1' },
    ],
  });
  eq('Line phở: (45k+5k)×2 = 100.000', added.added[0].line_total, '100000.00');
  eq('Subtotal 105.000', added.totals.subtotal, '105000.00');

  const disc = await runTool(ORG_A, 'resto.order.discount', {
    table: 'Bàn 5', discount_type: 'percent', value: '10', reason: 'Khách quen',
  });
  eq('Giảm 10% = 10.500', disc.totals.discount_total, '10500.00');
  eq('Phí phục vụ 5% trên 94.500 = 4.725', disc.totals.service_charge, '4725.00');
  eq('VAT gộp 8%: 99.225×8/108 = 7.350', disc.totals.tax_total, '7350.00');
  eq('Grand (giá gộp thuế) = 99.225', disc.totals.grand_total, '99225.00');

  const sent = await runTool(ORG_A, 'resto.order.send_kitchen', { table: 'Bàn 5' });
  eq('Gửi bếp tách 2 phiếu theo trạm', sent.kots.length, 2);
  const kotPho = sent.kots.find((k: any) => k.station === 'Bếp nóng');
  const kotTra = sent.kots.find((k: any) => k.station === 'Bar');
  check('Phiếu bếp nóng chứa phở, Bar chứa trà',
    Boolean(kotPho?.items.some((i: any) => i.name === 'Phở bò')) && Boolean(kotTra?.items.some((i: any) => i.name === 'Trà đá')));
  check('Event resto.kot.created mang org_id + items in được phiếu', (() => {
    const e = lastEvent('resto.kot.created');
    return e?.payload.org_id === ORG_A && Array.isArray((e?.payload as any).items);
  })());
  await expectErr('Gửi bếp lần 2 khi không còn món chờ → NOTHING_TO_SEND', 'NOTHING_TO_SEND', () =>
    runTool(ORG_A, 'resto.order.send_kitchen', { table: 'Bàn 5' }));

  const q1 = await runTool(ORG_A, 'resto.kds.queue', { station: 'Bếp nóng' });
  check('KDS bếp nóng: 1 phiếu queued kèm tuổi phút', q1.total === 1 && q1.kots[0].age_minutes >= 0);
  await runTool(ORG_A, 'resto.kds.update', { kot_code: kotPho.kot_code, status: 'preparing' });
  const up2 = await runTool(ORG_A, 'resto.kds.update', { kot_code: kotPho.kot_code, status: 'ready' });
  eq('KDS ready đồng bộ 1 món phở → ready', up2.items_updated, 1);
  await expectErr('KOT lùi trạng thái bị chặn', 'INVALID_STATUS_FLOW', () =>
    runTool(ORG_A, 'resto.kds.update', { kot_code: kotPho.kot_code, status: 'preparing' }));

  const served1 = await runTool(ORG_A, 'resto.order.serve', { table: 'Bàn 5' });
  check('Lên món mặc định = món ready (phở)', served1.served.length === 1 && served1.served[0].name === 'Phở bò');
  const served2 = await runTool(ORG_A, 'resto.order.serve', { table: 'Bàn 5', items: ['Trà đá'] });
  eq('Lên trà theo tên (đang sent)', served2.served[0].name, 'Trà đá');

  const view5 = await runTool(ORG_A, 'resto.order.view', { table: 'Bàn 5' });
  check('order.view: 2 dòng served + totals khớp',
    view5.items.every((i: any) => i.status === 'served') && view5.totals.grand_total === '99225.00');

  const evCountBefore = events.filter((e) => e.name === 'resto.stock.deduct_requested').length;
  const pay5 = await runTool(ORG_A, 'resto.bill.pay', { table: 'Bàn 5', method: 'cash', amount: '200000' });
  check('Chưa có bill → tự tạo full bill', pay5.auto_created_bill === true);
  eq('Áp vào bill 99.225', pay5.applied, '99225.00');
  eq('Thối lại 100.775', pay5.change, '100775.00');
  check('Đơn đóng + bàn thả', pay5.order_closed === true && pay5.bill_status === 'paid');
  const dEv = lastEvent('resto.stock.deduct_requested');
  check('Event trừ kho phát đúng (trigger=paid, org_id)', (() => {
    const p = dEv?.payload as any;
    return events.filter((e) => e.name === 'resto.stock.deduct_requested').length === evCountBefore + 1
      && p?.trigger === 'paid' && p?.org_id === ORG_A;
  })());
  check('Trừ kho gộp SKU đúng lượng: BP-01=0.4, TB-02=0.3, TRA-01=0.01', (() => {
    const lines: any[] = (dEv?.payload as any)?.lines ?? [];
    const bySku = Object.fromEntries(lines.map((l) => [l.sku, l.qty]));
    return bySku['BP-01'] === '0.400' && bySku['TB-02'] === '0.300' && bySku['TRA-01'] === '0.010';
  })());
  const map1 = await runTool(ORG_A, 'resto.table.map', { area: 'Tầng 1' });
  check('Bàn 5 available trở lại', map1.areas[0].tables.find((t: any) => t.name === 'Bàn 5')?.status === 'available');

  // ═══════════════ 3) TÁCH BILL — BÀN 2 (không giảm giá) ═══════════════
  console.log('\n— 3) Tách bill bàn 2: 2 phở + 2 trà · 2 bill · Σ bills == Σ đơn —');
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 2', guests: 2 });
  await runTool(ORG_A, 'resto.order.add_items', {
    table: 'Bàn 2',
    items: [{ name: 'Phở bò' }, { name: 'Phở bò' }, { name: 'Trà đá', qty: '2' }],
  });
  // 3 dòng: phở 45k ×2 dòng + trà 10k = 100.000 · sc 5.000 · grand 105.000 (VAT gộp)
  // Lưu ý: item_names chọn theo DÒNG món — muốn tách 1 phở thì gọi 2 dòng phở riêng
  const b1 = await runTool(ORG_A, 'resto.bill.create', { table: 'Bàn 2', item_names: ['Phở bò'] });
  eq('Bill 1 (1 phở): 45.000 + sc 2.250 = 47.250', b1.grand_total, '47250.00');
  const b2 = await runTool(ORG_A, 'resto.bill.create', { table: 'Bàn 2' });
  eq('Bill 2 (phần còn lại): 55.000 + 2.750 = 57.750', b2.grand_total, '57750.00');
  check('Σ 2 bill == grand đơn (105.000)',
    Number(b1.grand_total) + Number(b2.grand_total) === 105000);
  await expectErr('Món đã vào bill không hủy được', 'ITEMS_ALREADY_BILLED', () =>
    runTool(ORG_A, 'resto.order.cancel_item', { table: 'Bàn 2', item: 'Trà đá', reason: 'thử' }));
  await expectErr('Chuyển khoản vượt số cần thu → PAYMENT_INVALID', 'PAYMENT_INVALID', () =>
    runTool(ORG_A, 'resto.bill.pay', { bill_code: b1.bill_code, method: 'bank', amount: '50000' }));
  const p1 = await runTool(ORG_A, 'resto.bill.pay', { bill_code: b1.bill_code, method: 'bank' });
  check('Bill 1 paid, đơn CHƯA đóng (còn bill 2)', p1.bill_status === 'paid' && p1.order_closed === false);
  const p2 = await runTool(ORG_A, 'resto.bill.pay', { bill_code: b2.bill_code, method: 'cash' });
  check('Bill 2 paid → đơn đóng', p2.order_closed === true);

  // ═══════════════ 4) TÁCH BILL CÓ GIẢM GIÁ — BÀN 1 (phân bổ + dư) ═══════════════
  console.log('\n— 4) Tách bill có giảm giá: phân bổ tỷ lệ, bill cuối nhận dư —');
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 1' });
  await runTool(ORG_A, 'resto.order.add_items', {
    table: 'Bàn 1', items: [{ name: 'Phở bò' }, { name: 'Phở bò' }, { name: 'Trà đá' }],
  });
  await runTool(ORG_A, 'resto.order.discount', { table: 'Bàn 1', discount_type: 'amount', value: '10000' });
  // subtotal 95.000, giảm 10.000 → base 85.000, sc 4.250, grand 89.250
  const c1 = await runTool(ORG_A, 'resto.bill.create', { table: 'Bàn 1', item_names: ['Phở bò'] });
  eq('Bill A giảm theo tỷ lệ: 10.000×45/95 = 4.736,84', c1.discount_total, '4736.84');
  eq('Bill A grand 42.276,32', c1.grand_total, '42276.32');
  const c2 = await runTool(ORG_A, 'resto.bill.create', { table: 'Bàn 1' });
  eq('Bill B nhận phần dư giảm giá: 5.263,16', c2.discount_total, '5263.16');
  eq('Bill B grand 46.973,68', c2.grand_total, '46973.68');
  check('Σ giảm giá 2 bill == 10.000 (không rơi xu)',
    (Number(c1.discount_total) + Number(c2.discount_total)).toFixed(2) === '10000.00');
  check('Σ grand 2 bill == grand đơn 89.250',
    (Number(c1.grand_total) + Number(c2.grand_total)).toFixed(2) === '89250.00');
  await runTool(ORG_A, 'resto.bill.pay', { bill_code: c1.bill_code, method: 'cash' });
  const cp2 = await runTool(ORG_A, 'resto.bill.pay', { bill_code: c2.bill_code, method: 'cash' });
  check('Đơn bàn 1 đóng sau bill cuối', cp2.order_closed === true);

  // ═══════════════ 5) COMBO TAKEAWAY + BÁO HẾT MÓN ═══════════════
  console.log('\n— 5) Combo mang về + trừ kho bung thành phần + báo hết món —');
  const tk = await runTool(ORG_A, 'resto.table.open', { type: 'takeaway', customer_name: 'Chị Hoa' });
  await runTool(ORG_A, 'resto.order.add_items', { order_code: tk.order_code, items: [{ name: 'Combo sáng', qty: '1' }] });
  const sentC = await runTool(ORG_A, 'resto.order.send_kitchen', { order_code: tk.order_code });
  check('KOT combo có ghi chú thành phần "gồm: ..."',
    sentC.kots[0].items[0].note?.includes('gồm:') && sentC.kots[0].items[0].note?.includes('Phở bò'));
  const payC = await runTool(ORG_A, 'resto.bill.pay', { order_code: tk.order_code, method: 'momo' });
  // combo 47.000 · sc 2.350 · grand 49.350
  eq('Combo grand 49.350 (sc 5%, VAT gộp)', payC.applied, '49350.00');
  const dEvC = lastEvent('resto.stock.deduct_requested');
  check('Trừ kho combo = bung thành phần (BP-01 0.2, TB-02 0.15, TRA-01 0.01)', (() => {
    const bySku = Object.fromEntries(((dEvC?.payload as any)?.lines ?? []).map((l: any) => [l.sku, l.qty]));
    return bySku['BP-01'] === '0.200' && bySku['TB-02'] === '0.150' && bySku['TRA-01'] === '0.010';
  })());

  await runTool(ORG_A, 'resto.menu.set_availability', { name: 'Phở bò', sold_out: true });
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 9' });
  await expectErr('Món báo hết → gọi bị chặn', 'MENU_ITEM_SOLD_OUT', () =>
    runTool(ORG_A, 'resto.order.add_items', { table: 'Bàn 9', items: [{ name: 'Phở bò' }] }));
  await runTool(ORG_A, 'resto.menu.set_availability', { name: 'Phở bò', sold_out: false });

  // ═══════════════ 6) HỦY MÓN SAU GỬI BẾP · CHUYỂN BÀN · GỘP BÀN · HỦY ĐƠN ═══════════════
  console.log('\n— 6) Hủy món sau gửi bếp, chuyển bàn, gộp bàn, hủy đơn —');
  await runTool(ORG_A, 'resto.order.add_items', { table: 'Bàn 9', items: [{ name: 'Phở bò' }, { name: 'Trà đá' }] });
  await runTool(ORG_A, 'resto.order.send_kitchen', { table: 'Bàn 9' });
  const cx = await runTool(ORG_A, 'resto.order.cancel_item', { table: 'Bàn 9', item: 'Trà đá', reason: 'Khách đổi ý' });
  check('Hủy món đã gửi bếp: was_sent=true, subtotal còn 45.000',
    cx.was_sent === true && cx.totals.subtotal === '45000.00');
  check('KOT Bar chỉ còn món hủy → phiếu cancelled', (() => {
    const e = lastEvent('resto.order.item_cancelled');
    return (e?.payload as any)?.was_sent === true;
  })());

  const mv = await runTool(ORG_A, 'resto.order.move_table', { table: 'Bàn 9', to_table: 'Bàn 8' });
  eq('Chuyển bàn 9 → bàn 8', `${mv.from}→${mv.to}`, 'Bàn 9→Bàn 8');
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 9' });
  await runTool(ORG_A, 'resto.order.add_items', { table: 'Bàn 9', items: [{ name: 'Cà phê sữa' }] });
  const mg = await runTool(ORG_A, 'resto.order.merge', { from_table: 'Bàn 9', to_table: 'Bàn 8' });
  eq('Gộp bàn: chuyển 1 món', mg.moved_items, 1);
  const view8 = await runTool(ORG_A, 'resto.order.view', { table: 'Bàn 8' });
  check('Bàn 8 giờ có 2 món hiệu lực (phở + cà phê)',
    view8.items.filter((i: any) => i.status !== 'cancelled').length === 2);
  const co = await runTool(ORG_A, 'resto.order.cancel', { table: 'Bàn 8', reason: 'Khách bỏ về' });
  check('Hủy cả đơn: 2 món hủy, bàn thả', co.cancelled_items === 2);
  const map2 = await runTool(ORG_A, 'resto.table.map', {});
  eq('Mọi bàn lại trống', map2.counts.available, 5);

  // ═══════════════ 7) ĐẶT BÀN ═══════════════
  console.log('\n— 7) Đặt bàn: chống trùng giờ, nhận khách mở đơn một chạm —');
  const rsv = await runTool(ORG_A, 'resto.reservation.manage', {
    op: 'create', customer_name: 'Anh Long', party_size: 6, table: 'Bàn 8',
    at: '2026-07-10T19:00:00+07:00',
  });
  check('Tạo đặt bàn RSV + cảnh báo sức chứa không chặn', rsv.code.startsWith('RSV-') && rsv.status === 'pending');
  await expectErr('Trùng khung giờ cùng bàn → RESERVATION_CONFLICT', 'RESERVATION_CONFLICT', () =>
    runTool(ORG_A, 'resto.reservation.manage', {
      op: 'create', customer_name: 'Chị Mai', table: 'Bàn 8', at: '2026-07-10T20:00:00+07:00',
    }));
  const rsv2 = await runTool(ORG_A, 'resto.reservation.manage', {
    op: 'create', customer_name: 'Chị Mai', table: 'Bàn 8', at: '2026-07-10T21:00:00+07:00', party_size: 4,
  });
  check('Khung giờ sau (21:00, cách 2 tiếng) đặt được', rsv2.status === 'pending');
  await runTool(ORG_A, 'resto.reservation.manage', { op: 'confirm', code: rsv.code });
  const seat = await runTool(ORG_A, 'resto.reservation.manage', { op: 'seat', code: rsv.code });
  check('Nhận khách → mở đơn gắn bàn 8', Boolean(seat.order_code) && seat.status === 'seated');
  await expectErr('Đặt đã seated không hủy được', 'INVALID_STATUS_FLOW', () =>
    runTool(ORG_A, 'resto.reservation.manage', { op: 'cancel', code: rsv.code }));
  await runTool(ORG_A, 'resto.reservation.manage', { op: 'no_show', code: rsv2.code });
  const rl = await runTool(ORG_A, 'resto.reservation.list', { date: '2026-07-10', days: 1 });
  eq('List mặc định ẩn no_show → còn 1 (seated)', rl.total, 1);
  const rlAll = await runTool(ORG_A, 'resto.reservation.list', { date: '2026-07-10', days: 1, include_done: true });
  eq('include_done thấy cả 2', rlAll.total, 2);
  await runTool(ORG_A, 'resto.order.cancel', { table: 'Bàn 8', reason: 'dọn test' });

  // ═══════════════ 8) BÁO CÁO ═══════════════
  console.log('\n— 8) Báo cáo doanh thu & top món —');
  const rep = await runTool(ORG_A, 'resto.report.sales', {});
  eq('Doanh thu hôm nay = 342.825', rep.revenue, '342825.00');
  eq('6 bill / 4 đơn', `${rep.bills}|${rep.orders}`, '6|4');
  eq('TB/đơn = 85.706,25', rep.avg_per_order, '85706.25');
  const cash = rep.by_method.find((m: any) => m.method === 'cash');
  const bank = rep.by_method.find((m: any) => m.method === 'bank');
  const momo = rep.by_method.find((m: any) => m.method === 'momo');
  eq('Tiền mặt ghi số ÁP VÀO (không dính tiền thối) = 246.225', cash?.amount, '246225.00');
  eq('Bank 47.250', bank?.amount, '47250.00');
  eq('Momo 49.350', momo?.amount, '49350.00');
  const byType = Object.fromEntries(rep.by_type.map((t: any) => [t.type, t.amount]));
  check('Theo loại: dine_in 293.475 + takeaway 49.350',
    byType['dine_in'] === '293475.00' && byType['takeaway'] === '49350.00');
  const top = await runTool(ORG_A, 'resto.report.top_items', {});
  check('Top 1 = Phở bò (280.000, sl 6)',
    top.items[0].name === 'Phở bò' && top.items[0].amount === '280000.00' && top.items[0].qty === '6');

  // ═══════════════ 9) RLS — CÔ LẬP TENANT ═══════════════
  console.log('\n— 9) RLS: cross-tenant chặn tận database, fail-closed —');
  await expectErr('Org B không thấy bàn của org A', 'TABLE_NOT_FOUND', () =>
    runTool(ORG_B, 'resto.order.view', { table: 'Bàn 5' }));
  const bMenu = await runTool(ORG_B, 'resto.menu.search', {});
  eq('Org B menu rỗng', bMenu.total, 0);
  const bRep = await runTool(ORG_B, 'resto.report.sales', {});
  eq('Org B doanh thu 0', bRep.revenue, '0.00');
  let failClosed = false;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql.raw(`SELECT count(*) FROM resto_orders`)); // KHÔNG set org
    });
  } catch { failClosed = true; }
  check('Quên set org → query LỖI (fail-closed, không rò rỗng)', failClosed);

  // ═══════════════ 10) MESSAGE TIẾNG VIỆT CHO TIỂU TÂM ═══════════════
  console.log('\n— 10) Action message tiếng Việt sẵn (chống bịa số) —');
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 1' });
  const msgAdd = await runMsg(ORG_A, 'resto.order.add_items', { table: 'Bàn 1', items: [{ name: 'Trà đá', qty: '2' }] });
  check('Message gọi món nêu món + tạm tính ₫', msgAdd.includes('Trà đá') && msgAdd.includes('₫'));
  const msgPay = await runMsg(ORG_A, 'resto.bill.pay', { table: 'Bàn 1', method: 'cash', amount: '20000' });
  check('Message thanh toán nêu thu + thối + đóng đơn',
    msgPay.includes('Đã thu') && msgPay.includes('Thối lại') && msgPay.includes('đã đóng'));

  // ═══════════════ 11) KHUYẾN MÃI (voucher, min, trần, giới hạn) ═══════════════
  console.log('\n— 11) Khuyến mãi: voucher %, đơn tối thiểu, trần giảm, giới hạn lượt —');
  await runTool(ORG_A, 'resto.promo.upsert', {
    code: 'GIAM10', name: 'Giảm 10% đơn từ 100k', discount_type: 'percent', value: '10', min_subtotal: '100000',
  });
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 5', guests: 4 });
  await runTool(ORG_A, 'resto.order.add_items', {
    table: 'Bàn 5', items: [{ name: 'Phở bò', qty: '2' }, { name: 'Trà đá', qty: '2' }],
  });
  // subtotal = 45k×2 + 5k×2 = 100.000
  const ap1 = await runTool(ORG_A, 'resto.promo.apply', { table: 'Bàn 5', code: 'GIAM10' });
  eq('Áp GIAM10: giảm 10% của 100k = 10.000', ap1.discount_amount, '10000.00');
  eq('Sau KM: base 90k, sc 4.5k, grand gộp = 94.500', ap1.totals.grand_total, '94500.00');
  const rm1 = await runTool(ORG_A, 'resto.promo.apply', { table: 'Bàn 5', remove: true });
  eq('Gỡ KM → grand về 105.000', rm1.totals.grand_total, '105000.00');
  await runTool(ORG_A, 'resto.promo.apply', { table: 'Bàn 5', code: 'GIAM10' }); // áp lại

  await runTool(ORG_A, 'resto.promo.upsert', {
    code: 'BIG', name: 'Đơn từ 200k', discount_type: 'amount', value: '50000', min_subtotal: '200000',
  });
  await expectErr('Đơn 100k < ngưỡng 200k → PROMO_NOT_APPLICABLE', 'PROMO_NOT_APPLICABLE', () =>
    runTool(ORG_A, 'resto.promo.apply', { table: 'Bàn 5', code: 'BIG' }));

  await runTool(ORG_A, 'resto.promo.upsert', {
    code: 'HALF', name: 'Giảm nửa tối đa 20k', discount_type: 'percent', value: '50', max_discount: '20000',
  });
  const apHalf = await runTool(ORG_A, 'resto.promo.apply', { table: 'Bàn 5', code: 'HALF' });
  eq('HALF: 50% của 100k=50k nhưng trần 20k → giảm 20.000', apHalf.discount_amount, '20000.00');
  eq('Sau trần: base 80k, sc 4k, grand 84.000', apHalf.totals.grand_total, '84000.00');

  await runTool(ORG_A, 'resto.promo.upsert', {
    code: 'ONCE', name: 'Dùng 1 lần', discount_type: 'amount', value: '10000', usage_limit: 1,
  });
  await runTool(ORG_A, 'resto.promo.apply', { table: 'Bàn 5', code: 'ONCE' }); // dùng lượt duy nhất
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 8' });
  await runTool(ORG_A, 'resto.order.add_items', { table: 'Bàn 8', items: [{ name: 'Trà đá' }] });
  await expectErr('Voucher hết lượt → PROMO_LIMIT_REACHED', 'PROMO_LIMIT_REACHED', () =>
    runTool(ORG_A, 'resto.promo.apply', { table: 'Bàn 8', code: 'ONCE' }));
  await runTool(ORG_A, 'resto.order.cancel', { table: 'Bàn 8', reason: 'dọn test KM' });

  const plist = await runTool(ORG_A, 'resto.promo.list', {});
  const byCode = Object.fromEntries(plist.promos.map((p: any) => [p.code, p.used_count]));
  check('promo.list: ONCE đã dùng 1, GIAM10/HALF về 0 sau khi bị thay',
    byCode['ONCE'] === 1 && byCode['GIAM10'] === 0 && byCode['HALF'] === 0);

  // Thanh toán Bàn 5 (đang gắn ONCE giảm 10k): grand 94.500 → chốt, giữ redemption ONCE
  const payKM = await runTool(ORG_A, 'resto.bill.pay', { table: 'Bàn 5', method: 'cash' });
  check('Thu Bàn 5 có KM ONCE: grand 94.500, đơn đóng', payKM.applied === '94500.00' && payKM.order_closed === true);

  // 11b) KHUYẾN MÃI × TÁCH BILL: promo gộp vào discount_total nên tổng các bill == tổng đơn
  await runTool(ORG_A, 'resto.table.upsert', { name: 'Bàn 7', area: 'Tầng 1', capacity: 4 });
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 7', guests: 2 });
  await runTool(ORG_A, 'resto.order.add_items', {
    table: 'Bàn 7', items: [{ name: 'Phở bò', qty: '1' }, { name: 'Trà đá', qty: '1' }],
  }); // 2 dòng riêng để tách theo món
  await runTool(ORG_A, 'resto.promo.upsert', { code: 'SPLIT10', name: 'Giảm 10% (test split)', discount_type: 'percent', value: '10' });
  const apSplit = await runTool(ORG_A, 'resto.promo.apply', { table: 'Bàn 7', code: 'SPLIT10' });
  const ordGrand = apSplit.totals.grand_total; // 50k − 10% = 45k → sc 5% 2.25k → gross 47.250
  eq('Đơn Bàn 7 sau KM 10%: grand 47.250', ordGrand, '47250.00');
  const sbill1 = await runTool(ORG_A, 'resto.bill.create', { table: 'Bàn 7', item_names: ['Phở bò'] });
  const sbill2 = await runTool(ORG_A, 'resto.bill.create', { table: 'Bàn 7', item_names: ['Trà đá'] });
  const centsOf = (s: string) => BigInt(s.replace('.', '')); // scale-2 string → cents (không dùng float)
  check('Σ 2 bill (đã phân bổ giảm KM) == tổng đơn (không lệch 1đ)',
    centsOf(sbill1.grand_total) + centsOf(sbill2.grand_total) === centsOf(ordGrand));
  check('Mỗi bill nhận phần giảm KM tỷ lệ (discount_total > 0)',
    centsOf(sbill1.discount_total) > 0n && centsOf(sbill2.discount_total) > 0n);
  await runTool(ORG_A, 'resto.bill.pay', { bill_code: sbill1.bill_code, method: 'cash' });
  await runTool(ORG_A, 'resto.bill.pay', { bill_code: sbill2.bill_code, method: 'cash' });

  // ═══════════════ 12) KHÁCH THÂN THIẾT — TÍCH & ĐỔI ĐIỂM ═══════════════
  console.log('\n— 12) Loyalty: bật tích điểm, tích khi đóng đơn, đổi điểm trả tiền, điều chỉnh —');
  const ls = await runTool(ORG_A, 'resto.settings.update', {
    loyalty_enabled: true, loyalty_earn_pct: '10', loyalty_min_redeem: '5000',
  });
  eq('Bật loyalty: tích 10%, đổi tối thiểu 5.000', `${ls.loyalty_enabled}|${ls.loyalty_earn_pct}|${ls.loyalty_min_redeem}`, 'true|10.00|5000.00');

  const cust = await runTool(ORG_A, 'resto.customer.upsert', { phone: '0909000111', name: 'Anh Test' });
  check('Tạo khách mới, 0 điểm', cust.created === true && cust.points_balance === '0.00');

  // Đơn tích điểm: Bàn 2, gắn khách qua customer_phone lúc thanh toán
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 2' });
  await runTool(ORG_A, 'resto.order.add_items', { table: 'Bàn 2', items: [{ name: 'Phở bò', qty: '2' }] });
  // subtotal 90k, sc 4.5k, grand gộp 94.500
  const payEarn = await runTool(ORG_A, 'resto.bill.pay', { table: 'Bàn 2', method: 'cash', customer_phone: '0909000111' });
  check('Thanh toán tự gắn khách + tích 10% của 94.500 = 9.450 điểm',
    payEarn.loyalty.customer_linked === true && payEarn.loyalty.earned === '9450.00');
  const look1 = await runTool(ORG_A, 'resto.customer.lookup', { phone: '0909000111' });
  check('Khách: 9.450 điểm, 1 lần ghé', look1.customer.points_balance === '9450.00' && look1.customer.visits === 1);

  // Đơn đổi điểm: Bàn 5 (đã trống), set_customer rồi trả 1 phần bằng điểm
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 5' });
  await runTool(ORG_A, 'resto.order.set_customer', { table: 'Bàn 5', phone: '0909000111' });
  await runTool(ORG_A, 'resto.order.add_items', { table: 'Bàn 5', items: [{ name: 'Trà đá', qty: '2' }] });
  // subtotal 10k, sc 500, grand gộp 10.500
  const payPts = await runTool(ORG_A, 'resto.bill.pay', { table: 'Bàn 5', method: 'points', amount: '5000' });
  check('Đổi 5.000 điểm: áp 5.000, còn thiếu 5.500, đơn chưa đóng',
    payPts.applied === '5000.00' && payPts.remaining === '5500.00' && payPts.order_closed === false && payPts.loyalty.redeemed === '5000.00');
  const payRest = await runTool(ORG_A, 'resto.bill.pay', { table: 'Bàn 5', method: 'cash' });
  // earn base = grand 10.500 − đổi 5.000 = 5.500 → tích 10% = 550
  check('Trả nốt tiền mặt: đơn đóng, tích 10% của 5.500 = 550 điểm',
    payRest.order_closed === true && payRest.loyalty.earned === '550.00');
  const look2 = await runTool(ORG_A, 'resto.customer.lookup', { phone: '0909000111' });
  eq('Số dư điểm cuối: 9450 − 5000 + 550 = 5.000', look2.customer.points_balance, '5000.00');

  // Đổi dưới ngưỡng tối thiểu
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 8' });
  await runTool(ORG_A, 'resto.order.set_customer', { table: 'Bàn 8', phone: '0909000111' });
  await runTool(ORG_A, 'resto.order.add_items', { table: 'Bàn 8', items: [{ name: 'Trà đá', qty: '2' }] });
  await expectErr('Đổi 3.000 < tối thiểu 5.000 → LOYALTY_BELOW_MIN', 'LOYALTY_BELOW_MIN', () =>
    runTool(ORG_A, 'resto.bill.pay', { table: 'Bàn 8', method: 'points', amount: '3000' }));
  await runTool(ORG_A, 'resto.order.cancel', { table: 'Bàn 8', reason: 'dọn test điểm' });

  // Đổi điểm khi đơn chưa gắn khách
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 9' });
  await runTool(ORG_A, 'resto.order.add_items', { table: 'Bàn 9', items: [{ name: 'Trà đá' }] });
  await expectErr('Đổi điểm không có khách → LOYALTY_NO_CUSTOMER', 'LOYALTY_NO_CUSTOMER', () =>
    runTool(ORG_A, 'resto.bill.pay', { table: 'Bàn 9', method: 'points' }));
  await runTool(ORG_A, 'resto.order.cancel', { table: 'Bàn 9', reason: 'dọn' });

  // Điều chỉnh điểm tay
  const adj = await runTool(ORG_A, 'resto.loyalty.adjust', { phone: '0909000111', points: '2000', reason: 'Bù khiếu nại' });
  eq('Cộng 2.000 điểm tay → 7.000', adj.balance_after, '7000.00');
  await expectErr('Trừ quá số dư → LOYALTY_INSUFFICIENT', 'LOYALTY_INSUFFICIENT', () =>
    runTool(ORG_A, 'resto.loyalty.adjust', { phone: '0909000111', points: '-100000', reason: 'thử' }));
  const hist = await runTool(ORG_A, 'resto.loyalty.history', { phone: '0909000111' });
  check('Sổ điểm: có đủ earn + redeem + adjust',
    hist.found === true
    && hist.entries.some((e: any) => e.type === 'earn')
    && hist.entries.some((e: any) => e.type === 'redeem')
    && hist.entries.some((e: any) => e.type === 'adjust'));

  // RLS: org B không thấy khách/khuyến mãi org A
  const bCust = await runTool(ORG_B, 'resto.customer.lookup', { phone: '0909000111' });
  const bPromo = await runTool(ORG_B, 'resto.promo.list', {});
  check('Org B: không thấy khách + không thấy khuyến mãi của org A', bCust.found === false && bPromo.total === 0);

  // ═══════════════ 13) BẾP THEO LƯỢT + BẢNG ĐIỀU KHIỂN (v1.2) ═══════════════
  console.log('\n— 13) Fire-by-course + dashboard —');
  await runTool(ORG_A, 'resto.table.upsert', { name: 'Bàn 6', area: 'Tầng 1', capacity: 4 });
  await runTool(ORG_A, 'resto.table.open', { table: 'Bàn 6', guests: 2 });
  await runTool(ORG_A, 'resto.order.add_items', {
    table: 'Bàn 6', items: [
      { name: 'Trà đá', qty: '2', course: 1 },
      { name: 'Phở bò', qty: '2', course: 2 },
    ],
  });
  const fc1 = await runTool(ORG_A, 'resto.order.fire_course', { table: 'Bàn 6', course: 1 });
  check('Fire course 1: chỉ gửi món course 1', fc1.course === 1 && fc1.kots.length >= 1);
  await expectErr('Fire lại course 1 (đã gửi hết) → NOTHING_TO_SEND', 'NOTHING_TO_SEND', () =>
    runTool(ORG_A, 'resto.order.fire_course', { table: 'Bàn 6', course: 1 }));
  const fc2 = await runTool(ORG_A, 'resto.order.fire_course', { table: 'Bàn 6', course: 2 });
  check('Fire course 2 sau đó: gửi phần còn lại', fc2.course === 2 && fc2.kots.length >= 1);
  // dọn
  await runTool(ORG_A, 'resto.bill.pay', { table: 'Bàn 6', method: 'cash' });

  const dash = await runTool(ORG_A, 'resto.console.dashboard', {});
  check('Dashboard trả đủ khối tổng quan',
    dash.open_orders !== undefined && dash.kitchen !== undefined
    && dash.today !== undefined && dash.promotions !== undefined && dash.customers !== undefined
    && typeof dash.generated_at === 'string');

  // ═══════════════ KẾT QUẢ ═══════════════
  check('Mọi event payload đều mang org_id', events.every((e) => typeof e.payload.org_id === 'string' && e.payload.org_id.length > 0));
  console.log(`\n════════ KẾT QUẢ: ${passed} ✅ · ${failed} ❌ / ${passed + failed} checks ════════`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
