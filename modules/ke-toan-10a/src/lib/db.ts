import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "../schema/index.js";

export type Database = ReturnType<typeof createDb>;

/**
 * Tạo instance Drizzle kết nối PostgreSQL.
 * Khi mount native vào SuperCitadel, core có thể truyền sẵn pool/connection
 * dùng chung để tránh mở nhiều kết nối. Xem `attach()` trong index.ts.
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    prepare: true,
  });
  return drizzle(client, { schema });
}

/**
 * Tạo Drizzle từ một postgres client có sẵn (do core cấp).
 * Dùng khi SuperCitadel muốn Kế Toán 10A dùng chung connection pool.
 */
export function createDbFromClient(client: postgres.Sql) {
  return drizzle(client, { schema });
}

let _db: Database | null = null;

/** Lấy DB singleton (dùng khi chạy standalone/sidecar). */
export function getDb(): Database {
  if (_db) return _db;
  const url = process.env.KETOAN10A_DB_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Kế Toán 10A: thiếu KETOAN10A_DB_URL / DATABASE_URL trong môi trường",
    );
  }
  _db = createDb(url);
  return _db;
}

/** Gán DB từ bên ngoài (core SuperCitadel gọi khi mount native). */
export function setDb(db: Database): void {
  _db = db;
}
