import { and, asc, eq, ilike, or } from "drizzle-orm";
import type { Database } from "../lib/db.js";
import type { Ctx } from "../lib/context.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError } from "../lib/errors.js";
import { contacts, type Contact } from "../schema/contacts.js";
import { invoices } from "../schema/documents.js";
import * as Money from "../lib/money.js";
import type { ContactType } from "../types/index.js";

export interface CreateContactInput {
  code?: string;
  name: string;
  type?: ContactType;
  taxCode?: string;
  phone?: string;
  email?: string;
  address?: string;
  creditLimit?: string;
  paymentTermDays?: number;
}

export class ContactsService {
  constructor(private readonly db: Database) {}

  async create(ctx: Ctx, input: CreateContactInput): Promise<Contact> {
    const code = input.code ?? (await this.autoCode(ctx, input.type ?? "CUSTOMER"));
    const [contact] = await this.db
      .insert(contacts)
      .values({
        orgId: ctx.orgId,
        code,
        name: input.name,
        type: input.type ?? "CUSTOMER",
        taxCode: input.taxCode,
        phone: input.phone,
        email: input.email,
        address: input.address,
        creditLimit: input.creditLimit ?? "0",
        paymentTermDays: input.paymentTermDays ?? 0,
        createdBy: ctx.actor,
      })
      .returning();
    await writeAudit(this.db, ctx, {
      action: "contact.create",
      entityType: "contact",
      entityId: contact!.id,
      detail: { name: input.name, code },
    });
    return contact!;
  }

  async list(
    ctx: Ctx,
    filter?: { type?: ContactType; search?: string },
  ): Promise<Contact[]> {
    const conds = [eq(contacts.orgId, ctx.orgId)];
    if (filter?.type) conds.push(eq(contacts.type, filter.type));
    if (filter?.search) {
      const s = `%${filter.search}%`;
      const searchCond = or(
        ilike(contacts.name, s),
        ilike(contacts.code, s),
        ilike(contacts.phone, s),
      );
      if (searchCond) conds.push(searchCond);
    }
    return this.db
      .select()
      .from(contacts)
      .where(and(...conds))
      .orderBy(asc(contacts.name));
  }

  async getById(ctx: Ctx, id: string): Promise<Contact> {
    const [c] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.orgId, ctx.orgId)))
      .limit(1);
    if (!c) throw new NotFoundError("đối tác", id);
    return c;
  }

  /** Tìm theo tên gần đúng (cho Tiểu Tâm khi người dùng nói tên khách). */
  async findByName(ctx: Ctx, name: string): Promise<Contact | null> {
    const [c] = await this.db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.orgId, ctx.orgId), ilike(contacts.name, `%${name}%`)),
      )
      .limit(1);
    return c ?? null;
  }

  /** Cập nhật hạn mức tín dụng / điều khoản thanh toán / thông tin đối tác. */
  async update(
    ctx: Ctx,
    id: string,
    patch: Partial<{ creditLimit: string; paymentTermDays: number; phone: string; email: string; address: string; isActive: boolean }>,
  ): Promise<Contact> {
    const [row] = await this.db
      .update(contacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.orgId, ctx.orgId)))
      .returning();
    if (!row) throw new NotFoundError("đối tác", id);
    await writeAudit(this.db, ctx, {
      action: "contact.update",
      entityType: "contact",
      entityId: id,
      detail: patch,
    });
    return row;
  }

  /**
   * Kiểm tra hạn mức tín dụng: tổng công nợ hiện tại + số tiền hóa đơn mới có
   * vượt creditLimit không. creditLimit=0 → không giới hạn. Trả về trạng thái
   * (không tự chặn — để nơi gọi quyết định cảnh báo/chặn).
   */
  async checkCreditLimit(
    ctx: Ctx,
    contactId: string,
    additionalAmount: string,
  ): Promise<{ hasLimit: boolean; limit: string; currentOutstanding: string; afterThis: string; exceeded: boolean; available: string }> {
    const contact = await this.getById(ctx, contactId);
    const limit = contact.creditLimit;
    const hasLimit = Money.compare(limit, "0") > 0;

    // Công nợ hiện tại = Σ (total − amountPaid) các hóa đơn bán POSTED của đối tác.
    const rows = await this.db
      .select({ total: invoices.total, paid: invoices.amountPaid })
      .from(invoices)
      .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.contactId, contactId), eq(invoices.status, "POSTED")));
    let currentOutstanding = "0";
    for (const r of rows) {
      const o = Money.sub(r.total, r.paid);
      if (Money.compare(o, "0") > 0) currentOutstanding = Money.add(currentOutstanding, o);
    }
    const afterThis = Money.add(currentOutstanding, additionalAmount);
    const exceeded = hasLimit && Money.compare(afterThis, limit) > 0;
    const available = hasLimit ? Money.sub(limit, currentOutstanding) : "0";
    return { hasLimit, limit, currentOutstanding, afterThis, exceeded, available };
  }

  private async autoCode(ctx: Ctx, type: ContactType): Promise<string> {
    const prefix = type === "VENDOR" ? "NCC" : "KH";
    const rows = await this.db
      .select({ code: contacts.code })
      .from(contacts)
      .where(and(eq(contacts.orgId, ctx.orgId), eq(contacts.type, type)));
    return `${prefix}${(rows.length + 1).toString().padStart(4, "0")}`;
  }
}
