import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import { writeAudit } from "../lib/audit.js";
import { ValidationError } from "../lib/errors.js";
import { AccountsService } from "./accounts.service.js";
import { ContactsService } from "./contacts.service.js";
import type { AccountType, ContactType } from "../types/index.js";

/** Parse CSV tối giản (hỗ trợ dấu phẩy, ngoặc kép, xuống dòng trong ô). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const VALID_ACCOUNT_TYPES = new Set(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);
const TYPE_ALIAS: Record<string, AccountType> = {
  "tài sản": "ASSET",
  "taisan": "ASSET",
  "nợ phải trả": "LIABILITY",
  "no phai tra": "LIABILITY",
  "vốn chủ": "EQUITY",
  "von chu": "EQUITY",
  "doanh thu": "INCOME",
  "chi phí": "EXPENSE",
  "chi phi": "EXPENSE",
};

/**
 * ImportService — nhập danh mục từ CSV (onboarding nhanh). Validate TỪNG DÒNG;
 * mọi lỗi được gom trả về; dòng hợp lệ được tạo (idempotent theo mã).
 */
export class ImportService {
  private acc: AccountsService;
  private contacts: ContactsService;
  constructor(private readonly db: Database) {
    this.acc = new AccountsService(db);
    this.contacts = new ContactsService(db);
  }

  /**
   * Nhập hệ thống tài khoản. Cột: code, name, type, [normalBalance].
   * type nhận ASSET/.../EXPENSE hoặc nhãn tiếng Việt.
   */
  async importAccounts(
    ctx: Ctx,
    csv: string,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new ValidationError("CSV cần header + ≥1 dòng dữ liệu");
    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const iCode = idx("code") >= 0 ? idx("code") : idx("mã");
    const iName = idx("name") >= 0 ? idx("name") : idx("tên");
    const iType = idx("type") >= 0 ? idx("type") : idx("loại");
    if (iCode < 0 || iName < 0 || iType < 0) {
      throw new ValidationError("CSV tài khoản cần cột: code, name, type");
    }

    const errors: string[] = [];
    let created = 0;
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]!;
      const code = (r[iCode] ?? "").trim();
      const name = (r[iName] ?? "").trim();
      let typeRaw = (r[iType] ?? "").trim();
      const type = (VALID_ACCOUNT_TYPES.has(typeRaw.toUpperCase())
        ? typeRaw.toUpperCase()
        : TYPE_ALIAS[typeRaw.toLowerCase()]) as AccountType | undefined;
      if (!code || !name) {
        errors.push(`Dòng ${i + 1}: thiếu mã hoặc tên`);
        continue;
      }
      if (!type) {
        errors.push(`Dòng ${i + 1}: loại "${typeRaw}" không hợp lệ (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE)`);
        continue;
      }
      const existing = await this.acc.findByCode(ctx, code);
      if (existing) {
        skipped++;
        continue;
      }
      try {
        await this.acc.create(ctx, { code, name, type });
        created++;
      } catch (e) {
        errors.push(`Dòng ${i + 1}: ${(e as Error).message}`);
      }
    }
    await writeAudit(this.db, ctx, { action: "import.accounts", entityType: "account", detail: { created, skipped, errors: errors.length } });
    return { created, skipped, errors };
  }

  /**
   * Nhập đối tác. Cột: name, [type], [taxCode], [phone], [email], [creditLimit].
   * type: CUSTOMER/VENDOR/BOTH (mặc định CUSTOMER).
   */
  async importContacts(
    ctx: Ctx,
    csv: string,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new ValidationError("CSV cần header + ≥1 dòng dữ liệu");
    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const iName = idx("name") >= 0 ? idx("name") : idx("tên");
    const iType = idx("type") >= 0 ? idx("type") : idx("loại");
    const iTax = idx("taxcode") >= 0 ? idx("taxcode") : idx("mã số thuế");
    const iPhone = idx("phone") >= 0 ? idx("phone") : idx("sđt");
    const iEmail = idx("email");
    const iLimit = idx("creditlimit") >= 0 ? idx("creditlimit") : idx("hạn mức");
    if (iName < 0) throw new ValidationError("CSV đối tác cần ít nhất cột: name");

    const typeOf = (v: string): ContactType => {
      const u = v.trim().toUpperCase();
      if (u === "VENDOR" || u.includes("NCC") || u.includes("CUNG CẤP")) return "VENDOR";
      if (u === "BOTH" || u.includes("CẢ")) return "BOTH";
      return "CUSTOMER";
    };

    const errors: string[] = [];
    let created = 0;
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]!;
      const name = (r[iName] ?? "").trim();
      if (!name) {
        errors.push(`Dòng ${i + 1}: thiếu tên đối tác`);
        continue;
      }
      const existing = await this.contacts.findByName(ctx, name);
      if (existing) {
        skipped++;
        continue;
      }
      const creditLimit = iLimit >= 0 ? String(Math.round(Number((r[iLimit] ?? "0").replace(/[^\d.]/g, "")) || 0)) : "0";
      try {
        await this.contacts.create(ctx, {
          name,
          type: iType >= 0 ? typeOf(r[iType] ?? "") : "CUSTOMER",
          taxCode: iTax >= 0 ? (r[iTax] ?? "").trim() || undefined : undefined,
          phone: iPhone >= 0 ? (r[iPhone] ?? "").trim() || undefined : undefined,
          email: iEmail >= 0 ? (r[iEmail] ?? "").trim() || undefined : undefined,
          creditLimit,
        });
        created++;
      } catch (e) {
        errors.push(`Dòng ${i + 1}: ${(e as Error).message}`);
      }
    }
    await writeAudit(this.db, ctx, { action: "import.contacts", entityType: "contact", detail: { created, skipped, errors: errors.length } });
    return { created, skipped, errors };
  }
}
