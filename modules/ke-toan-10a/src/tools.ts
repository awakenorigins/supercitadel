/**
 * Kế Toán 10A tools — AI read-tools đăng ký vào toolRegistry của host để
 * Tiểu Tâm ĐỌC dữ liệu kế toán trả lời câu hỏi. (Muốn Tiểu Tâm GHI — tạo phiếu —
 * xem actions ketoan.* trong actions/registry.ts, wiring vào tieu-tam/actions.ts.)
 */
import type { ToolDef } from "./contract.js";
import type { Ctx } from "./lib/context.js";
import { KetoanServices } from "./services/index.js";
import * as Money from "./lib/money.js";

const asCtx = (orgId: string): Ctx => ({ orgId, actor: "tieu-tam", source: "tieu-tam" });

export function keToan10aTools(db: any): ToolDef[] {
  const svc = new KetoanServices(db);
  return [
    {
      name: "ke_toan_10a.cash_position",
      module: "ke-toan-10a",
      description: "Xem tiền hiện có (111 tiền mặt + 112 ngân hàng) của tổ chức",
      requiresPermission: "ke-toan-10a:read",
      handler: async (_input, ctx) => {
        const d = await svc.reports.dashboard(asCtx(ctx.orgId));
        return { cash: d.cash, cashFormatted: Money.formatVND(d.cash) };
      },
    },
    {
      name: "ke_toan_10a.trial_balance",
      module: "ke-toan-10a",
      description: "Đọc bảng cân đối số phát sinh: tổng Nợ/Có toàn sổ, sổ có cân không",
      requiresPermission: "ke-toan-10a:read",
      handler: async (_input, ctx) => {
        const tb = await svc.reports.trialBalance(asCtx(ctx.orgId));
        return { balanced: tb.balanced, totalDebit: tb.totalDebit, totalCredit: tb.totalCredit, accounts: tb.rows.slice(0, 20) };
      },
    },
    {
      name: "ke_toan_10a.trial_balance_misa",
      module: "ke-toan-10a",
      description: "BẢNG CÂN ĐỐI TÀI KHOẢN 8 cột chuẩn Misa: dư đầu kỳ Nợ/Có, phát sinh trong kỳ Nợ/Có, lũy kế từ đầu năm, dư cuối kỳ — có TK cha-con. Input: from, to (YYYY-MM-DD, tùy chọn).",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: any, ctx) => {
        const tb = await svc.reports.trialBalanceMisa(asCtx(ctx.orgId), input?.from, input?.to);
        return { from: tb.from, to: tb.to, balanced: tb.balanced, totals: tb.totals, rows: tb.rows.slice(0, 40) };
      },
    },
    {
      name: "ke_toan_10a.general_journal",
      module: "ke-toan-10a",
      description: "SỔ NHẬT KÝ CHUNG: toàn bộ bút toán đã ghi sổ theo thời gian (ngày, số CT, diễn giải, TK Nợ/Có, số tiền). Dùng khi hỏi 'nhật ký chung', 'các bút toán tháng này'. Input: from, to (YYYY-MM-DD, tùy chọn).",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: any, ctx) => {
        const j = await svc.reports.generalJournal(asCtx(ctx.orgId), input?.from, input?.to, 100);
        return { count: j.count, totalDebit: j.totalDebit, totalCredit: j.totalCredit, entries: j.rows.slice(0, 30) };
      },
    },
    {
      name: "ke_toan_10a.profit_loss",
      module: "ke-toan-10a",
      description: "Đọc kết quả kinh doanh: doanh thu, chi phí, lãi/lỗ trong kỳ",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { from?: string; to?: string }, ctx) => {
        const pnl = await svc.reports.profitAndLoss(asCtx(ctx.orgId), input?.from, input?.to);
        return { totalIncome: pnl.totalIncome, totalExpense: pnl.totalExpense, netProfit: pnl.netProfit };
      },
    },
    {
      name: "ke_toan_10a.aging",
      module: "ke-toan-10a",
      description: "Đọc công nợ theo tuổi nợ — sales = phải thu, purchase = phải trả; ai nợ, quá hạn bao lâu",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { type?: "sales" | "purchase" }, ctx) => {
        const type = input?.type === "purchase" ? "purchase" : "sales";
        const a = await svc.reports.aging(asCtx(ctx.orgId), type);
        return { type, grandTotal: a.grandTotal, totals: a.totals, parties: a.parties.slice(0, 10) };
      },
    },
    {
      name: "ke_toan_10a.outstanding",
      module: "ke-toan-10a",
      description: "Đọc tổng công nợ theo đối tác (gộp mọi hoá đơn) — sales phải thu, purchase phải trả",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { type?: "sales" | "purchase" }, ctx) => {
        const type = input?.type === "purchase" ? "purchase" : "sales";
        const o = await svc.reports.outstandingByParty(asCtx(ctx.orgId), type);
        return { type, grandTotal: o.grandTotal, parties: o.parties.slice(0, 15) };
      },
    },
    {
      name: "ke_toan_10a.integrity",
      module: "ke-toan-10a",
      description: "Tự-audit toàn vẹn sổ: kiểm Σ Nợ=Σ Có toàn sổ, mỗi bút toán cân, không dòng mồ côi",
      requiresPermission: "ke-toan-10a:read",
      handler: async (_input, ctx) => svc.reports.integrityCheck(asCtx(ctx.orgId)),
    },
    {
      name: "ke_toan_10a.cash_flow",
      module: "ke-toan-10a",
      description: "Báo cáo lưu chuyển tiền tệ: dòng tiền từ hoạt động kinh doanh/đầu tư/tài chính, số dư đầu-cuối kỳ",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { from?: string; to?: string }, ctx) =>
        svc.vietnam.cashFlowStatement(asCtx(ctx.orgId), input?.from, input?.to),
    },
    {
      name: "ke_toan_10a.vat_declaration",
      module: "ke-toan-10a",
      description: "Tờ khai thuế GTGT: thuế đầu ra, đầu vào, số phải nộp/còn khấu trừ trong kỳ",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { from?: string; to?: string }, ctx) => {
        const v = await svc.vietnam.vatDeclaration(asCtx(ctx.orgId), input?.from, input?.to);
        return { outputVat: v.output.outputVat, inputVat: v.input.inputVat, vatPayable: v.vatPayable, carryForward: v.carryForward };
      },
    },
    {
      name: "ke_toan_10a.due_reminders",
      module: "ke-toan-10a",
      description: "Nhắc hạn công nợ: hoá đơn quá hạn và sắp tới hạn (phải thu/phải trả), để chủ động nhắc",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { type?: "sales" | "purchase" }, ctx) => {
        const type = input?.type === "purchase" ? "purchase" : "sales";
        const d = await svc.reports.dueReminders(asCtx(ctx.orgId), type);
        return { type, totalOverdue: d.totalOverdue, totalDueSoon: d.totalDueSoon, overdue: d.overdue.slice(0, 10), dueSoon: d.dueSoon.slice(0, 10) };
      },
    },
    {
      name: "ke_toan_10a.advances",
      module: "ke-toan-10a",
      description: "Xem các khoản tạm ứng/đặt cọc còn hiệu lực (khách đặt cọc, ứng NCC, tạm ứng nhân viên)",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { type?: "CUSTOMER_DEPOSIT" | "SUPPLIER_ADVANCE" | "EMPLOYEE_ADVANCE" }, ctx) => {
        const list = await svc.advances.list(asCtx(ctx.orgId), input?.type);
        return {
          count: list.length,
          advances: list.slice(0, 15).map((a) => ({
            docNo: a.docNo,
            type: a.type,
            amount: a.amount,
            applied: a.appliedAmount,
            partyName: a.partyName,
          })),
        };
      },
    },
    {
      name: "ke_toan_10a.recurring_due",
      module: "ke-toan-10a",
      description: "Xem các mẫu giao dịch định kỳ sắp/đã tới hạn cần chạy (tiền thuê, lương...)",
      requiresPermission: "ke-toan-10a:read",
      handler: async (_input, ctx) => {
        const list = await svc.recurring.list(asCtx(ctx.orgId));
        const today = new Date().toISOString().slice(0, 10);
        const due = list.filter((t) => t.isActive && t.nextRunDate <= today);
        return {
          totalActive: list.filter((t) => t.isActive).length,
          dueCount: due.length,
          due: due.map((t) => ({ name: t.name, kind: t.kind, nextRunDate: t.nextRunDate })),
        };
      },
    },
    {
      name: "ke_toan_10a.profit_by_dimension",
      module: "ke-toan-10a",
      description: "Lãi/lỗ theo bộ phận/dự án (cost center) — phân tích hiệu quả từng chiều",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { from?: string; to?: string }, ctx) => {
        const r = await svc.dimensions.profitByCostCenter(asCtx(ctx.orgId), input?.from, input?.to);
        return { rows: r.rows, unassigned: r.unassigned };
      },
    },
    {
      name: "ke_toan_10a.bank_reconciliation",
      module: "ke-toan-10a",
      description: "Trạng thái đối chiếu ngân hàng: số dư sổ vs sao kê, số dòng chưa khớp",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { account?: string }, ctx) => {
        const r = await svc.bank.reconciliationReport(asCtx(ctx.orgId), input?.account ?? "112");
        return { bookBalance: r.bookBalance, matchedCount: r.matchedCount, unmatchedCount: r.unmatchedCount, reconciled: r.reconciled, unmatched: r.unmatched.slice(0, 10) };
      },
    },
    {
      name: "ke_toan_10a.assets",
      module: "ke-toan-10a",
      description: "Danh sách tài sản cố định: nguyên giá, hao mòn lũy kế, giá trị còn lại",
      requiresPermission: "ke-toan-10a:read",
      handler: async (_input, ctx) => {
        const list = await svc.assets.list(asCtx(ctx.orgId));
        return {
          count: list.length,
          assets: list.slice(0, 20).map((a) => ({
            code: a.code,
            name: a.name,
            cost: a.cost,
            accumulated: a.accumulatedDepreciation,
            netValue: (Number(a.cost) - Number(a.accumulatedDepreciation)).toFixed(2),
            status: a.status,
          })),
        };
      },
    },
    {
      name: "ke_toan_10a.budget_status",
      module: "ke-toan-10a",
      description: "Dự toán vs thực tế: tài khoản nào sắp/đã vượt ngân sách trong năm",
      requiresPermission: "ke-toan-10a:read",
      handler: async (input: { year?: string }, ctx) => {
        const year = input?.year ?? String(new Date().getFullYear());
        const r = await svc.budget.budgetVsActual(asCtx(ctx.orgId), year);
        return {
          year,
          totalBudget: r.totalBudget,
          totalActual: r.totalActual,
          overBudget: r.rows.filter((x) => x.overBudget),
          topUsage: r.rows.slice(0, 10),
        };
      },
    },
  ];
}
