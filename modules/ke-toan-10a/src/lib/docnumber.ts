import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./db.js";
import { docCounters } from "../schema/audit.js";
import { docNumberSettings } from "../schema/docsettings.js";
import { ValidationError } from "./errors.js";
import type { Ctx } from "./context.js";

/** Tiền tố số chứng từ mặc định theo loại (khớp quy ước Misa PT/PC...). */
const PREFIX: Record<string, string> = {
  RECEIPT: "PT", // Phiếu thu
  PAYMENT: "PC", // Phiếu chi
  INVOICE: "HD", // Hoá đơn bán
  BILL: "HDM", // Hoá đơn mua
  JOURNAL: "BT", // Bút toán
  ADV: "TU", // Tạm ứng
};

export interface DocNumberFormat {
  prefix: string;
  pad: number;
  format: string;
}

const DEFAULT_FORMAT = "{prefix}-{year}-{seq}";

/** V12 ⑤ — Đọc cấu hình format per-org (null nếu org dùng mặc định). */
export async function getDocNumberSetting(
  db: Database,
  ctx: Ctx,
  docType: string,
): Promise<DocNumberFormat | null> {
  const rows = await db
    .select()
    .from(docNumberSettings)
    .where(and(eq(docNumberSettings.orgId, ctx.orgId), eq(docNumberSettings.docType, docType)))
    .limit(1);
  const s = rows[0];
  return s ? { prefix: s.prefix, pad: s.pad, format: s.format } : null;
}

/** V12 ⑤ — Ghi cấu hình format per-org (upsert). Validate placeholder. */
export async function setDocNumberSetting(
  db: Database,
  ctx: Ctx,
  docType: string,
  input: { prefix?: string; pad?: number; format?: string },
): Promise<DocNumberFormat> {
  const prefix = (input.prefix ?? PREFIX[docType] ?? docType).trim();
  const pad = input.pad ?? 6;
  const format = (input.format ?? DEFAULT_FORMAT).trim();
  if (!prefix || prefix.length > 12) throw new ValidationError("Tiền tố 1-12 ký tự");
  if (pad < 1 || pad > 10) throw new ValidationError("Số chữ số sequence phải từ 1 đến 10");
  if (!format.includes("{seq}")) throw new ValidationError("Format phải chứa {seq}");
  if (format.length > 60) throw new ValidationError("Format tối đa 60 ký tự");
  const leftover = format
    .replace(/\{prefix\}|\{year\}|\{yy\}|\{month\}|\{seq\}/g, "")
    .match(/[{}]/);
  if (leftover) throw new ValidationError("Format chỉ hỗ trợ {prefix} {year} {yy} {month} {seq}");

  await db
    .insert(docNumberSettings)
    .values({ orgId: ctx.orgId, docType, prefix, pad, format })
    .onConflictDoUpdate({
      target: [docNumberSettings.orgId, docNumberSettings.docType],
      set: { prefix, pad, format, updatedAt: new Date() },
    });
  return { prefix, pad, format };
}

function render(fmt: DocNumberFormat, docType: string, year: number, counter: number, docDate?: string): string {
  const month = docDate ? docDate.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, "0");
  return fmt.format
    .replaceAll("{prefix}", fmt.prefix)
    .replaceAll("{year}", String(year))
    .replaceAll("{yy}", String(year).slice(-2))
    .replaceAll("{month}", month)
    .replaceAll("{seq}", counter.toString().padStart(fmt.pad, "0"));
}

/**
 * Sinh số chứng từ tuần tự, an toàn với concurrency.
 * Dùng UPSERT + atomic increment để không bao giờ trùng số trong cùng org.
 * Định dạng mặc định: <PREFIX>-<YEAR>-<000123>; org có thể tùy chỉnh qua
 * doc_number_settings (V12 ⑤ — format per-org, placeholder {prefix}{year}{yy}{month}{seq}).
 *
 * LƯU Ý: hàm này phải chạy TRONG cùng transaction với việc tạo chứng từ,
 * nếu không sẽ có khoảng trống số khi transaction rollback.
 */
export async function nextDocNumber(
  db: Database,
  ctx: Ctx,
  docType: keyof typeof PREFIX,
  year: number = new Date().getFullYear(),
  docDate?: string,
): Promise<string> {
  // Atomic upsert: nếu chưa có counter thì tạo với giá trị 1, có rồi thì +1.
  const rows = await db
    .insert(docCounters)
    .values({ orgId: ctx.orgId, docType, year, counter: 1 })
    .onConflictDoUpdate({
      target: [docCounters.orgId, docCounters.docType, docCounters.year],
      set: { counter: sql`${docCounters.counter} + 1`, updatedAt: new Date() },
    })
    .returning({ counter: docCounters.counter });

  const counter = rows[0]?.counter ?? 1;
  const custom = await getDocNumberSetting(db, ctx, docType);
  const fmt: DocNumberFormat = custom ?? { prefix: PREFIX[docType] ?? docType, pad: 6, format: DEFAULT_FORMAT };
  return render(fmt, docType, year, counter, docDate);
}

/**
 * V12 ⑤ — Chốt số chứng từ: nếu user nhập tay (manualDocNo) thì validate +
 * CHECK TRÙNG qua checkDup rồi dùng luôn (không tăng counter); nếu không thì
 * sinh tự động qua nextDocNumber. Gọi TRONG transaction tạo chứng từ.
 */
export async function resolveDocNumber(
  db: Database,
  ctx: Ctx,
  docType: keyof typeof PREFIX,
  opts: {
    year?: number;
    docDate?: string;
    manualDocNo?: string;
    /** Kiểm tra tồn tại số CT trong bảng đích (per-org). Trả true nếu ĐÃ TỒN TẠI. */
    checkDup: (docNo: string) => Promise<boolean>;
  },
): Promise<string> {
  const manual = opts.manualDocNo?.trim();
  if (manual) {
    if (manual.length > 40) throw new ValidationError("Số chứng từ tối đa 40 ký tự");
    if (!/^[A-Za-z0-9\-_/.]+$/.test(manual)) {
      throw new ValidationError("Số chứng từ chỉ gồm chữ, số và - _ / .");
    }
    if (await opts.checkDup(manual)) {
      throw new ValidationError(`Số chứng từ "${manual}" đã tồn tại — chọn số khác`);
    }
    return manual;
  }
  return nextDocNumber(db, ctx, docType, opts.year, opts.docDate);
}

/** Xem giá trị counter hiện tại mà không tăng (phục vụ báo cáo). */
export async function peekDocNumber(
  db: Database,
  ctx: Ctx,
  docType: keyof typeof PREFIX,
  year: number = new Date().getFullYear(),
): Promise<number> {
  const rows = await db
    .select({ counter: docCounters.counter })
    .from(docCounters)
    .where(
      and(
        eq(docCounters.orgId, ctx.orgId),
        eq(docCounters.docType, docType),
        eq(docCounters.year, year),
      ),
    )
    .limit(1);
  return rows[0]?.counter ?? 0;
}
