/** SOUL-SALE 1A — run-migrations.mts: apply 0000_init.sql + 0001_rls.sql vào host DB.
 *  Idempotent qua bảng soulsale._migrations. Tách câu theo `--> statement-breakpoint`;
 *  0001 (RLS) không có breakpoint → chạy nguyên khối theo từng dòng statement. */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG = join(__dirname, '..', 'migrations');

function splitStatements(sqlText: string): string[] {
  if (sqlText.includes('--> statement-breakpoint')) {
    return sqlText.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
  }
  // fallback: bỏ dòng comment trước, rồi tách theo ; cuối câu (dùng cho 0001_rls.sql)
  const noComments = sqlText.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  return noComments.split(/;\s*\n/).map((s) => s.trim().replace(/;$/, '')).filter(Boolean);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('[soul-sale] Thiếu DATABASE_URL'); process.exit(1); }
  const sql = postgres(url, { max: 1 });
  try {
    // schema có thể chưa tồn tại → tạo bảng tracker ở public trước
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS public._soulsale_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
    const applied = new Set((await sql<{ name: string }[]>`SELECT name FROM public._soulsale_migrations`).map((r) => r.name));

    for (const file of ['0000_init.sql', '0001_rls.sql', '0002_undo_log.sql']) {
      if (applied.has(file)) { console.log(`[soul-sale] skip ${file} (đã chạy)`); continue; }
      const text = await readFile(join(MIG, file), 'utf8');
      const stmts = splitStatements(text);
      console.log(`[soul-sale] ${file}: ${stmts.length} statements`);
      await sql.begin(async (tx) => {
        for (const s of stmts) {
          try { await tx.unsafe(s); }
          catch (e) { console.error(`[soul-sale] FAIL stmt trong ${file}:\n${s.slice(0, 200)}\n→ ${(e as Error).message}`); throw e; }
        }
        await tx.unsafe(`INSERT INTO public._soulsale_migrations(name) VALUES ('${file}')`);
      });
      console.log(`[soul-sale] ✅ ${file} applied`);
    }
    console.log('[soul-sale] migrations DONE');
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
