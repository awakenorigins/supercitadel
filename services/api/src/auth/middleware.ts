// Auth & RBAC middleware for Hono. Attaches tenant-scoped identity to context.
import type { Context, Next } from 'hono';
import { verifyJwt } from './jwt.js';
import { Errors, ROLE_RANK, type Role, type JwtPayload } from '@citadel/core';

// Hono context var typing
declare module 'hono' {
  interface ContextVariableMap {
    auth: JwtPayload;
  }
}

/** Requires a valid Bearer JWT. Sets c.var.auth (incl. orgId for tenant scoping). */
export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) throw Errors.unauthorized('Thiếu Bearer token');
  try {
    const payload = await verifyJwt(header.slice(7));
    c.set('auth', payload);
  } catch {
    throw Errors.unauthorized('Token không hợp lệ hoặc hết hạn');
  }
  await next();
}

/** Requires the authed user to have at least `min` role rank. Use AFTER requireAuth. */
export function requireRole(min: Role) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth');
    if (!auth) throw Errors.unauthorized();
    if (ROLE_RANK[auth.role] < ROLE_RANK[min])
      throw Errors.forbidden(`Cần quyền ${min} trở lên`);
    await next();
  };
}

/** Helper: the tenant id for the current request. NEVER read org from request body. */
export function orgOf(c: Context): string {
  return c.get('auth').orgId;
}
