/**
 * SOUL-WALLET 1A — Tools & Actions cho Tiểu Tâm (mặt cắt ⑥)
 *
 * Hai lớp theo chuẩn SuperCitadel v10.0.1 + dry-run protocol:
 *   - READ TOOLS  (kind:'tool')   — tra cứu, gọi tự do, KHÔNG sensitive
 *   - WRITE ACTIONS (kind:'action') — đụng vào TIỀN:
 *       · sensitive:true + securityLevel 2 — host thực thi qua executeAction:
 *         lượt 1 chưa confirm → DRY-RUN preview (không ghi DB),
 *         lượt 2 {confirm:true} → execute thật
 *       · handler CHỈ lo nghiệp vụ + trả message tiếng Việt sẵn
 *         (Tiểu Tâm đọc lại message, không tự soạn số liệu — chống bịa)
 *
 * Mỗi định nghĩa: name + kind + permission + securityLevel + sensitive
 * + inputSchema (Zod, validate tại biên ⑦) + docs + handler.
 */
import { z, type ZodType } from 'zod';
import type { SwCtx } from '../types.js';
import {
  accountCreateSchema, accountCloseSchema,
  txCreateSchema, txReverseSchema, transferSchema, txSearchSchema,
  budgetUpsertSchema, budgetStatusSchema,
  goalCreateSchema, goalContributeSchema,
  debtCreateSchema, debtPaySchema, debtListSchema,
  recurringUpsertSchema, recurringUpcomingSchema,
  ruleUpsertSchema, importCommitSchema,
  monthSchema, candlesSchema, runwaySchema, anomalyScanSchema,
} from '../validation/schemas.js';
import { createAccount, closeAccount } from '../services/account.service.js';
import { createTx, reverseTx, searchTx } from '../services/transaction.service.js';
import { upsertBudget, sixJarsApply, budgetStatus, createGoal, contributeGoal, goalStatus } from '../services/budget.service.js';
import { createDebt, payDebt, listDebts, debtAging } from '../services/debt.service.js';
import { upsertRecurring, upcomingRecurring } from '../services/recurring.service.js';
import { upsertRule } from '../services/rule.service.js';
import { commitImport } from '../services/import.service.js';
import { anomalyScan, forecastRunway, candlesData } from '../services/analytics.service.js';
import { executiveSummary, cashflowReport, networthReport, narrateExecutive } from '../services/reports.service.js';

export type ToolKind = 'tool' | 'action';
export type SecurityLevel = 1 | 2;

export interface SwToolDefinition<S extends ZodType = ZodType> {
  /** Định danh — trùng docs/TIEU-TAM-ACTIONS.md */
  name: string;
  /** 'tool' = đọc (tự do) · 'action' = ghi (dry-run→confirm phía host) */
  kind: ToolKind;
  /** Quyền module.resource.action (mặt cắt ③ — PERMISSION_REGISTRY) */
  permission: string;
  securityLevel: SecurityLevel;
  /** true → host bắt buộc dry-run preview trước, confirm mới chạy */
  sensitive: boolean;
  description: string;
  inputSchema: S;
  docs: string;
  handler(ctx: SwCtx, rawInput: unknown): Promise<unknown>;
}

const fmt = (v: string | number) => Number(v).toLocaleString('vi-VN');

function tool<S extends ZodType>(d: Omit<SwToolDefinition<S>, 'kind' | 'securityLevel' | 'sensitive'> &
  Partial<Pick<SwToolDefinition<S>, 'securityLevel' | 'sensitive'>>): SwToolDefinition<S> {
  return { kind: 'tool', securityLevel: 1, sensitive: false, ...d };
}
function action<S extends ZodType>(d: Omit<SwToolDefinition<S>, 'kind' | 'securityLevel' | 'sensitive'> &
  Partial<Pick<SwToolDefinition<S>, 'securityLevel' | 'sensitive'>>): SwToolDefinition<S> {
  return { kind: 'action', securityLevel: 2, sensitive: true, ...d };
}

// ═══════════════════════ READ TOOLS (12) ═══════════════════════
export const swReadTools: SwToolDefinition[] = [
  tool({
    name: 'sw.summary', permission: 'sw.report.read',
    description: 'Bức tranh tài chính cá nhân 1 màn hình: tài sản ròng, tiền lỏng, thu-chi tháng, top chi, ngân sách nguy hiểm, nợ, runway, bất thường.',
    inputSchema: monthSchema, docs: 'GET /wallet/reports/executive',
    handler: async (ctx, raw) => executiveSummary(ctx, monthSchema.parse(raw ?? {}).month),
  }),
  tool({
    name: 'sw.cashflow', permission: 'sw.report.read',
    description: 'Dòng tiền tháng: waterfall đầu kỳ→thu→chi→cuối kỳ, nến số dư theo ngày, heatmap ngày đốt tiền.',
    inputSchema: monthSchema, docs: 'GET /wallet/reports/cashflow',
    handler: async (ctx, raw) => cashflowReport(ctx, monthSchema.parse(raw ?? {}).month),
  }),
  tool({
    name: 'sw.tx.search', permission: 'sw.tx.read',
    description: 'Tìm giao dịch theo khoảng ngày, loại, ví, danh mục, đối tác, memo, khoảng tiền, trạng thái.',
    inputSchema: txSearchSchema, docs: 'POST /wallet/transactions/search',
    handler: async (ctx, raw) => searchTx(ctx, txSearchSchema.parse(raw ?? {})),
  }),
  tool({
    name: 'sw.budget.status', permission: 'sw.budget.read',
    description: 'Trạng thái mọi ngân sách/hũ kỳ này: đã tiêu, còn lại, %, dự phóng cuối kỳ, cờ nguy cơ vượt.',
    inputSchema: budgetStatusSchema, docs: 'GET /wallet/budgets/status',
    handler: async (ctx, raw) => budgetStatus(ctx, budgetStatusSchema.parse(raw ?? {}).period),
  }),
  tool({
    name: 'sw.goal.status', permission: 'sw.goal.read',
    description: 'Tiến độ các hũ mục tiêu tiết kiệm: đã gom, %, hạn chót, còn bao nhiêu ngày.',
    inputSchema: z.object({}), docs: 'GET /wallet/goals',
    handler: async (ctx) => goalStatus(ctx),
  }),
  tool({
    name: 'sw.debt.list', permission: 'sw.debt.read',
    description: 'Sổ nợ: ai nợ mình / mình nợ ai, gốc, đã trả, còn lại, lãi cộng dồn, quá hạn bao nhiêu ngày.',
    inputSchema: debtListSchema, docs: 'GET /wallet/debts',
    handler: async (ctx, raw) => listDebts(ctx, debtListSchema.parse(raw ?? {})),
  }),
  tool({
    name: 'sw.debt.aging', permission: 'sw.debt.read',
    description: 'Aging công nợ 5 bucket (0-7 / 8-30 / 31-60 / 61-90 / 90+ ngày quá hạn) chia receivable/payable.',
    inputSchema: debtListSchema.pick({ as_of: true }), docs: 'GET /wallet/debts/aging',
    handler: async (ctx, raw) => debtAging(ctx, debtListSchema.pick({ as_of: true }).parse(raw ?? {}).as_of),
  }),
  tool({
    name: 'sw.networth', permission: 'sw.report.read',
    description: 'Tài sản ròng hiện tại + chuỗi 6 tháng: tài sản, nợ phải trả, net.',
    inputSchema: monthSchema, docs: 'GET /wallet/reports/networth',
    handler: async (ctx, raw) => networthReport(ctx, monthSchema.parse(raw ?? {}).month),
  }),
  tool({
    name: 'sw.recurring.upcoming', permission: 'sw.recurring.read',
    description: 'Các khoản định kỳ/subscription sắp trừ tiền trong N ngày, kèm cờ tăng giá âm thầm.',
    inputSchema: recurringUpcomingSchema, docs: 'GET /wallet/recurring/upcoming',
    handler: async (ctx, raw) => upcomingRecurring(ctx, recurringUpcomingSchema.parse(raw ?? {}).days),
  }),
  tool({
    name: 'sw.anomaly.scan', permission: 'sw.report.read',
    description: 'Soi bất thường: giao dịch lớn lệch chuẩn, danh mục tăng vọt, nghi trùng, subscription tăng giá, payee lạ chi đậm. CHỈ đề xuất.',
    inputSchema: anomalyScanSchema, docs: 'GET /wallet/insights/anomalies',
    handler: async (ctx, raw) => anomalyScan(ctx, anomalyScanSchema.parse(raw ?? {}).lookback_days),
  }),
  tool({
    name: 'sw.forecast.runway', permission: 'sw.report.read',
    description: 'Dự báo runway: burn rate trọng số 30/90 ngày + recurring sắp tới → còn cầm cự bao nhiêu ngày, số dư dự phóng.',
    inputSchema: runwaySchema, docs: 'GET /wallet/insights/runway',
    handler: async (ctx, raw) => forecastRunway(ctx, runwaySchema.parse(raw ?? {}).horizon_days),
  }),
  tool({
    name: 'sw.report.narrate', permission: 'sw.report.read',
    description: 'Thuật lại tình hình ví tháng bằng tiếng Việt gọn (kèm data) — dùng khi người dùng hỏi "tháng này tiêu sao rồi".',
    inputSchema: monthSchema, docs: 'GET /wallet/reports/narrate',
    handler: async (ctx, raw) => narrateExecutive(ctx, monthSchema.parse(raw ?? {}).month),
  }),
];

// ═══════════════════════ WRITE ACTIONS (13) ═══════════════════════
const budgetActionSchema = budgetUpsertSchema.partial({ name: true, amount: true }).extend({
  /** Có mặt → áp preset 6 Hũ từ thu nhập tháng, bỏ qua các field budget đơn lẻ */
  six_jars_income: z.union([z.string(), z.number()]).optional(),
});

export const swWriteActions: SwToolDefinition[] = [
  action({
    name: 'sw.account.create', permission: 'sw.account.write',
    description: 'Tạo ví/tài khoản mới: tiền mặt, bank, ví điện tử, thẻ tín dụng (ngày sao kê/hạn trả), sổ tiết kiệm (kỳ hạn/lãi suất).',
    inputSchema: accountCreateSchema, docs: 'POST /wallet/accounts',
    handler: async (ctx, raw) => {
      const i = accountCreateSchema.parse(raw);
      const acc = await createAccount(ctx, i);
      return { ok: true, message: `Đã tạo ví "${acc.name}" (${acc.type}), số dư mở ${fmt(String(acc.openingBalance))}đ.`, data: acc };
    },
  }),
  action({
    name: 'sw.account.close', permission: 'sw.account.write',
    description: 'Đóng (archive) một ví. Bắt buộc số dư = 0, trừ khi force:true.',
    inputSchema: accountCloseSchema, docs: 'POST /wallet/accounts/close',
    handler: async (ctx, raw) => {
      const i = accountCloseSchema.parse(raw);
      const r = await closeAccount(ctx, i);
      return { ok: true, message: `Đã đóng ví "${r.name}" (số dư lúc đóng ${fmt(r.closed_balance)}đ).`, data: r };
    },
  }),
  action({
    name: 'sw.tx.create', permission: 'sw.tx.write',
    description: 'Ghi giao dịch: thu (income), chi (expense), hoàn tiền (refund), phí (fee). Hỗ trợ tách splits nhiều danh mục, tags, đính kèm.',
    inputSchema: txCreateSchema, docs: 'POST /wallet/transactions',
    handler: async (ctx, raw) => {
      const i = txCreateSchema.parse(raw);
      const tx = await createTx(ctx, i);
      const verb = i.kind === 'income' ? 'thu' : i.kind === 'refund' ? 'hoàn' : 'chi';
      return { ok: true, message: `Đã ghi ${verb} ${fmt(i.amount)}đ (${tx.docNo})${i.memo ? ` — ${i.memo}` : ''}.`, data: tx };
    },
  }),
  action({
    name: 'sw.tx.reverse', permission: 'sw.tx.write',
    description: 'ĐẢO một giao dịch đã ghi (hủy đúng chuẩn sổ kép — sinh bút toán ngược, không xóa).',
    inputSchema: txReverseSchema, docs: 'POST /wallet/transactions/reverse',
    handler: async (ctx, raw) => {
      const i = txReverseSchema.parse(raw);
      const rev = await reverseTx(ctx, i.id, i.reason);
      return { ok: true, message: `Đã đảo giao dịch — bút toán đảo ${rev.docNo}, số dư trở về như trước.`, data: rev };
    },
  }),
  action({
    name: 'sw.transfer.create', permission: 'sw.tx.write',
    description: 'Chuyển tiền giữa 2 ví của chính chủ (rút ATM, nạp ví điện tử, trả thẻ tín dụng).',
    inputSchema: transferSchema, docs: 'POST /wallet/transfer',
    handler: async (ctx, raw) => {
      const i = transferSchema.parse(raw);
      const tx = await createTx(ctx, {
        kind: 'transfer', occurred_at: i.occurred_at, account_id: i.from_account_id,
        counter_account_id: i.to_account_id, amount: i.amount, memo: i.memo, status: 'posted',
      } as never);
      return { ok: true, message: `Đã chuyển ${fmt(i.amount)}đ giữa 2 ví (${tx.docNo}).`, data: tx };
    },
  }),
  action({
    name: 'sw.budget.upsert', permission: 'sw.budget.write',
    description: 'Tạo/sửa ngân sách envelope theo danh mục, hoặc truyền six_jars_income để áp trọn preset 6 Hũ (NEC55/FFA10/EDU10/LTS10/PLAY10/GIVE5).',
    inputSchema: budgetActionSchema, docs: 'POST /wallet/budgets · /wallet/budgets/six-jars',
    handler: async (ctx, raw) => {
      const i = budgetActionSchema.parse(raw);
      if (i.six_jars_income !== undefined) {
        const r = await sixJarsApply(ctx, { monthly_income: i.six_jars_income, period: i.period } as never);
        return { ok: true, message: `Đã chia ${fmt(String(r.monthly_income))}đ vào 6 Hũ kỳ ${r.period.slice(0, 7)}: ${r.jars.map((j) => `${j.jar} ${fmt(j.amount)}đ`).join(' · ')}.`, data: r };
      }
      if (!i.name || i.amount === undefined) throw new Error('Cần name + amount (hoặc six_jars_income)');
      const b = await upsertBudget(ctx, i as never);
      return { ok: true, message: `Đã lưu ngân sách "${b.name}" ${fmt(String(b.amount))}đ/kỳ${b.rollover ? ' (rollover)' : ''}.`, data: b };
    },
  }),
  action({
    name: 'sw.goal.create', permission: 'sw.goal.write',
    description: 'Tạo hũ mục tiêu tiết kiệm (tên, số tiền đích, hạn chót).',
    inputSchema: goalCreateSchema, docs: 'POST /wallet/goals',
    handler: async (ctx, raw) => {
      const i = goalCreateSchema.parse(raw);
      const g = await createGoal(ctx, i);
      return { ok: true, message: `Đã tạo hũ mục tiêu "${g.name}" — đích ${fmt(String(g.target))}đ${i.deadline ? `, hạn ${i.deadline}` : ''}.`, data: g };
    },
  }),
  action({
    name: 'sw.goal.contribute', permission: 'sw.goal.write',
    description: 'Nạp tiền vào hũ mục tiêu. Kèm from_account_id → tự sinh giao dịch chi từ ví đó.',
    inputSchema: goalContributeSchema, docs: 'POST /wallet/goals/contribute',
    handler: async (ctx, raw) => {
      const i = goalContributeSchema.parse(raw);
      const r = await contributeGoal(ctx, i);
      return {
        ok: true,
        message: `Đã nạp ${fmt(i.amount)}đ vào hũ "${r.name}" — gom được ${fmt(r.saved)}/${fmt(r.target)}đ${r.reached ? ' 🎉 ĐẠT MỤC TIÊU!' : ''}.`,
        data: r,
      };
    },
  }),
  action({
    name: 'sw.debt.create', permission: 'sw.debt.write',
    description: 'Ghi khoản nợ: receivable (người ta nợ mình) / payable (mình nợ). Kèm account_id → sinh giao dịch dòng tiền gốc.',
    inputSchema: debtCreateSchema, docs: 'POST /wallet/debts',
    handler: async (ctx, raw) => {
      const i = debtCreateSchema.parse(raw);
      const d = await createDebt(ctx, i);
      const who = i.direction === 'receivable' ? 'cho vay' : 'vay';
      return { ok: true, message: `Đã ghi khoản ${who} ${fmt(i.principal)}đ${i.due_date ? `, hạn ${i.due_date}` : ''}${i.interest_rate ? `, lãi ${i.interest_rate}%/năm` : ''}.`, data: d };
    },
  }),
  action({
    name: 'sw.debt.pay', permission: 'sw.debt.write',
    description: 'Ghi trả/thu nợ một phần hoặc toàn bộ. Kèm account_id → sinh giao dịch dòng tiền.',
    inputSchema: debtPaySchema, docs: 'POST /wallet/debts/pay',
    handler: async (ctx, raw) => {
      const i = debtPaySchema.parse(raw);
      const r = await payDebt(ctx, i);
      return { ok: true, message: `Đã ghi ${fmt(i.amount)}đ — còn lại ${fmt(r.remaining)}đ${r.settled ? ' ✅ TẤT TOÁN.' : '.'}`, data: r };
    },
  }),
  action({
    name: 'sw.recurring.upsert', permission: 'sw.recurring.write',
    description: 'Tạo/sửa khoản định kỳ: subscription/hóa đơn/thu nhập lặp. auto_post=true tự ghi, false sinh draft chờ duyệt.',
    inputSchema: recurringUpsertSchema, docs: 'POST /wallet/recurring',
    handler: async (ctx, raw) => {
      const i = recurringUpsertSchema.parse(raw);
      const r = await upsertRecurring(ctx, i);
      return { ok: true, message: `Đã lưu định kỳ "${r.name}" ${fmt(String(r.amount))}đ/${r.freq}, kỳ tới ${String(r.nextRunAt)}${r.autoPost ? ' (tự ghi)' : ' (draft chờ duyệt)'}.`, data: r };
    },
  }),
  action({
    name: 'sw.rule.upsert', permission: 'sw.rule.write', securityLevel: 1, sensitive: false,
    description: 'Tạo/sửa rule tự phân loại (memo/payee chứa từ khóa, khoảng tiền → gắn danh mục/đối tác/tags). Không đụng tiền — chỉ metadata.',
    inputSchema: ruleUpsertSchema, docs: 'POST /wallet/rules',
    handler: async (ctx, raw) => {
      const i = ruleUpsertSchema.parse(raw);
      const r = await upsertRule(ctx, i);
      return { ok: true, message: `Đã lưu rule "${r.name}" (priority ${r.priority}).`, data: r };
    },
  }),
  action({
    name: 'sw.import.commit', permission: 'sw.import.run',
    description: 'Commit phiên import sao kê đã preview: ghi các dòng hợp lệ thành giao dịch, mặc định bỏ qua dòng trùng.',
    inputSchema: importCommitSchema, docs: 'POST /wallet/import/commit',
    handler: async (ctx, raw) => {
      const i = importCommitSchema.parse(raw);
      const r = await commitImport(ctx, i);
      return { ok: true, message: `Import xong: ${r.imported} giao dịch vào sổ, ${r.skipped} dòng bỏ qua (trùng/lỗi).`, data: r };
    },
  }),
];

export const swTools: SwToolDefinition[] = [...swReadTools, ...swWriteActions];
export function getSwTool(name: string): SwToolDefinition | undefined {
  return swTools.find((t) => t.name === name);
}
export { candlesData };
