// Progressive Security lớp 2 (V7A P1 — G5).
// Lớp 1 = token 13 ký tự. Lớp 2 = đã gắn email hoặc SĐT. Hành động nhạy cảm đòi lớp 2.
import type { Context, MiddlewareHandler, Next } from 'hono';
import { and, eq } from 'drizzle-orm';
import { Errors, type JwtPayload } from '@citadel/core';
import { users } from '@citadel/db';

/** Ngưỡng chi Om được coi là nhạy cảm (chi > ngưỡng đòi lớp 2). */
export const SENSITIVE_OM_THRESHOLD = 1000;

export const SECURITY_UPGRADE_HINT =
  'Hành động nhạy cảm — cần bảo mật lớp 2. Vào Cài đặt → Bảo mật để gắn email hoặc số điện thoại (30 giây).';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^(?:\+84|0)\d{8,10}$/;

function computeLevel(email: string | null, phone: string | null): number {
  return email || phone ? 2 : 1;
}

async function userOf(db: any, auth: JwtPayload) {
  const [u] = await db.select().from(users).where(and(eq(users.id, auth.sub), eq(users.orgId, auth.orgId)));
  return u ?? null;
}

/** security_level hiện tại của người gọi (1 nếu chưa có hồ sơ). */
export async function securityLevelOf(db: any, auth: JwtPayload): Promise<number> {
  const u = await userOf(db, auth);
  return u?.securityLevel ?? 1;
}

export async function bindEmail(db: any, auth: JwtPayload, raw: string) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw Errors.validation('Email không hợp lệ — ví dụ: ten@congty.vn', 'email');
  const u = await userOf(db, auth);
  if (!u) throw Errors.validation('Chưa có hồ sơ người dùng — hãy đặt tên tài khoản trước');
  const level = Math.max(u.securityLevel ?? 1, computeLevel(email, u.phone));
  const [row] = await db.update(users).set({ email, securityLevel: level })
    .where(and(eq(users.id, auth.sub), eq(users.orgId, auth.orgId))).returning();
  return { email: row.email, securityLevel: row.securityLevel };
}

export async function bindPhone(db: any, auth: JwtPayload, raw: string) {
  const phone = String(raw ?? '').replace(/[\s.-]/g, '');
  if (!PHONE_RE.test(phone)) throw Errors.validation('Số điện thoại không hợp lệ — ví dụ: 0912345678 hoặc +84912345678', 'phone');
  const u = await userOf(db, auth);
  if (!u) throw Errors.validation('Chưa có hồ sơ người dùng — hãy đặt tên tài khoản trước');
  const level = Math.max(u.securityLevel ?? 1, computeLevel(u.email, phone));
  const [row] = await db.update(users).set({ phone, securityLevel: level })
    .where(and(eq(users.id, auth.sub), eq(users.orgId, auth.orgId))).returning();
  return { phone: row.phone, securityLevel: row.securityLevel };
}

/** Gate hành động nhạy cảm: đòi security_level >= min (mặc định 2). 403 kèm hướng dẫn tiếng Việt. */
export function requireSecurityLevel(db: any, min = 2): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth') as JwtPayload;
    const level = await securityLevelOf(db, auth);
    if (level < min) throw Errors.forbidden(SECURITY_UPGRADE_HINT);
    await next();
  };
}

/** Check dạng hàm (cho luồng có điều kiện, vd chi Om > ngưỡng). Throw 403 nếu chưa đủ lớp. */
export async function assertSecurityLevel(db: any, auth: JwtPayload, min = 2): Promise<void> {
  const level = await securityLevelOf(db, auth);
  if (level < min) throw Errors.forbidden(SECURITY_UPGRADE_HINT);
}

/** Thông tin bảo mật kèm nhắc nhở chủ động khi ví có giá trị mà chưa lên lớp 2. */
export async function securityInfo(db: any, auth: JwtPayload, omBalance: number) {
  const u = await userOf(db, auth);
  const level = u?.securityLevel ?? 1;
  const needsUpgrade = omBalance > 0 && level < 2;
  return {
    securityLevel: level,
    email: u?.email ?? null,
    phone: u?.phone ?? null,
    needsUpgrade,
    ...(needsUpgrade ? { upgradeHint: `Ví của bạn đang có ${omBalance} Om — hãy gắn email hoặc SĐT để bảo vệ tài khoản (Cài đặt → Bảo mật).` } : {}),
  };
}
