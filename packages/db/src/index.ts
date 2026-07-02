// @citadel/db — client factory. Postgres for prod; PGlite for tests (see schema.test.ts).
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema.js';

export * from './schema.js';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(url = process.env.DATABASE_URL) {
  if (_db) return _db;
  if (!url) throw new Error('DATABASE_URL not set');
  const client = postgres(url, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

export { schema };
