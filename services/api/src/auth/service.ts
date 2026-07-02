// Auth service — login: match a 13-char token against stored hashes, issue JWT.
import { eq, and, isNull } from 'drizzle-orm';
import { tokens, users } from '@citadel/db';
import { verifyToken, tokenPrefix } from './token.js';
import { signJwt } from './jwt.js';
import { Errors, tokenSchema } from '@citadel/core';

type DbLike = any; // drizzle instance (postgres-js or pglite-backed)

export interface LoginResult {
  jwt: string;
  user: { id: string; orgId: string; role: string; displayName: string | null };
  firstLogin: boolean;
}

/** Validate token format, find by prefix, verify hash, issue JWT. */
export async function login(db: DbLike, rawToken: string): Promise<LoginResult> {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) throw Errors.validation(parsed.error.issues[0].message, 'token');

  const prefix = tokenPrefix(rawToken);
  // candidates sharing the prefix (index-backed), not revoked
  const candidates = await db
    .select()
    .from(tokens)
    .where(and(eq(tokens.tokenPrefix, prefix), isNull(tokens.revokedAt)));

  for (const row of candidates) {
    if (await verifyToken(rawToken, row.tokenHash)) {
      // resolve linked user (if any)
      let user = null as null | { id: string; displayName: string | null; role: string };
      if (row.userId) {
        const u = await db.select().from(users).where(eq(users.id, row.userId));
        user = u[0] ?? null;
      }
      const userId = user?.id ?? row.id; // fallback identity = token id (pre-profile)
      const role = (user?.role ?? row.role) as any;
      const jwt = await signJwt({ sub: userId, orgId: row.orgId, role });
      // best-effort last-used stamp
      await db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, row.id));
      return {
        jwt,
        user: { id: userId, orgId: row.orgId, role, displayName: user?.displayName ?? null },
        firstLogin: !user,
      };
    }
  }
  throw Errors.unauthorized('Token không đúng');
}
