/**
 * Test CẦU NỐI TIỂU TÂM 10A — mô phỏng chính xác executeAction của host v8.5:
 * gate module → hasPermission(role, wildcard) → securityLevel (max của action
 * và registry meta) → sensitive không confirm ⇒ DRY-RUN (audit action_dryrun,
 * KHÔNG ghi DB) → confirm ⇒ execute thật.
 */
import { randomUUID } from "node:crypto";
import { getDb } from "../src/lib/db.js";
import { KetoanServices } from "../src/services/index.js";
import { seedChartOfAccounts } from "../src/seed.js";
import { userCtx } from "../src/lib/context.js";
import * as Money from "../src/lib/money.js";
import {
  keToan10aTieuTamActions,
  detectK10aAction,
  KE_TOAN_10A_PERMISSIONS,
  type K10aActionCtx,
  type K10aTieuTamAction,
  type K10aRole,
} from "../src/tieu-tam-actions.js";

let passed = 0,
  failed = 0;
function check(cond: boolean, name: string, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

/* ---- Bản sao logic host v8.5 (mini executeAction) ---- */
const ROLE_PERMS: Record<K10aRole, readonly string[]> = {
  super_admin: ["*"],
  owner: ["*"],
  manager: ["ke-toan-10a.*"],
  staff: ["ke-toan-10a.report.read"],
};
const match = (g: string, p: string) => g === "*" || g === p || (g.endsWith(".*") && p.startsWith(g.slice(0, -1)));
const hasPerm = (role: K10aRole, p: string) => (ROLE_PERMS[role] ?? []).some((g) => match(g, p));
const META = new Map(KE_TOAN_10A_PERMISSIONS.map((p) => [p.key, p]));

async function hostExecute(
  reg: Map<string, K10aTieuTamAction>,
  ctx: K10aActionCtx,
  name: string,
  params: Record<string, unknown>,
  opts: { dryRun?: boolean; confirm?: boolean } = {},
) {
  const a = reg.get(name);
  if (!a) throw new Error(`Action không hợp lệ: ${name}`);
  // gate module: coi như đã kích hoạt (store-flow test riêng lo phần gate)
  if (!hasPerm(ctx.role, a.permission))
    return { ok: false, deny: "perm" as const, message: `Bạn chưa có quyền ${a.permission}.` };
  const need = Math.max(a.securityLevel, META.get(a.permission)?.securityLevel ?? 1);
  if (ctx.securityLevel < need)
    return { ok: false, deny: "level" as const, message: `Hành động này cần bảo mật lớp ${need}.` };
  if (opts.dryRun || (a.sensitive && !opts.confirm)) {
    await ctx.audit?.({ action: "tieu_tam.action_dryrun", detail: { action: a.name, params } });
    return {
      ok: true,
      dryRun: true as const,
      preview: { description: a.description, params, sensitive: a.sensitive },
      pendingAction: { name: a.name, params },
      message: `Xem trước hành động: ${a.description}.`,
    };
  }
  return a.execute(ctx, params ?? {});
}

async function main() {
  const db = getDb();
  const svc = new KetoanServices(db);
  const org = randomUUID();
  await seedChartOfAccounts(org, db);
  const sctx = userCtx(org, "tieu-tam");

  const defs = keToan10aTieuTamActions(db);
  const reg = new Map(defs.map((d) => [d.name, d]));
  const auditLog: Array<{ action: string; detail?: unknown }> = [];
  const mk = (role: K10aRole, level: number): K10aActionCtx => ({
    db,
    orgId: org,
    userId: "u-tt",
    role,
    securityLevel: level,
    audit: async (e) => {
      auditLog.push({ action: e.action, detail: e.detail });
    },
  });

  console.log("\n=== KHUÔN v8.5: đủ trường + registry quyền ===");
  check(defs.length === 17, "17 actions Tiểu Tâm", String(defs.length));
  check(
    defs.every((d) => d.permission && (d.securityLevel === 1 || d.securityLevel === 2) && typeof d.sensitive === "boolean" && d.requiredModule === "ke-toan-10a" && (d.parameters as any)?.type === "object"),
    "Mọi action đủ permission/securityLevel/sensitive/parameters JSON-schema",
  );
  check(defs.every((d) => META.has(d.permission)), "Mọi permission của action có trong KE_TOAN_10A_PERMISSIONS");
  check(KE_TOAN_10A_PERMISSIONS.every((p) => p.module === "ke-toan-10a"), "Registry: key tách module đúng 'ke-toan-10a'");
  const ids = defs.map((d) => d.name);
  check(new Set(ids).size === ids.length && ids.every((i) => i.startsWith("k10a.")), "Tên action k10a.* không trùng");

  console.log("\n=== RBAC + BẢO MẬT LỚP ===");
  const denyStaff = await hostExecute(reg, mk("staff", 2), "k10a.thu_tien", { soTien: 100000 });
  check(denyStaff.ok === false && (denyStaff as any).deny === "perm", "staff bị từ chối (thiếu quyền)");
  const denyLevel = await hostExecute(reg, mk("manager", 1), "k10a.thu_tien", { soTien: 100000 });
  check(denyLevel.ok === false && (denyLevel as any).deny === "level" && /lớp 2/.test((denyLevel as any).message), "manager lớp 1 bị chặn (cần lớp 2)");
  const staffRead = await hostExecute(reg, mk("staff", 1), "k10a.bao_cao_nhanh", {});
  check(staffRead.ok === true && !(staffRead as any).dryRun, "staff được xem báo cáo nhanh (report.read)");

  console.log("\n=== DRY-RUN → CONFIRM (không ghi DB khi preview) ===");
  const mgr = mk("manager", 2);
  auditLog.length = 0;
  const dry = await hostExecute(reg, mgr, "k10a.thu_tien", { soTien: 5000000, tenDoiTac: "Anh Ba" });
  check((dry as any).dryRun === true && (dry as any).pendingAction?.name === "k10a.thu_tien", "sensitive lượt 1 → dry-run + pendingAction");
  const receiptsAfterDry = await svc.receipts.list(sctx);
  check(receiptsAfterDry.length === 0, "dry-run KHÔNG ghi DB (0 phiếu thu)");
  check(auditLog.some((a) => a.action === "tieu_tam.action_dryrun") && !auditLog.some((a) => a.action === "tieu_tam.action"), "audit chỉ có action_dryrun, chưa có action thật");
  const confirmed = await hostExecute(reg, mgr, "k10a.thu_tien", { soTien: 5000000, tenDoiTac: "Anh Ba" }, { confirm: true });
  check(confirmed.ok === true && /PT-/.test(String((confirmed as any).data?.docNo)), "confirm → tạo phiếu thu thật", (confirmed as any).message);
  const receiptsAfter = await svc.receipts.list(sctx);
  check(receiptsAfter.length === 1, "confirm tạo đúng 1 phiếu");
  check(auditLog.some((a) => a.action === "tieu_tam.action"), "audit ghi tieu_tam.action khi chạy thật");

  console.log("\n=== NGHIỆP VỤ QUA CẦU NỐI ===");
  const hd = await hostExecute(reg, mgr, "k10a.hoa_don_ban", { tenKhach: "Công ty Mây", soTien: 10000000, thueSuat: "8" }, { confirm: true });
  check(hd.ok === true && Money.compare(String((hd as any).data?.total), "10800000.00") === 0, "Hóa đơn bán: tự tạo khách + tổng 10.8tr (thuế 8%)");
  const docNo = String((hd as any).data?.docNo);
  const thu = await hostExecute(reg, mgr, "k10a.thu_tien_hoa_don", { maHoaDon: docNo }, { confirm: true });
  check(thu.ok === true && /Còn nợ 0/.test((thu as any).message), "Thu tiền hóa đơn: knock-off hết nợ", (thu as any).message);

  const ns = await hostExecute(reg, mk("manager", 1), "k10a.dat_ngan_sach", { nam: "2026", taiKhoan: "642", soTien: 50000000 });
  check(ns.ok === true && !(ns as any).dryRun, "Đặt ngân sách (không nhạy cảm) → chạy thẳng, lớp 1 đủ");
  const bva = await hostExecute(reg, mk("staff", 1), "k10a.ngan_sach_thuc_te", { nam: "2026" });
  check(bva.ok === false, "staff không có budget.read → bị chặn đúng");
  const bva2 = await hostExecute(reg, mgr, "k10a.ngan_sach_thuc_te", { nam: "2026" });
  check(bva2.ok === true && /Ngân sách 2026/.test((bva2 as any).message), "Ngân sách vs thực tế đọc đúng");

  await hostExecute(reg, mgr, "k10a.tao_tscd", { ten: "Máy in", nguyenGia: 12000000, soThangKhauHao: 12, ngayBatDau: "2026-01-01" }, { confirm: true });
  const kh = await hostExecute(reg, mgr, "k10a.chay_khau_hao", { denNgay: "2026-03-15" }, { confirm: true });
  check(kh.ok === true && (kh as any).data?.posted === 3, "TSCĐ + chạy khấu hao 3 kỳ qua chat", JSON.stringify((kh as any).data?.posted));

  // Kết chuyển: tạo niên độ trước rồi confirm
  const fy = await svc.fiscal.create(sctx, { name: "2026", startDate: "2026-01-01", endDate: "2026-12-31" });
  const kc = await hostExecute(reg, mgr, "k10a.ket_chuyen", { maNienDo: "2026" }, { confirm: true });
  check(kc.ok === true && /kỳ đã khóa/.test((kc as any).message), "Kết chuyển + khóa năm qua chat", (kc as any).message);
  const tb = await svc.reports.trialBalance(sctx);
  check(tb.balanced, "Sổ vẫn cân sau chuỗi hành động Tiểu Tâm");

  console.log("\n=== DETECT REGEX (không giẫm acc.* module cũ) ===");
  const d1 = detectK10aAction("tạo phiếu thu 10a 500000 cho Anh Ba");
  check(d1?.name === "k10a.thu_tien" && d1.params.soTien === 500000 && d1.params.tenDoiTac === "Anh Ba", "Bắt 'phiếu thu 10a ... cho ...'", JSON.stringify(d1));
  check(detectK10aAction("tạo phiếu thu 500000 cho Anh Ba") === null, "Câu KHÔNG có '10a' → null (nhường module cũ)");
  const d3 = detectK10aAction("chạy khấu hao 10a tháng này");
  check(d3?.name === "k10a.chay_khau_hao", "Bắt 'khấu hao 10a'");
  const d4 = detectK10aAction("đối chiếu ngân hàng 10a");
  check(d4?.name === "k10a.doi_chieu_ngan_hang", "Bắt 'đối chiếu ngân hàng 10a'");

  console.log(`\n   KẾT QUẢ TIỂU TÂM 10A: ${passed} PASS, ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[TIEU-TAM]", e);
  process.exit(1);
});
