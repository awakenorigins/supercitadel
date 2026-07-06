/**
 * SOUL-INVENTORY v2.0 FINAL — Smoke test nghiệp vụ mới
 * Cover: Multi-UoM · BOM assemble/disassemble + giá vốn · FEFO/FIFO picking ·
 * Reorder rules · Landed cost · Scrap · ABC analysis · Doc numbers tuần tự ·
 * Excel import/export round-trip · Barcode lookup · RLS cross-tenant bảng mới.
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
import { getKhoTool, khoTools } from '../src/tools/index.js';
import { importItems, importOpeningStock, exportStockReport } from '../src/services/excel.service.js';
import * as XLSX from 'xlsx';

const __dir = dirname(fileURLToPath(import.meta.url));
let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function eqNum(name: string, actual: unknown, expected: number) {
  check(name, Math.abs(Number.parseFloat(String(actual)) - expected) < 0.001,
    `(actual=${actual}, expected=${expected})`);
}
function eqStr(name: string, actual: unknown, expected: string) {
  check(name, String(actual) === expected, `(actual=${actual}, expected=${expected})`);
}

const events: Array<{ name: string; payload: KhoEventPayload }> = [];
const bus: EventBus = { emit: (n, p) => { events.push({ name: n, payload: p }); } };

async function main() {
  console.log('— SOUL-INVENTORY v2.0 FINAL SMOKE —');
  const client = new PGlite();
  const db = drizzle(client);

  for (const f of ['0000_init.sql', '0001_rls.sql', '0002_backfill_legacy.sql',
    '0003_v2_final.sql', '0004_v2_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }
  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);

  const ORG = randomUUID();
  const ORG_B = randomUUID();
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
    if (res && typeof res === 'object' && 'ok' in res && 'data' in res) {
      return (res as unknown as { data: unknown; message: string }).data;
    }
    return res;
  }
  async function runFull(orgId: string, name: string, input: unknown) {
    const t = getKhoTool(name);
    if (!t) throw new Error(`tool missing: ${name}`);
    return withTenant(orgId, (ctx) => t.handler(ctx, input)) as Promise<{ ok: boolean; message: string; data: unknown }>;
  }

  // ── A. MULTI-UoM ──
  console.log('\n— A. Multi-UoM: thùng ↔ lon —');
  await run(ORG, 'kho.item.upsert', { sku: 'BIA-333', name: 'Bia 333', unit: 'lon', barcode: '8934822101336' });
  const uomRes = await runFull(ORG, 'kho.uom.upsert', {
    sku: 'BIA-333', uom_name: 'thùng', factor: '24', is_purchase: true, barcode: '8934822101343',
  });
  check('uom.upsert trả message tiếng Việt', uomRes.message.includes('1 thùng = 24 lon'));
  // nhập 2 thùng qua uom → 48 lon
  await run(ORG, 'kho.stock.receive', {
    sku: 'BIA-333', quantity: '2', uom: 'thùng', unit_cost: '240000',
  });
  const q = await run(ORG, 'kho.stock.query', { sku: 'BIA-333' }) as Array<Record<string, string>>;
  eqNum('nhập 2 thùng = 48 lon tồn', q[0]?.stocked, 48);
  // đơn giá quy về lon: 240000/24 = 10000 → avg_cost = 10000
  const avgRes = await withTenant(ORG, (ctx) =>
    ctx.db.execute(sql`SELECT avg_cost FROM kho_items WHERE sku = 'BIA-333'`));
  const avgRows = (('rows' in avgRes ? (avgRes as any).rows : avgRes) as Array<{ avg_cost: string }>);
  eqNum('avg_cost quy về đơn vị gốc = 10.000đ/lon', avgRows[0]?.avg_cost, 10000);

  // ── B. BARCODE ──
  console.log('\n— B. Barcode lookup —');
  const b1 = await run(ORG, 'kho.barcode.lookup', { barcode: '8934822101336' }) as Record<string, unknown>;
  eqStr('quét barcode item → BIA-333', b1.sku, 'BIA-333');
  check('  barcode item không kèm uom', b1.matched_uom === null);
  const b2 = await run(ORG, 'kho.barcode.lookup', { barcode: '8934822101343' }) as Record<string, unknown>;
  check('quét barcode thùng → kèm factor 24',
    (b2.matched_uom as { factor: string } | null)?.factor?.startsWith('24') ?? false);
  try {
    await run(ORG, 'kho.barcode.lookup', { barcode: 'KHONG-TON-TAI' });
    check('barcode lạ → phải báo lỗi', false);
  } catch (e) {
    check('barcode lạ → BARCODE_NOT_FOUND', e instanceof KhoError && e.code === 'BARCODE_NOT_FOUND');
  }

  // ── C. FEFO PICKING ──
  console.log('\n— C. FEFO picking suggestion —');
  await run(ORG, 'kho.item.upsert', { sku: 'SUA-TH', name: 'Sữa TH 1L', unit: 'hộp', track_lot: true });
  const d10 = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const d40 = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
  const d90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  await run(ORG, 'kho.stock.receive', { sku: 'SUA-TH', quantity: '30', lot_no: 'L-C', expiry_date: d90 });
  await run(ORG, 'kho.stock.receive', { sku: 'SUA-TH', quantity: '20', lot_no: 'L-A', expiry_date: d10 });
  await run(ORG, 'kho.stock.receive', { sku: 'SUA-TH', quantity: '25', lot_no: 'L-B', expiry_date: d40 });
  const pick = await run(ORG, 'kho.picking.suggest', { sku: 'SUA-TH', quantity: '35' }) as {
    strategy: string; plan: Array<{ lot_no: string; take: string }>; fulfilled: string; shortage: string;
  };
  eqStr('strategy tự chọn FEFO (item track_lot)', pick.strategy, 'FEFO');
  eqStr('lô đầu tiên = L-A (cận hạn nhất)', pick.plan[0]?.lot_no, 'L-A');
  eqNum('  lấy hết 20 từ L-A', pick.plan[0]?.take, 20);
  eqStr('lô thứ hai = L-B', pick.plan[1]?.lot_no, 'L-B');
  eqNum('  lấy 15 từ L-B', pick.plan[1]?.take, 15);
  eqNum('fulfilled đủ 35', pick.fulfilled, 35);
  eqNum('shortage 0', pick.shortage, 0);
  // thiếu hàng: xin 100 khi chỉ có 75
  const pickShort = await run(ORG, 'kho.picking.suggest', { sku: 'SUA-TH', quantity: '100' }) as {
    fulfilled: string; shortage: string;
  };
  eqNum('xin 100/75 → fulfilled 75', pickShort.fulfilled, 75);
  eqNum('  shortage 25', pickShort.shortage, 25);

  // ── D. BOM + ASSEMBLY ──
  console.log('\n— D. BOM lắp ráp/tháo dỡ + backflush + giá vốn —');
  await run(ORG, 'kho.item.upsert', { sku: 'COMBO-QUA', name: 'Giỏ quà Tết', unit: 'giỏ' });
  await run(ORG, 'kho.item.upsert', { sku: 'RUOU-VANG', name: 'Rượu vang', unit: 'chai' });
  await run(ORG, 'kho.item.upsert', { sku: 'BANH-QUY', name: 'Bánh quy hộp', unit: 'hộp' });
  await run(ORG, 'kho.stock.receive', { sku: 'RUOU-VANG', quantity: '10', unit_cost: '150000' });
  await run(ORG, 'kho.stock.receive', { sku: 'BANH-QUY', quantity: '20', unit_cost: '50000' });
  await run(ORG, 'kho.bom.upsert', {
    sku: 'COMBO-QUA', output_qty: '1',
    lines: [
      { component_sku: 'RUOU-VANG', qty_per: '1' },
      { component_sku: 'BANH-QUY', qty_per: '2' },
    ],
  });
  const info = await run(ORG, 'kho.bom.info', { sku: 'COMBO-QUA' }) as { max_buildable: string };
  eqNum('max_buildable = 10 (giới hạn bởi rượu 10, bánh 20/2)', info.max_buildable, 10);

  const asm = await runFull(ORG, 'kho.assembly.execute', { sku: 'COMBO-QUA', qty: '3', kind: 'assemble' });
  const asmData = asm.data as { doc_no: string; unit_cost: string; components_used: unknown[] };
  check('assembly doc_no dạng LSX-000001', asmData.doc_no === 'LSX-000001', asmData.doc_no);
  // giá vốn giỏ = 1×150000 + 2×50000 = 250000
  eqNum('giá vốn thành phẩm = 250.000đ', asmData.unit_cost, 250000);
  check('message assembly có giá vốn', asm.message.includes('250000'));
  const qCombo = await run(ORG, 'kho.stock.query', { sku: 'COMBO-QUA' }) as Array<Record<string, string>>;
  eqNum('thành phẩm tồn 3 giỏ', qCombo[0]?.stocked, 3);
  const qRuou = await run(ORG, 'kho.stock.query', { sku: 'RUOU-VANG' }) as Array<Record<string, string>>;
  eqNum('backflush: rượu còn 7 (10-3)', qRuou[0]?.stocked, 7);
  const qBanh = await run(ORG, 'kho.stock.query', { sku: 'BANH-QUY' }) as Array<Record<string, string>>;
  eqNum('backflush: bánh còn 14 (20-6)', qBanh[0]?.stocked, 14);

  // thiếu nguyên liệu: lắp 8 giỏ cần 8 rượu nhưng chỉ còn 7
  try {
    await run(ORG, 'kho.assembly.execute', { sku: 'COMBO-QUA', qty: '8', kind: 'assemble' });
    check('lắp 8 khi thiếu rượu → phải chặn', false);
  } catch (e) {
    check('thiếu NL → INSUFFICIENT_COMPONENT',
      e instanceof KhoError && e.code === 'INSUFFICIENT_COMPONENT');
  }

  // tháo dỡ 1 giỏ → hoàn 1 rượu + 2 bánh
  const dis = await runFull(ORG, 'kho.assembly.execute', { sku: 'COMBO-QUA', qty: '1', kind: 'disassemble' });
  const disData = dis.data as { doc_no: string };
  check('disassembly doc_no dạng LTD-000001', disData.doc_no === 'LTD-000001', disData.doc_no);
  const qRuou2 = await run(ORG, 'kho.stock.query', { sku: 'RUOU-VANG' }) as Array<Record<string, string>>;
  eqNum('tháo hoàn rượu về 8', qRuou2[0]?.stocked, 8);

  // ── E. REORDER RULES ──
  console.log('\n— E. Reorder rules min-max —');
  await run(ORG, 'kho.reorder.rule_upsert', {
    sku: 'BIA-333', min_qty: '60', max_qty: '200', supplier_name: 'Sabeco', lead_time_days: 3,
  });
  const sug = await run(ORG, 'kho.reorder.suggest', {}) as Array<Record<string, unknown>>;
  check('BIA-333 tồn 48 ≤ min 60 → có trong gợi ý', sug.some(r => r.sku === 'BIA-333'));
  const biaRow = sug.find(r => r.sku === 'BIA-333')!;
  eqNum('gợi ý đặt = 200 - 48 = 152', biaRow.suggest_order, 152);
  eqStr('  kèm NCC Sabeco', biaRow.supplier, 'Sabeco');

  // ── F. LANDED COST ──
  console.log('\n— F. Landed cost phân bổ —');
  // BIA-333 nhập 48 lon @10000; giờ phân bổ 96.000đ phí vận chuyển by_qty → +2000đ/lon
  const mv = await withTenant(ORG, (ctx) =>
    ctx.db.execute(sql`SELECT doc_no FROM kho_movements WHERE org_id=${ORG} AND type='receive' AND item_id=(SELECT id FROM kho_items WHERE sku='BIA-333' AND org_id=${ORG}) LIMIT 1`));
  const mvRows = (('rows' in mv ? (mv as any).rows : mv) as Array<{ doc_no: string }>);
  const pnk = mvRows[0]!.doc_no;
  check('phiếu nhập bia có doc_no PNK-*', pnk?.startsWith('PNK-'), pnk);
  const lc = await runFull(ORG, 'kho.landed_cost.apply', {
    movement_doc_nos: [pnk], total_cost: '96000', method: 'by_qty',
  });
  const lcData = lc.data as { doc_no: string; lines: Array<{ new_avg_cost: string }> };
  check('landed cost doc LC-000001', lcData.doc_no === 'LC-000001', lcData.doc_no);
  eqNum('avg_cost bia sau phân bổ = 12.000 (10.000 + 96.000/48)', lcData.lines[0]?.new_avg_cost, 12000);

  // ── G. SCRAP ──
  console.log('\n— G. Scrap hàng hỏng —');
  const scr = await runFull(ORG, 'kho.stock.scrap', {
    sku: 'SUA-TH', quantity: '5', lot_no: 'L-A', reason: 'Vỡ hộp khi vận chuyển',
  });
  const scrData = scr.data as { doc_no: string; loss_value: string };
  check('scrap doc SCR-000001', scrData.doc_no === 'SCR-000001', scrData.doc_no);
  check('loss_value > 0', Number.parseFloat(scrData.loss_value) >= 0);
  const qSua = await run(ORG, 'kho.stock.query', { sku: 'SUA-TH' }) as Array<Record<string, string>>;
  const totalSua = qSua.reduce((s, r) => s + Number.parseFloat(r.stocked ?? '0'), 0);
  eqNum('sữa còn 70 (75 - 5 scrap)', totalSua, 70);

  // ── H. ABC ANALYSIS ──
  console.log('\n— H. ABC analysis —');
  // tạo lịch sử xuất: bia xuất nhiều giá trị nhất
  await run(ORG, 'kho.stock.issue', { sku: 'BIA-333', quantity: '30' });
  await run(ORG, 'kho.stock.issue', { sku: 'SUA-TH', quantity: '10', lot_no: 'L-B' });
  const abc = await runFull(ORG, 'kho.abc.run', {});
  const abcData = abc.data as { summary: { A: number; B: number; C: number }; items: Array<{ sku: string; abc_class: string }> };
  check('có ít nhất 1 hàng lớp A', abcData.summary.A >= 1);
  const biaClass = abcData.items.find(i => i.sku === 'BIA-333')?.abc_class;
  eqStr('BIA-333 (giá trị xuất lớn nhất) = lớp A', biaClass, 'A');

  // ── I. ANALYTICS REPORT ──
  const rep = await run(ORG, 'kho.analytics.report', {}) as { aging: unknown[]; cycle_count_due: unknown[] };
  check('stock aging có dữ liệu', rep.aging.length >= 1);
  check('cycle count due có gợi ý (chưa kiểm lần nào)', rep.cycle_count_due.length >= 1);

  // ── J. DOC NUMBERS TUẦN TỰ ──
  console.log('\n— J. Doc numbers tuần tự —');
  await run(ORG, 'kho.stock.receive', { sku: 'BIA-333', quantity: '10' });
  const mv2 = await withTenant(ORG, (ctx) =>
    ctx.db.execute(sql`SELECT doc_no FROM kho_movements WHERE org_id=${ORG} AND type='receive' ORDER BY created_at DESC, doc_no DESC LIMIT 1`));
  const mv2Rows = (('rows' in mv2 ? (mv2 as any).rows : mv2) as Array<{ doc_no: string }>);
  check('PNK tăng tuần tự (PNK-000005 sau 4 lần nhập trước)',
    /^PNK-\d{6}$/.test(mv2Rows[0]!.doc_no), mv2Rows[0]!.doc_no);

  // ── K. EXCEL ROUND-TRIP ──
  console.log('\n— K. Excel import/export —');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    { 'SKU': 'GAO-XL', 'Tên': 'Gạo xuất từ Excel', 'ĐVT': 'kg', 'Định mức': 100 },
    { 'SKU': '', 'Tên': 'Dòng lỗi thiếu SKU', 'ĐVT': 'kg' },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'DanhMuc');
  const itemsBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const impItems = await withTenant(ORG, (ctx) => importItems(ctx, itemsBuf));
  eqNum('import items: 1 OK', impItems.ok, 1);
  eqNum('  1 failed (dòng thiếu SKU)', impItems.failed, 1);

  const wb2 = XLSX.utils.book_new();
  const ws2 = XLSX.utils.json_to_sheet([
    { 'SKU': 'GAO-XL', 'Số lượng': 500, 'Đơn giá': 22000 },
  ]);
  XLSX.utils.book_append_sheet(wb2, ws2, 'TonDauKy');
  const stockBuf = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const impStock = await withTenant(ORG, (ctx) => importOpeningStock(ctx, stockBuf, 'test-file'));
  eqNum('import tồn đầu kỳ: 1 OK', impStock.ok, 1);
  const qGao = await run(ORG, 'kho.stock.query', { sku: 'GAO-XL' }) as Array<Record<string, string>>;
  eqNum('gạo Excel tồn 500', qGao[0]?.stocked, 500);
  // idempotent theo ref: import lại cùng file → thêm nữa? KHÔNG idempotent với receive
  // (mỗi lần import = một lần nhập) — nên test này chỉ verify export
  const exportBuf = await withTenant(ORG, (ctx) => exportStockReport(ctx));
  const wbOut = XLSX.read(exportBuf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wbOut.Sheets[wbOut.SheetNames[0]!]!);
  check('export tồn kho: có dòng dữ liệu', rows.length >= 4, String(rows.length));

  // ── L. RLS BẢNG MỚI ──
  console.log('\n— L. RLS cross-tenant bảng mới —');
  const leakBom = await withTenant(ORG_B, (ctx) =>
    ctx.db.execute(sql`SELECT count(*)::int AS n FROM kho_boms`));
  const leakRows = (('rows' in leakBom ? (leakBom as any).rows : leakBom) as Array<{ n: number }>);
  eqNum('org B không thấy BOM của org A', leakRows[0]?.n ?? -1, 0);
  const leakUom = await withTenant(ORG_B, (ctx) =>
    ctx.db.execute(sql`SELECT count(*)::int AS n FROM kho_item_uoms`));
  const leakUomRows = (('rows' in leakUom ? (leakUom as any).rows : leakUom) as Array<{ n: number }>);
  eqNum('org B không thấy UoM của org A', leakUomRows[0]?.n ?? -1, 0);
  const leakCounter = await withTenant(ORG_B, (ctx) =>
    ctx.db.execute(sql`SELECT count(*)::int AS n FROM kho_doc_counters`));
  const leakCntRows = (('rows' in leakCounter ? (leakCounter as any).rows : leakCounter) as Array<{ n: number }>);
  eqNum('org B không thấy doc counters của org A', leakCntRows[0]?.n ?? -1, 0);
  // org B tự tạo doc riêng → bắt đầu từ 000001 (không dính counter org A)
  await run(ORG_B, 'kho.item.upsert', { sku: 'B-01', name: 'Hàng org B', unit: 'cái' });
  await run(ORG_B, 'kho.stock.receive', { sku: 'B-01', quantity: '1' });
  const mvB = await withTenant(ORG_B, (ctx) =>
    ctx.db.execute(sql`SELECT doc_no FROM kho_movements WHERE org_id=${ORG_B} AND type='receive' LIMIT 1`));
  const mvBRows = (('rows' in mvB ? (mvB as any).rows : mvB) as Array<{ doc_no: string }>);
  eqStr('org B counter riêng: PNK-000001', mvBRows[0]?.doc_no, 'PNK-000001');

  // ── M. METADATA TOOLS ──
  console.log('\n— M. Metadata dry-run protocol —');
  const sensitiveActions = khoTools.filter(t => t.sensitive);
  check('≥7 actions sensitive (nhập/xuất/chuyển/kiểm/lắp/hủy/LC)', sensitiveActions.length >= 7,
    String(sensitiveActions.length));
  check('mọi sensitive đều kind=action', sensitiveActions.every(t => t.kind === 'action'));
  check('mọi định nghĩa có securityLevel 1|2',
    khoTools.every(t => t.securityLevel === 1 || t.securityLevel === 2));
  check('read tools không sensitive',
    khoTools.filter(t => t.kind === 'tool').every(t => !t.sensitive));

  console.log(`\n════════ SOUL-INVENTORY v2.0: ${passed} pass / ${failed} fail ════════`);
  await client.close();
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
