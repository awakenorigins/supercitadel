import { getDb, orgs, users, tokens } from '@citadel/db';
import { hashToken, tokenPrefix, generateToken } from '../src/auth/token.js';
import { topup, getBalance } from '@citadel/module-om/server/service.js';
import { omLedger } from '@citadel/module-om/server/schema.js';
import { eq } from 'drizzle-orm';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

const NAME = 'Lào Sư A Tuấn';
const BASE_SLUG = 'lao-su-a-tuan';
const ROLE = 'manager' as const;
const INITIAL_OM = 100_000;

function slugWithSuffix(base: string, n: number) { return n === 0 ? base : `${base}-${n + 1}`; }

const db = getDb(process.env.DATABASE_URL);

const result = await db.transaction(async (tx: any) => {
  let slug = BASE_SLUG;
  for (let i = 0; i < 20; i++) {
    slug = slugWithSuffix(BASE_SLUG, i);
    const existing = await tx.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1);
    if (existing.length === 0) break;
    if (i === 19) throw new Error('Could not find unique slug');
  }

  const rawToken = generateToken();
  const [org] = await tx.insert(orgs).values({ name: NAME, slug, logoEmoji: '🏯' }).returning();
  const [user] = await tx.insert(users).values({ orgId: org.id, displayName: NAME, role: ROLE, securityLevel: 2 }).returning();
  await tx.insert(tokens).values({ orgId: org.id, userId: user.id, tokenPrefix: tokenPrefix(rawToken), tokenHash: await hashToken(rawToken), role: ROLE, securityLevel: '2', label: 'Token đăng nhập Lào Sư A Tuấn' });
  const top = await topup(tx, org.id, INITIAL_OM);
  await tx.update(omLedger).set({ reason: 'Nạp khởi tạo' }).where(eq(omLedger.id, top.transaction.id));
  const balance = await getBalance(tx, org.id);
  return { token: rawToken, orgId: org.id, slug: org.slug, userId: user.id, role: user.role, balance };
});

console.log(JSON.stringify(result, null, 2));
