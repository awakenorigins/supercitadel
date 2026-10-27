/**
 * SOUL-INVENTORY v2.0 — docnumber.service
 * Số chứng từ tuần tự theo org + loại (hấp thụ pattern Kế Toán 10A).
 *   PNK-000001  Phiếu nhập kho (01-VT)
 *   PXK-000001  Phiếu xuất kho (02-VT)
 *   KK-000001   Biên bản kiểm kê (05-VT)
 *   LSX-000001  Lệnh lắp ráp (sản xuất)
 *   LTD-000001  Lệnh tháo dỡ
 *   LC-000001   Chứng từ landed cost
 *   SCR-000001  Phiếu hủy hàng hỏng
 * Atomic: INSERT ... ON CONFLICT DO UPDATE last_no = last_no + 1 RETURNING —
 * một câu SQL duy nhất, không race giữa các request cùng org.
 */
import { sql } from 'drizzle-orm';
import type { KhoCtx } from '../types.js';

export type DocType = 'PNK' | 'PXK' | 'KK' | 'LSX' | 'LTD' | 'LC' | 'SCR';

export async function nextDocNo(ctx: KhoCtx, docType: DocType): Promise<string> {
  const res = await ctx.db.execute<{ last_no: string }>(sql`
    INSERT INTO kho_doc_counters (org_id, doc_type, last_no)
    VALUES (${ctx.orgId}, ${docType}, 1)
    ON CONFLICT (org_id, doc_type)
    DO UPDATE SET last_no = kho_doc_counters.last_no + 1
    RETURNING last_no
  `);
  const rows = ('rows' in res ? (res as unknown as { rows: Array<{ last_no: string }> }).rows : res) as Array<{ last_no: string }>;
  const n = rows[0]?.last_no ?? '1';
  return `${docType}-${String(n).padStart(6, '0')}`;
}
