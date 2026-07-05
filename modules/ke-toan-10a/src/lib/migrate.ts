/**
 * Chạy migration cho Kế Toán 10A.
 * Tạo schema `ketoan10a` nếu chưa có, rồi apply các file SQL trong ./migrations.
 *
 *   npm run db:migrate
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../migrations");

async function main() {
  const url = process.env.KETOAN10A_DB_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("[ketoan10a] Thiếu KETOAN10A_DB_URL / DATABASE_URL");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  try {
    // Đảm bảo schema tồn tại.
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ketoan10a;`);

    // Bảng theo dõi migration đã chạy.
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ketoan10a._migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    let files: string[] = [];
    try {
      files = (await readdir(MIGRATIONS_DIR))
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      console.warn(
        "[ketoan10a] Chưa có thư mục migrations. Chạy `npm run db:generate` trước.",
      );
    }

    const applied = new Set(
      (
        await sql<{ name: string }[]>`SELECT name FROM ketoan10a._migrations`
      ).map((r) => r.name),
    );

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const content = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[ketoan10a] Áp dụng migration: ${file}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO ketoan10a._migrations (name) VALUES (${file})`;
      });
      count++;
    }

    console.log(
      count > 0
        ? `[ketoan10a] Hoàn tất ${count} migration.`
        : "[ketoan10a] Không có migration mới.",
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[ketoan10a] Migration lỗi:", err);
  process.exit(1);
});
