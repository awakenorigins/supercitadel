// Migration runner — applies migrations/*.sql in order against DATABASE_URL (Postgres).
import postgres from 'postgres';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(__dirname, '..', 'migrations');

export async function runMigrations(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = postgres(url, { max: 1 });
  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`;
    const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const done = await sql`SELECT 1 FROM _migrations WHERE name = ${f}`;
      if (done.length) { console.log(`[migrate] skip ${f}`); continue; }
      const ddl = readFileSync(join(MIG_DIR, f), 'utf8');
      await sql.unsafe(ddl);
      await sql`INSERT INTO _migrations (name) VALUES (${f})`;
      console.log(`[migrate] applied ${f}`);
    }
    console.log('[migrate] done');
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((e) => { console.error(e); process.exit(1); });
}
