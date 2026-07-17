/**
 * QLDN V1A — F6: Chi lương (payout batch UNC) + Phiếu lương (payslip snapshot)
 * + Thanh toán CTV/gia công/công tác phí (gross-up 10%).
 *
 * Nguồn Excel:
 *  - Sheet "STK": danh sách STK + tổng thực lĩnh → payout batch chuyển khoản
 *  - Sheet "Bảng TT CTV": gross = net/0.9 (gross-up), PIT khấu trừ 10% = gross−net
 *    (verify Trần Kiều Ánh Ly: net 7.000.000 → gross 7.777.778 → PIT 777.778)
 *  - Sheet "Phiếu lương"/"phieuluong": payslip render từ dòng lương → snapshot bất biến
 */
import { and, eq } from 'drizzle-orm';
import { AppError } from '@citadel/core';
import {
  employees, periods, payrollRuns, payrollLines,
  payoutBatches, payslips, contractorPayments,
} from './schema.js';
import { getRun } from './payroll.js';

const invalid = (msg: string) => new AppError('VALIDATION' as any, msg, 400);
const N = (v: unknown): number => Number(v ?? 0);
const r0 = (x: number) => Math.round(Number(x.toFixed(4)));

// ---------- CTV / GIA CÔNG / CÔNG TÁC PHÍ ----------
/** Gross-up từ net: gross = net / (1 − rate); PIT = gross − net. Khớp Excel TT CTV. */
export function grossUpFromNet(net: number, pitBp = 1000): { gross: number; pit: number } {
  const gross = net / (1 - pitBp / 10000);
  return { gross: r0(gross), pit: r0(gross - net) };
}

/** PIT khấu trừ từ gross: pit = gross × rate; net = gross − pit. */
export function withholdFromGross(gross: number, pitBp = 1000): { pit: number; net: number } {
  const pit = r0(gross * pitBp / 10000);
  return { pit, net: r0(gross - pit) };
}

export async function createContractorPayment(db: any, orgId: string, b: any) {
  const contractorName = String(b?.contractorName ?? '').trim();
  if (!contractorName) throw invalid('contractorName bắt buộc');
  const kind = ['ctv', 'gia_cong', 'cong_tac'].includes(b?.kind) ? b.kind : 'ctv';
  const pitBp = Number.isInteger(b?.pitBp) ? b.pitBp : 1000;

  let gross: number, pit: number, net: number;
  if (b?.netAmount !== undefined && b?.grossAmount === undefined) {
    // Nhập theo NET (kiểu Excel Joli Poli: thỏa thuận thực nhận) → gross-up
    net = N(b.netAmount);
    if (net <= 0) throw invalid('netAmount phải > 0');
    ({ gross, pit } = grossUpFromNet(net, pitBp));
  } else {
    gross = N(b?.grossAmount);
    if (gross <= 0) throw invalid('Cần grossAmount hoặc netAmount > 0');
    ({ pit, net } = withholdFromGross(gross, pitBp));
  }
  // Công tác phí: không khấu trừ thuế (phí hoàn, không phải thu nhập)
  if (kind === 'cong_tac') { gross = gross || net; pit = 0; net = gross; }

  let periodId: string | null = null;
  if (b?.period) {
    const p = await db.select().from(periods)
      .where(and(eq(periods.orgId, orgId), eq(periods.code, String(b.period)))).limit(1);
    if (!p.length) throw invalid(`Chưa có kỳ ${b.period}`);
    periodId = p[0].id;
  }
  const [row] = await db.insert(contractorPayments).values({
    orgId, periodId, contractorName,
    taxCode: b?.taxCode ?? null, idNumber: b?.idNumber ?? null,
    kind, qty: b?.qty !== undefined ? String(b.qty) : null,
    unitPrice: b?.unitPrice !== undefined ? String(b.unitPrice) : null,
    grossAmount: String(gross), pitWithheld: String(pit), netAmount: String(net),
    paidAt: b?.paidAt ?? null, note: b?.note ?? null,
  }).returning();
  return row;
}

export async function listContractorPayments(db: any, orgId: string, periodCode?: string) {
  if (periodCode) {
    const p = await db.select().from(periods)
      .where(and(eq(periods.orgId, orgId), eq(periods.code, periodCode))).limit(1);
    if (!p.length) return [];
    return db.select().from(contractorPayments)
      .where(and(eq(contractorPayments.orgId, orgId), eq(contractorPayments.periodId, p[0].id)));
  }
  return db.select().from(contractorPayments).where(eq(contractorPayments.orgId, orgId));
}

// ---------- PAYOUT BATCH (UNC ngân hàng) ----------
export interface PayoutLine {
  employeeId: string; code: string | null; fullName: string;
  bankAccount: string | null; bankName: string | null; amount: number;
}

/**
 * Tạo batch chi lương từ run đã DUYỆT (approved): gom net_pay > 0 + STK từ hồ sơ NV.
 * NV thiếu STK → vẫn vào batch với bankAccount null + đếm missingBank (trả tiền mặt).
 */
export async function createPayoutBatch(db: any, orgId: string, b: any, createdBy?: string) {
  const runId = String(b?.runId ?? '').trim();
  if (!runId) throw invalid('runId bắt buộc');
  const run = await getRun(db, orgId, runId);
  if (run.status !== 'approved' && run.status !== 'paid') throw invalid('Chỉ tạo batch chi lương từ bảng lương ĐÃ DUYỆT');

  const lines = await db.select().from(payrollLines)
    .where(and(eq(payrollLines.orgId, orgId), eq(payrollLines.runId, runId)));
  if (!lines.length) throw invalid('Bảng lương chưa có dòng nào');

  const payout: PayoutLine[] = [];
  let total = 0, missingBank = 0;
  for (const l of lines) {
    const net = N(l.netPay);
    if (net <= 0) continue;
    const emp = (await db.select().from(employees)
      .where(and(eq(employees.orgId, orgId), eq(employees.id, l.employeeId))).limit(1))[0];
    if (!emp) continue;
    if (!emp.bankAccount) missingBank++;
    payout.push({
      employeeId: emp.id, code: emp.codeOfficial ?? emp.codeInternal,
      fullName: emp.fullName, bankAccount: emp.bankAccount, bankName: emp.bankName,
      amount: net,
    });
    total += net;
  }
  const [batch] = await db.insert(payoutBatches).values({
    orgId, runId, lines: payout, totalAmount: String(total),
    status: 'draft', createdBy: createdBy ?? null,
    bankFileRef: b?.bankFileRef ?? null,
  }).returning();
  return { batch, summary: { lines: payout.length, totalAmount: total, missingBank } };
}

export async function listPayoutBatches(db: any, orgId: string, runId?: string) {
  const cond = runId
    ? and(eq(payoutBatches.orgId, orgId), eq(payoutBatches.runId, runId))
    : eq(payoutBatches.orgId, orgId);
  return db.select().from(payoutBatches).where(cond);
}

export async function markBatchStatus(db: any, orgId: string, batchId: string, status: string) {
  if (!['draft', 'exported', 'paid'].includes(status)) throw invalid('status phải là draft|exported|paid');
  const [row] = await db.update(payoutBatches).set({ status })
    .where(and(eq(payoutBatches.orgId, orgId), eq(payoutBatches.id, batchId))).returning();
  if (!row) throw invalid('Không tìm thấy batch');
  return row;
}

// ---------- PAYSLIP (phiếu lương snapshot bất biến) ----------
/**
 * Sinh payslips cho toàn bộ dòng của run ĐÃ DUYỆT.
 * Snapshot chứa toàn bộ dòng lương + info NV tại thời điểm chốt — về sau
 * hồ sơ NV/lương đổi cũng không ảnh hưởng phiếu đã phát.
 */
export async function generatePayslips(db: any, orgId: string, runId: string) {
  const run = await getRun(db, orgId, runId);
  if (run.status !== 'approved' && run.status !== 'paid') throw invalid('Chỉ phát phiếu lương từ bảng lương ĐÃ DUYỆT');
  const period = (await db.select().from(periods)
    .where(and(eq(periods.orgId, orgId), eq(periods.id, run.periodId))).limit(1))[0];
  const lines = await db.select().from(payrollLines)
    .where(and(eq(payrollLines.orgId, orgId), eq(payrollLines.runId, runId)));

  return db.transaction(async (tx: any) => {
    let created = 0, skipped = 0;
    for (const l of lines) {
      const emp = (await tx.select().from(employees)
        .where(and(eq(employees.orgId, orgId), eq(employees.id, l.employeeId))).limit(1))[0];
      if (!emp) continue;
      const existing = await tx.select().from(payslips).where(and(
        eq(payslips.orgId, orgId), eq(payslips.runId, runId), eq(payslips.employeeId, l.employeeId),
      )).limit(1);
      if (existing.length) { skipped++; continue; } // phiếu đã phát = bất biến, không đè
      await tx.insert(payslips).values({
        orgId, runId, employeeId: l.employeeId, periodCode: period.code,
        snapshot: {
          employee: {
            code: emp.codeOfficial ?? emp.codeInternal, fullName: emp.fullName,
            position: emp.position, department: emp.department,
            contractType: emp.contractType, bankAccount: emp.bankAccount, bankName: emp.bankName,
          },
          period: period.code, scheme: run.scheme, standardDays: run.standardDays,
          line: l, generatedAt: new Date().toISOString(),
        },
      });
      created++;
    }
    return { created, skipped };
  });
}

export async function getPayslip(db: any, orgId: string, employeeId: string, periodCode: string) {
  const rows = await db.select().from(payslips).where(and(
    eq(payslips.orgId, orgId), eq(payslips.employeeId, employeeId), eq(payslips.periodCode, periodCode),
  ));
  return rows;
}

// ---------- APPROVE RUN (chuyển trạng thái + điểm nối outbox F7) ----------
export async function approveRun(db: any, orgId: string, runId: string, approvedBy: string) {
  const run = await getRun(db, orgId, runId);
  if (run.status !== 'calculated') throw invalid(`Bảng lương đang ${run.status} — chỉ duyệt được khi đã calculated`);
  const [row] = await db.update(payrollRuns).set({
    status: 'approved', approvedBy, approvedAt: new Date(),
  }).where(and(eq(payrollRuns.orgId, orgId), eq(payrollRuns.id, runId))).returning();
  return row;
}
