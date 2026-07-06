import * as XLSX from 'xlsx';
import { test, ok, eq, throws, done } from './_h.js';
import { newDb, ctx, ORG_A } from './setup.js';
import * as M from '../src/services/master.service.js';
import * as SP from '../src/services/splitter.service.js';
import * as F from '../src/services/finance.service.js';

const { db } = await newDb();
const emits: { t: string; p: Record<string, unknown> }[] = [];
const c = ctx(ORG_A, 'u-split', emits);
await M.ensureDefaults(db, c);

const npp = await M.createAgency(db, c, { name: 'NPP Đồng Tháp', level: 1 });
const shopMai = await M.createRetailer(db, c, { name: 'Shop Hoa Mai', parentAgencyCustomerId: npp.id, phone: '0911222333' });
const shopCuc = await M.createRetailer(db, c, { name: 'Shop Cúc Họa Mi', parentAgencyCustomerId: npp.id });

// Workbook thật, header tiếng Việt có dấu, tiền định dạng chấm nghìn
function buildWorkbookB64(): string {
  const rows = [
    { 'Ngày': '02/06/2026', 'Mã khách': shopMai.code, 'Tên người mua': 'Shop Hoa Mai', 'SĐT': '0911.222.333', 'Sản phẩm': 'SP', 'SL': 10, 'Doanh thu': '5.000.000', 'Phí ship': '200.000', 'Đặt cọc': '1.000.000', 'Chiết khấu': '100.000', 'Công nợ': '3.700.000', 'Ghi chú': '' },
    { 'Ngày': '03/06/2026', 'Mã khách': '', 'Tên người mua': 'Shop Cúc Hoạ Mi', 'SĐT': '', 'Sản phẩm': 'SP', 'SL': 4, 'Doanh thu': '2.000.000', 'Phí ship': '0', 'Đặt cọc': '0', 'Chiết khấu': '0', 'Công nợ': '2.000.000', 'Ghi chú': 'match tên bỏ dấu' },
    { 'Ngày': '04/06/2026', 'Mã khách': '', 'Tên người mua': 'Chị Chín Sa Đéc', 'SĐT': '0999888777', 'Sản phẩm': 'SP', 'SL': 1, 'Doanh thu': '500.000', 'Phí ship': '30.000', 'Đặt cọc': '0', 'Chiết khấu': '0', 'Công nợ': '530.000', 'Ghi chú': 'khách chưa có' },
    { 'Ngày': '02/06/2026', 'Mã khách': shopMai.code, 'Tên người mua': 'Shop Hoa Mai', 'SĐT': '0911222333', 'Sản phẩm': 'SP', 'SL': 10, 'Doanh thu': '5.000.000', 'Phí ship': '200.000', 'Đặt cọc': '0', 'Chiết khấu': '0', 'Công nợ': '5.200.000', 'Ghi chú': 'dòng trùng' },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BangKe');
  return (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
}

let batchId = '';

await test('uploadStatement chặn nguồn không phải agency + period sai', async () => {
  await throws(() => SP.uploadStatement(db, c, { sourceCustomerId: shopMai.id, period: '2026-06', rows: [{ a: 1 }] }), 'agency');
  await throws(() => SP.uploadStatement(db, c, { sourceCustomerId: npp.id, period: '6/2026', rows: [{ a: 1 }] }), 'YYYY-MM');
});

await test('upload Excel thật: parse 4 dòng, header có dấu map đúng, tiền "5.000.000"→5000000, raw giữ nguyên văn', async () => {
  const r = await SP.uploadStatement(db, c, { sourceCustomerId: npp.id, period: '2026-06', fileName: 'bangke-t6.xlsx', fileBase64: buildWorkbookB64() });
  batchId = r.batchId;
  eq(r.rowCount, 4);
  ok(r.code.startsWith('IB-202606-'), r.code);
  const st = (await SP.batchStatus(db, c, { batchId })) as any;
  eq(st.batch.status, 'uploaded');
  eq(st.rowsByStatus.pending, 4);
});

await test('reconcile: mã 1.0 + tên-bỏ-dấu 0.8 OK; thiếu khách + trùng dòng → 2 case; batch reconciling', async () => {
  const r = await SP.reconcileBatch(db, c, { batchId });
  eq(r.matched, 2, 'shopMai theo mã, shopCuc theo tên "Hoạ Mi"≈"Họa Mi" bỏ dấu');
  eq(r.exceptions, 2);
  eq(r.status, 'reconciling');
  const ex = await SP.reconciliationExceptions(db, c, { batchId });
  eq(ex.length, 2);
  ok(ex.some((e) => e.kind === 'missing_customer'));
  ok(ex.some((e) => e.kind === 'duplicate'));
});

await test('splitConfirm bị chặn khi còn case mở', async () => {
  await throws(() => SP.splitConfirm(db, c, { batchId }), 'case đối soát');
});

await test('resolveRow: tạo khách mới rồi match dòng thiếu; void dòng trùng → batch ready', async () => {
  const ex = await SP.reconciliationExceptions(db, c, { batchId });
  const missing = ex.find((e) => e.kind === 'missing_customer')!;
  const dup = ex.find((e) => e.kind === 'duplicate')!;
  const chin = await M.createCustomer(db, c, { kind: 'person', name: 'Chị Chín Sa Đéc', phone: '0999888777' });
  const r1 = await SP.resolveRow(db, c, { rowId: missing.rowId, action: 'match', customerId: chin.id, note: 'tạo mới + gán' });
  eq(r1.openCasesLeft, 1);
  const r2 = await SP.resolveRow(db, c, { rowId: dup.rowId, action: 'void', note: 'đại lý paste trùng' });
  eq(r2.openCasesLeft, 0);
  const st = (await SP.batchStatus(db, c, { batchId })) as any;
  eq(st.batch.status, 'ready');
});

await test('computeSplit: revenue 7.5tr / ship 230k / cọc 1tr / CK 100k / nợ 6.23tr / suspense 0 (dòng void không tính)', async () => {
  const r = await SP.computeSplit(db, c, { batchId });
  const g = (k: string) => r.split.find((s) => s.category === k)!.amount;
  eq(g('revenue'), '7500000');
  eq(g('ship'), '230000');
  eq(g('deposit'), '1000000');
  eq(g('discount'), '100000');
  eq(g('debt'), '6230000');
  eq(g('suspense'), '0');
});

await test('splitConfirm: statement sinh đúng, batch confirmed, emit reconciliation.completed, chốt lần 2 bị chặn', async () => {
  const r = await SP.splitConfirm(db, c, { batchId });
  eq(r.status, 'confirmed');
  ok(emits.some((e) => e.t === 'soulsale.reconciliation.completed'));
  const st = await F.sellthroughSummary(db, c, { agencyCustomerId: npp.id, period: '2026-06' });
  eq(st.sellOut, '7500000', 'sell-out đọc từ statement vừa chốt');
  await throws(() => SP.splitConfirm(db, c, { batchId }), 'đã chốt');
});

await test('upload đường JSON rows (không cần file) + voidBatch: rows/cases voided, batch void; batch đã chốt không void được', async () => {
  const r = await SP.uploadStatement(db, c, {
    sourceCustomerId: npp.id, period: '2026-06',
    rows: [{ 'ten_nguoi_mua': 'Ai Đó Lạ', 'doanh_thu': '999.000', 'cong_no': '999.000' }],
  });
  await SP.reconcileBatch(db, c, { batchId: r.batchId });
  const v = await SP.voidBatch(db, c, { batchId: r.batchId, reason: 'file gửi nhầm kỳ' });
  eq(v.status, 'void');
  const ex = await SP.reconciliationExceptions(db, c, { batchId: r.batchId });
  eq(ex.length, 0, 'không còn case open');
  await throws(() => SP.voidBatch(db, c, { batchId, reason: 'x' }), 'đã chốt');
});

await test('parseMoney chịu được định dạng bẩn: "1,5tr text" → chỉ lấy số', async () => {
  const { parseMoney } = await import('../src/lib/util.js');
  eq(parseMoney('1.234.567đ'), '1234567');
  eq(parseMoney('(500.000)'), '-500000');
  eq(parseMoney(null), '0');
  eq(parseMoney('  '), '0');
});

done('06-splitter');
