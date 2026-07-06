/* PGlite + drizzle + apply migrations — mỗi suite một DB sạch */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../src/schema.js';
import type { Db, Ctx } from '../src/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ORG_A = '11111111-1111-1111-1111-111111111111';
export const ORG_B = '22222222-2222-2222-2222-222222222222';

export async function newDb(): Promise<{ db: Db; pg: PGlite }> {
  const pg = new PGlite();
  for (const f of ['0000_init.sql', '0001_rls.sql']) {
    const raw = readFileSync(join(HERE, '..', 'migrations', f), 'utf8');
    await pg.exec(raw.split('--> statement-breakpoint').join('\n'));
  }
  const db = drizzle(pg, { schema }) as unknown as Db;
  return { db, pg };
}

export function ctx(orgId = ORG_A, userId = 'tester', emits?: { t: string; p: Record<string, unknown> }[]): Ctx {
  return {
    orgId, userId,
    emit: emits ? async (t, p) => { emits.push({ t, p }); } : undefined,
  };
}
