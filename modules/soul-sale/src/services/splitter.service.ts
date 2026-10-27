/** SOUL-SALE 1A — splitter.service.ts: nạp bảng kê Excel/JSON của đại lý, đối soát, tách dòng tiền, chốt statement. */
import * as XLSX from 'xlsx';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  ssImportBatches, ssImportRawRows, ssImportRows, ssReconciliationCases, ssSplitResults, ssAgencyStatements, ssCustomers,
} from '../schema.js';
import type { Db, Ctx } from '../contract.js';
import { bad, nextCode, nowOf, addV, ZERO, parseMoney, vnNorm, normPhone, fmtV } from '../lib/util.js';
import { getCustomer } from './master.service.js';

/* ---------- chuẩn hoá header tiếng Việt linh hoạt ---------- */
const HEADER_MAP: [RegExp, string][] = [
  [/^(ngay|date)/, 'ngay'],
  [/^(ma.?khach|ma.?kh|customer.?code)/, 'ma_khach'],
  [/^(ten.?nguoi.?mua|nguoi.?mua|khach.?hang|buyer)/, 'ten_nguoi_mua'],
  [/^(ten.?shop|shop|cua.?hang)/, 'ten_shop'],
  [/^(sdt|so.?dien.?thoai|phone|dien.?thoai)/, 'sdt'],
  [/^(san.?pham|sku|product)/, 'san_pham'],
  [/^(so.?luong|sl|qty)/, 'so_luong'],
  [/^(doanh.?thu|thanh.?tien|revenue|tien.?hang)/, 'doanh_thu'],
  [/^(phi.?ship|ship|van.?chuyen)/, 'phi_ship'],
  [/^(coc|dat.?coc|deposit)/, 'coc'],
  [/^(chiet.?khau|ck|discount)/, 'chiet_khau'],
  [/^(cong.?no|no|debt)/, 'cong_no'],
  [/^(ghi.?chu|note)/, 'ghi_chu'],
];
function normHeader(h: string): string {
  const n = vnNorm(h).replace(/\s+/g, '.');
  for (const [re, key] of HEADER_MAP) if (re.test(n)) return key;
  return n;
}

export interface RawRowInput { [k: string]: unknown }

export function parseWorkbook(fileBase64: string): RawRowInput[] {
  const buf = Buffer.from(fileBase64, 'base64');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) bad('EMPTY_WORKBOOK', 'File Excel không có sheet nào');
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName!]!, { defval: null });
  return raw.map((r) => {
    const out: RawRowInput = {};
    for (const [k, v] of Object.entries(r)) out[normHeader(k)] = v;
    return out;
  });
}

/* ---------- upload ---------- */
export async function uploadStatement(db: Db, ctx: Ctx, p: {
  sourceCustomerId: string; period: string; fileName?: string;
  fileBase64?: string; rows?: RawRowInput[];
}) {
  if (!/^\d{4}-\d{2}$/.test(p.period)) bad('BAD_PERIOD', 'period phải dạng YYYY-MM');
  const src = await getCustomer(db, ctx, p.sourceCustomerId);
  if (!['agency', 'distributor'].includes(src.kind)) bad('SOURCE_NOT_AGENCY', 'Nguồn bảng kê phải là agency/distributor');
  let rows: RawRowInput[];
  if (p.fileBase64) rows = parseWorkbook(p.fileBase64);
  else if (p.rows?.length) rows = p.rows.map((r) => { const o: RawRowInput = {}; for (const [k, v] of Object.entries(r)) o[normHeader(k)] = v; return o; });
  else { bad('NO_DATA', 'Truyền fileBase64 (Excel) hoặc rows (JSON)'); return undefined as never; }
  if (rows.length === 0) bad('NO_DATA', 'Bảng kê rỗng');

  const code = await nextCode(db, ctx, 'IB', { period: p.period });
  const [batch] = await db.insert(ssImportBatches).values({
    orgId: ctx.orgId, code, sourceCustomerId: src.id, period: p.period,
    fileName: p.fileName ?? `${code}.xlsx`, status: 'uploaded', rowCount: rows.length,
    createdBy: ctx.userId, createdAt: nowOf(ctx), updatedAt: nowOf(ctx),
  }).returning();

  await db.insert(ssImportRawRows).values(rows.map((r, i) => ({ orgId: ctx.orgId, batchId: batch!.id, rowNo: i + 1, raw: r })));
  await db.insert(ssImportRows).values(rows.map((r, i) => ({
    orgId: ctx.orgId, batchId: batch!.id, rowNo: i + 1,
    buyerName: (r.ten_nguoi_mua as string) ?? null, shopName: (r.ten_shop as string) ?? null,
    phone: normPhone(r.sdt as string), productCode: (r.san_pham as string) ?? null,
    qty: r.so_luong ? Number(r.so_luong) : null,
    saleAmount: parseMoney(r.doanh_thu), shipFee: parseMoney(r.phi_ship), deposit: parseMoney(r.coc),
    discount: parseMoney(r.chiet_khau), debt: parseMoney(r.cong_no),
    status: 'pending',
  })));
  return { batchId: batch!.id, code, rowCount: rows.length };
}

/* ---------- reconcile ---------- */
async function openCase(db: Db, ctx: Ctx, batchId: string, rowId: string, kind: string, detail: string) {
  await db.insert(ssReconciliationCases).values({ orgId: ctx.orgId, batchId, rowId, kind, detail, createdAt: nowOf(ctx) });
}

export async function reconcileBatch(db: Db, ctx: Ctx, p: { batchId: string }) {
  const batch = await getBatch(db, ctx, p.batchId);
  if (!['uploaded', 'reconciling'].includes(batch.status)) bad('BAD_STATUS', `Batch đang ${batch.status} — chỉ đối soát khi uploaded/reconciling`);
  const rows = await db.select().from(ssImportRows)
    .where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.batchId, batch.id), eq(ssImportRows.status, 'pending')));
  const custs = await db.select().from(ssCustomers).where(and(eq(ssCustomers.orgId, ctx.orgId), sql`${ssCustomers.status} <> 'merged'`));
  const byCode = new Map(custs.map((c) => [c.code, c]));
  const byPhone = new Map(custs.filter((c) => c.phone).map((c) => [c.phone!, c]));
  const byNameNorm = new Map(custs.map((c) => [c.nameNorm, c]));

  const raws = await db.select().from(ssImportRawRows).where(and(eq(ssImportRawRows.orgId, ctx.orgId), eq(ssImportRawRows.batchId, batch.id)));
  const rawOf = new Map(raws.map((r) => [r.rowNo, r.raw as Record<string, unknown>]));

  const seenDup = new Set<string>();
  let matched = 0, exceptions = 0;
  for (const row of rows) {
    const raw = rawOf.get(row.rowNo) ?? {};
    // 1) sanity tiền
    if (BigInt(row.saleAmount) < 0n) {
      await db.update(ssImportRows).set({ status: 'exception', exceptionKind: 'amount_mismatch' }).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.id, row.id)));
      await openCase(db, ctx, batch.id, row.id, 'amount_mismatch', `Dòng ${row.rowNo}: doanh thu âm ${fmtV(row.saleAmount)}đ`);
      exceptions++; continue;
    }
    // 2) trùng trong batch: (phone|tên)+tiền+ngày
    const dupKey = `${row.phone ?? vnNorm(row.buyerName ?? row.shopName ?? '')}|${row.saleAmount}|${raw.ngay ?? ''}`;
    if (seenDup.has(dupKey)) {
      await db.update(ssImportRows).set({ status: 'exception', exceptionKind: 'duplicate' }).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.id, row.id)));
      await openCase(db, ctx, batch.id, row.id, 'duplicate', `Dòng ${row.rowNo} trùng (SĐT/tên + tiền + ngày) với dòng trước trong batch`);
      exceptions++; continue;
    }
    seenDup.add(dupKey);
    // 3) match: mã > SĐT > tên
    let cust = null; let conf = 0;
    const code = (raw.ma_khach as string) ?? null;
    if (code && byCode.has(String(code).trim())) { cust = byCode.get(String(code).trim())!; conf = 1.0; }
    else if (row.phone && byPhone.has(row.phone)) { cust = byPhone.get(row.phone)!; conf = 0.9; }
    else {
      const names = [row.buyerName, row.shopName].filter(Boolean).map((n) => vnNorm(n!));
      for (const n of names) {
        if (byNameNorm.has(n)) { cust = byNameNorm.get(n)!; conf = 0.8; break; }
      }
      if (!cust) {
        for (const n of names) {
          const hit = custs.find((c) => n && (c.nameNorm.includes(n) || n.includes(c.nameNorm)));
          if (hit) { cust = hit; conf = 0.6; break; }
        }
      }
    }
    if (cust && conf >= 0.8) {
      await db.update(ssImportRows).set({ matchedCustomerId: cust.id, confidence: conf.toFixed(2), status: 'ok' }).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.id, row.id)));
      matched++;
    } else if (cust) {
      await db.update(ssImportRows).set({ matchedCustomerId: cust.id, confidence: conf.toFixed(2), status: 'exception', exceptionKind: 'low_confidence' }).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.id, row.id)));
      await openCase(db, ctx, batch.id, row.id, 'low_confidence', `Dòng ${row.rowNo}: match mờ "${row.buyerName ?? row.shopName}" → ${cust.name} (conf ${conf})`);
      exceptions++;
    } else {
      await db.update(ssImportRows).set({ status: 'exception', exceptionKind: 'missing_customer' }).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.id, row.id)));
      await openCase(db, ctx, batch.id, row.id, 'missing_customer', `Dòng ${row.rowNo}: không tìm thấy khách "${row.buyerName ?? row.shopName ?? row.phone ?? '?'}"`);
      exceptions++;
    }
  }
  const openCases = await countOpenCases(db, ctx, batch.id);
  const status = openCases === 0 ? 'ready' : 'reconciling';
  await db.update(ssImportBatches).set({ status, exceptionCount: openCases, updatedAt: nowOf(ctx) })
    .where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batch.id)));
  return { batchId: batch.id, matched, exceptions, openCases, status };
}

async function countOpenCases(db: Db, ctx: Ctx, batchId: string): Promise<number> {
  return (await db.select({ n: sql<number>`count(*)::int` }).from(ssReconciliationCases)
    .where(and(eq(ssReconciliationCases.orgId, ctx.orgId), eq(ssReconciliationCases.batchId, batchId), eq(ssReconciliationCases.status, 'open'))))[0]!.n;
}

export async function getBatch(db: Db, ctx: Ctx, id: string) {
  const rows = await db.select().from(ssImportBatches).where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, id)));
  if (!rows[0]) bad('BATCH_NOT_FOUND', `Không tìm thấy batch ${id}`);
  return rows[0]!;
}

/* ---------- xử lý ngoại lệ ---------- */
export async function resolveRow(db: Db, ctx: Ctx, p: { rowId: string; action: 'match' | 'accept' | 'void'; customerId?: string; note?: string }) {
  const rows = await db.select().from(ssImportRows).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.id, p.rowId)));
  if (!rows[0]) bad('ROW_NOT_FOUND', 'Không tìm thấy dòng import');
  const row = rows[0]!;
  if (row.status !== 'exception') bad('NOT_EXCEPTION', `Dòng ${row.rowNo} đang ${row.status} — chỉ xử lý dòng exception`);
  let patch: Record<string, unknown>;
  if (p.action === 'match') {
    if (!p.customerId) bad('CUSTOMER_REQUIRED', 'action=match cần customerId');
    await getCustomer(db, ctx, p.customerId!);
    patch = { matchedCustomerId: p.customerId, confidence: '1.00', status: 'resolved', exceptionKind: null };
  } else if (p.action === 'accept') {
    if (!row.matchedCustomerId) bad('NO_CANDIDATE', 'Dòng này không có ứng viên để accept — dùng match kèm customerId');
    patch = { status: 'resolved', exceptionKind: null };
  } else {
    patch = { status: 'voided' };
  }
  await db.update(ssImportRows).set(patch).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.id, row.id)));
  await db.update(ssReconciliationCases)
    .set({ status: p.action === 'void' ? 'voided' : 'resolved', resolution: p.note ?? p.action, resolvedBy: ctx.userId, resolvedAt: nowOf(ctx) })
    .where(and(eq(ssReconciliationCases.orgId, ctx.orgId), eq(ssReconciliationCases.rowId, row.id), eq(ssReconciliationCases.status, 'open')));
  const open = await countOpenCases(db, ctx, row.batchId);
  await db.update(ssImportBatches)
    .set({ exceptionCount: open, status: open === 0 ? 'ready' : 'reconciling', updatedAt: nowOf(ctx) })
    .where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, row.batchId)));
  return { rowId: row.id, action: p.action, openCasesLeft: open };
}

/* ---------- split & confirm ---------- */
/** Tính thuần (KHÔNG ghi) — dùng cho preview dry-run. */
export async function computeSplitData(db: Db, ctx: Ctx, p: { batchId: string }) {
  const batch = await getBatch(db, ctx, p.batchId);
  const rows = await db.select().from(ssImportRows).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.batchId, batch.id)));
  const good = rows.filter((r) => ['ok', 'resolved'].includes(r.status));
  const excep = rows.filter((r) => r.status === 'exception');
  const sum = (f: (r: typeof rows[number]) => string, set: typeof rows) => set.reduce((a, r) => addV(a, f(r)), ZERO);
  const cats = [
    { category: 'revenue', amount: sum((r) => r.saleAmount, good), rowCount: good.length },
    { category: 'ship', amount: sum((r) => r.shipFee, good), rowCount: good.length },
    { category: 'deposit', amount: sum((r) => r.deposit, good), rowCount: good.length },
    { category: 'discount', amount: sum((r) => r.discount, good), rowCount: good.length },
    { category: 'debt', amount: sum((r) => r.debt, good), rowCount: good.length },
    { category: 'suspense', amount: sum((r) => r.saleAmount, excep), rowCount: excep.length },
  ];
  return { batch, cats };
}

export async function computeSplit(db: Db, ctx: Ctx, p: { batchId: string }) {
  const { batch, cats } = await computeSplitData(db, ctx, p);
  for (const cat of cats) {
    await db.insert(ssSplitResults)
      .values({ orgId: ctx.orgId, batchId: batch.id, category: cat.category, amount: cat.amount, rowCount: cat.rowCount })
      .onConflictDoUpdate({
        target: [ssSplitResults.orgId, ssSplitResults.batchId, ssSplitResults.category],
        set: { amount: cat.amount, rowCount: cat.rowCount },
      });
  }
  return { batchId: batch.id, code: batch.code, split: cats };
}

export async function splitConfirm(db: Db, ctx: Ctx, p: { batchId: string }) {
  const batch = await getBatch(db, ctx, p.batchId);
  if (batch.status === 'confirmed') bad('ALREADY_CONFIRMED', `Batch ${batch.code} đã chốt rồi`);
  if (batch.status === 'void') bad('BATCH_VOID', 'Batch đã hủy');
  const open = await countOpenCases(db, ctx, batch.id);
  if (open > 0) bad('OPEN_CASES', `Còn ${open} case đối soát chưa xử lý — giải quyết hết (import.row-resolve) rồi mới chốt`);
  const { split } = await computeSplit(db, ctx, p);
  const g = (k: string) => split.find((s) => s.category === k)!.amount;
  await db.update(ssSplitResults).set({ confirmed: true })
    .where(and(eq(ssSplitResults.orgId, ctx.orgId), eq(ssSplitResults.batchId, batch.id)));
  await db.insert(ssAgencyStatements).values({
    orgId: ctx.orgId, agencyCustomerId: batch.sourceCustomerId, batchId: batch.id, period: batch.period,
    revenue: g('revenue'), ship: g('ship'), deposit: g('deposit'), discount: g('discount'), debtDelta: g('debt'),
    confirmedBy: ctx.userId, confirmedAt: nowOf(ctx),
  }).onConflictDoNothing({ target: [ssAgencyStatements.orgId, ssAgencyStatements.batchId] });
  await db.update(ssImportBatches).set({ status: 'confirmed', updatedAt: nowOf(ctx) })
    .where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batch.id)));
  await ctx.emit?.('soulsale.reconciliation.completed', {
    batch_id: batch.id, code: batch.code, period: batch.period,
    agency_customer_id: batch.sourceCustomerId, revenue: g('revenue'), suspense: g('suspense'),
  });
  return { batchId: batch.id, code: batch.code, status: 'confirmed', split };
}

export async function voidBatch(db: Db, ctx: Ctx, p: { batchId: string; reason: string }) {
  const batch = await getBatch(db, ctx, p.batchId);
  if (batch.status === 'confirmed') bad('ALREADY_CONFIRMED', 'Batch đã chốt — không hủy được (làm batch điều chỉnh kỳ sau)');
  await db.update(ssImportRows).set({ status: 'voided' })
    .where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.batchId, batch.id), inArray(ssImportRows.status, ['pending', 'exception', 'ok', 'resolved'])));
  await db.update(ssReconciliationCases).set({ status: 'voided', resolution: p.reason, resolvedBy: ctx.userId, resolvedAt: nowOf(ctx) })
    .where(and(eq(ssReconciliationCases.orgId, ctx.orgId), eq(ssReconciliationCases.batchId, batch.id), eq(ssReconciliationCases.status, 'open')));
  await db.update(ssImportBatches).set({ status: 'void', exceptionCount: 0, updatedAt: nowOf(ctx) })
    .where(and(eq(ssImportBatches.orgId, ctx.orgId), eq(ssImportBatches.id, batch.id)));
  return { batchId: batch.id, status: 'void', reason: p.reason };
}

/* ---------- reads ---------- */
export async function batchStatus(db: Db, ctx: Ctx, p?: { batchId?: string; period?: string; limit?: number }) {
  if (p?.batchId) {
    const batch = await getBatch(db, ctx, p.batchId);
    const rows = await db.select().from(ssImportRows).where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.batchId, batch.id)));
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    return { batch, rowsByStatus: byStatus, openCases: await countOpenCases(db, ctx, batch.id) };
  }
  const conds = [eq(ssImportBatches.orgId, ctx.orgId)];
  if (p?.period) conds.push(eq(ssImportBatches.period, p.period));
  const batches = await db.select().from(ssImportBatches).where(and(...conds)).limit(p?.limit ?? 20);
  return { batches: batches.map((b) => ({ id: b.id, code: b.code, period: b.period, status: b.status, rowCount: b.rowCount, exceptionCount: b.exceptionCount })) };
}

export async function reconciliationExceptions(db: Db, ctx: Ctx, p?: { batchId?: string; status?: string; limit?: number }) {
  const conds = [eq(ssReconciliationCases.orgId, ctx.orgId)];
  if (p?.batchId) conds.push(eq(ssReconciliationCases.batchId, p.batchId));
  conds.push(eq(ssReconciliationCases.status, p?.status ?? 'open'));
  const cases = await db.select().from(ssReconciliationCases).where(and(...conds)).limit(p?.limit ?? 50);
  return cases.map((cs) => ({ id: cs.id, batchId: cs.batchId, rowId: cs.rowId, kind: cs.kind, detail: cs.detail, status: cs.status }));
}
