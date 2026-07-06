/**
 * ============================================================
 * Kế Toán 10A — Điểm vào cho SuperCitadel
 * ============================================================
 *
 * CÁCH DÙNG CHUẨN (contract SuperCitadel §4) — xem docs/INTEGRATION.md:
 *
 *   import { buildKeToan10aRoutes } from '@citadel/module-ke-toan-10a/routes';
 *   import { keToan10aTools }      from '@citadel/module-ke-toan-10a/tools';
 *
 *   app.route('/api/v1/ke-toan-10a', buildKeToan10aRoutes({
 *     db: getDb(), requireAuth, gate: requireModule(getDb(), 'ke-toan-10a'), audit,
 *     reverseGate: async (c, kind) => { if (kind === 'payment' || kind === 'receipt')
 *       await assertSecurityLevel(getDb(), c.get('auth'), 2); },
 *   }));
 *   keToan10aTools(getDb()).forEach((t) => toolRegistry.register(t));
 *
 * Ngoài ra vẫn có mountKeToan10a() để chạy standalone/sidecar (dev/test).
 */
import { createDb, setDb, type Database } from "./lib/db.js";
import { buildKeToan10aRoutes } from "./routes.js";
import { keToan10aTools } from "./tools.js";
import { listActions, runAction } from "./actions/registry.js";
import { KetoanServices } from "./services/index.js";
import type { Ctx } from "./lib/context.js";
import type { ActionResult } from "./types/index.js";
import type { ModuleDeps } from "./contract.js";

export interface MountOptions {
  dbUrl?: string;
  db?: Database;
  requireAuth: ModuleDeps["requireAuth"];
  gate?: ModuleDeps["gate"];
  audit?: ModuleDeps["audit"];
  reverseGate?: ModuleDeps["reverseGate"];
}

/**
 * Mount đầy đủ (contract). Trả router + tools + services + invokeAction.
 * Host tiêm requireAuth/gate/audit của mình.
 */
export function mountKeToan10a(opts: MountOptions) {
  const db =
    opts.db ??
    (() => {
      if (!opts.dbUrl) throw new Error("mountKeToan10a: cần `dbUrl` hoặc `db`");
      const created = createDb(opts.dbUrl);
      setDb(created);
      return created;
    })();

  const router = buildKeToan10aRoutes({
    db,
    requireAuth: opts.requireAuth,
    gate: opts.gate,
    audit: opts.audit,
    reverseGate: opts.reverseGate,
  });
  const services = new KetoanServices(db);

  return {
    id: "ke-toan-10a" as const,
    displayName: "Kế Toán 10A",
    version: "1.0.0",
    router,
    tools: keToan10aTools(db),
    services,
    actions: listActions(),
    invokeAction: (ctx: Ctx, actionId: string, params: unknown): Promise<ActionResult> =>
      runAction(services, ctx, actionId, params),
  };
}

// Re-export contract surface cho host.
export { buildKeToan10aRoutes } from "./routes.js";
export { keToan10aTools } from "./tools.js";
export {
  keToan10aTieuTamActions,
  detectK10aAction,
  KE_TOAN_10A_PERMISSIONS,
} from "./tieu-tam-actions.js";
export type {
  K10aTieuTamAction,
  K10aActionCtx,
  K10aActionResult,
  K10aPermissionMeta,
} from "./tieu-tam-actions.js";
export { KetoanServices } from "./services/index.js";
export { listActions, runAction, ACTIONS } from "./actions/registry.js";
export { schema } from "./schema/index.js";
export { seedChartOfAccounts, CHART_OF_ACCOUNTS, CHART_TT133, CHART_TT200, chartOf } from "./seed.js";
export type { SeedOptions, ChartStandard, SeedAccount } from "./seed.js";
export * as Money from "./lib/money.js";
export { tieuTamCtx, userCtx, type Ctx } from "./lib/context.js";
export type { ActionResult, InvoiceLine } from "./types/index.js";
export { KetoanError } from "./lib/errors.js";
export { AppError, type JwtPayload, type ToolDef, type ModuleDeps } from "./contract.js";
