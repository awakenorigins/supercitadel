/**
 * SOUL-RESTAURANT — sinh mã chứng từ ngắn, dễ đọc miệng qua bộ đàm/bếp.
 * Base32 chống nhầm lẫn (bỏ 0/O, 1/I/L, U/V khó phân biệt khi in nhiệt) —
 * cùng triết lý token 13 ký tự của Citadel (§06).
 * Unique thật sự do UNIQUE(org_id, code) ở DB bảo đảm.
 */
import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';

function rand(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
  return out;
}

function ymd(d = new Date()): string {
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** DH-250706-K7QX (đơn/order) · BILL-… · KOT-… · RSV-… */
export function genCode(prefix: 'DH' | 'BILL' | 'KOT' | 'RSV'): string {
  return `${prefix}-${ymd()}-${rand(4)}`;
}
