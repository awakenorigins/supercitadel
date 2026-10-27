// @citadel/db — client factory. Postgres for prod; PGlite for tests (see schema.test.ts).
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema, outboxEvents } from './schema.js';

export * from './schema.js';
(globalThis as any).__citadelOutboxEventsTable = outboxEvents;
// Outbox is enabled explicitly by API runtime/tests after migration is present.
// Keep default disabled so legacy PGlite tests without 0011 do not abort transactions.
if ((globalThis as any).__citadelOutboxEnabled === undefined) (globalThis as any).__citadelOutboxEnabled = false;

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(url = process.env.DATABASE_URL) {
  if (_db) return _db;
  if (!url) throw new Error('DATABASE_URL not set');
  const client = postgres(url, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

export { schema };
