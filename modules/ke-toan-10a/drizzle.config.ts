import type { Config } from "drizzle-kit";

/**
 * Cấu hình Drizzle Kit cho Kế Toán 10A.
 * Toàn bộ bảng dùng schema Postgres riêng `ketoan10a` để cách ly khỏi core SuperCitadel,
 * tránh đụng tên bảng với các module khác.
 */
export default {
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.KETOAN10A_DB_URL ?? process.env.DATABASE_URL ?? "",
  },
  schemaFilter: ["ketoan10a"],
  verbose: true,
  strict: true,
} satisfies Config;
