/**
 * SOUL-MEETING — test harness dùng chung (PGlite + role citadel_app RLS thật).
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EventBus, SmCaps, SmCtx, SmEventPayload } from '../src/types.js';
import { SmError } from '../src/types.js';

const __dir = dirname(fileURLToPath(import.meta.url));

export let passed = 0; export let failed = 0;
export function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
export function eq(name: string, actual: unknown, expected: unknown) {
  check(name, String(actual) === String(expected), `(actual=${actual}, expected=${expected})`);
}
export async function expectErr(name: string, code: string, fn: () => Promise<unknown>) {
  try { await fn(); check(name, false, '(không ném lỗi)'); }
  catch (e) { check(name, e instanceof SmError && e.code === code, `(nhận ${e instanceof SmError ? e.code : (e as Error).message})`); }
}
export function summary(label: string) {
  console.log(`\nKẾT QUẢ ${label}: ${passed} pass / ${failed} fail`);
  if (failed > 0) process.exit(1);
}

export const events: Array<{ name: string; payload: SmEventPayload }> = [];
export const bus: EventBus = { emit: (n, p) => { events.push({ name: n, payload: p }); } };
export const resetEvents = () => { events.length = 0; };

export interface Harness {
  client: PGlite;
  db: ReturnType<typeof drizzle>;
  /** Chạy fn trong transaction tenant: SET ROLE citadel_app + app.current_org_id */
  as<T>(orgId: string, userId: string, fn: (ctx: SmCtx) => Promise<T>, opts?: { now?: () => Date; caps?: SmCaps }): Promise<T>;
}

export async function setup(): Promise<Harness> {
  const client = new PGlite();
  const db = drizzle(client);
  for (const f of ['0000_init.sql', '0001_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }
  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);
  return {
    client, db,
    as: (orgId, userId, fn, opts) => db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      const ctx: SmCtx = {
        db: tx as unknown as SmCtx['db'], orgId, userId, bus,
        now: opts?.now, caps: opts?.caps,
      };
      return fn(ctx);
    }),
  };
}
