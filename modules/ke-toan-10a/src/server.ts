/**
 * Server standalone (SIDECAR / dev / test).
 * Chạy Kế Toán 10A độc lập với requireAuth tự verify JWT (dùng khi KHÔNG mount
 * native vào gateway). Trong repo thật, dùng buildKeToan10aRoutes + host middleware.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { verify } from "hono/jwt";
import type { MiddlewareHandler } from "hono";
import { mountKeToan10a } from "./index.js";

const dbUrl = process.env.KETOAN10A_DB_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[ke-toan-10a] Thiếu KETOAN10A_DB_URL / DATABASE_URL");
  process.exit(1);
}

const jwtSecret = process.env.CITADEL_JWT_SECRET ?? "";

// requireAuth tối giản cho sidecar: verify JWT Bearer HOẶC header nội bộ.
const requireAuth: MiddlewareHandler = async (c, next): Promise<Response | void> => {
  const orgHeader = c.req.header("x-citadel-org-id");
  if (orgHeader) {
    c.set("auth", { orgId: orgHeader, sub: c.req.header("x-citadel-user-id") ?? "unknown" } as never);
    await next();
    return;
  }
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: { code: "UNAUTHORIZED", message: "Thiếu token" } }, 401);
  if (!jwtSecret) return c.json({ error: { code: "CONFIG_ERROR", message: "Thiếu CITADEL_JWT_SECRET" } }, 500);
  try {
    const p = await verify(auth.slice(7), jwtSecret, "HS256");
    const orgId = (p.org_id ?? p.orgId) as string | undefined;
    if (!orgId) return c.json({ error: { code: "UNAUTHORIZED", message: "Token thiếu org_id" } }, 401);
    c.set("auth", { orgId, sub: (p.sub ?? p.user_id) as string } as never);
    await next();
  } catch {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Token không hợp lệ" } }, 401);
  }
};

const mod = mountKeToan10a({ dbUrl, requireAuth });

const app = new Hono();
app.get("/", (c) => c.json({ service: "Kế Toán 10A", status: "running", mount: "sidecar" }));
app.route("/api/v1/ke-toan-10a", mod.router);

const port = Number(process.env.KETOAN10A_PORT ?? 3010);
const host = process.env.KETOAN10A_HOST ?? "0.0.0.0";
console.log(`[ke-toan-10a] chạy tại http://${host}:${port}`);
console.log(`[ke-toan-10a] Health: http://${host}:${port}/api/v1/ke-toan-10a/health`);
serve({ fetch: app.fetch, port, hostname: host });
