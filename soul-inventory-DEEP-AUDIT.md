# Soul-Inventory R11.4 Deep Code Audit (read-only)

Scope: `/tmp/soul-inv-stage/soul-inventory/` for SuperCitadel integration. No file modifications in module, no git, no deploy. Collision was not re-audited as requested except prefix observation.

## Executive recommendation

**GO WITH GUARDS, not blind auto-deploy.** The module is structurally strong (21 `kho_*` tables, route/tool definitions, org-scoped service queries, host-driven scheduler), but there are integration blockers/risks that should be handled before unattended deployment:

1. **Do not run migration `0002_backfill_legacy.sql` in auto-deploy as-is.** It references `inventory_items.sku`, but the real host `inventory_items` table has no `sku` column. Auto-running will fail on live DB.
2. **RLS is complete/fail-closed in SQL for all 21 tables, but ineffective under host role `citadel` if it is superuser/BYPASSRLS.** Actual isolation depends on app-level `ctx.orgId` filters; service code broadly does use `ctx.orgId`.
3. **Routes call sensitive handlers directly, bypassing `executeAction` dry-run→confirm unless host wiring wraps them.** Tool/action path can be safe if wired to `executeAction`; HTTP route path currently is not inherently safe.
4. **Dependency versions are ahead of host** (`drizzle-orm ^0.45.2`, `@electric-sql/pglite ^0.5.4`, `zod ^4.4.3` vs host target drizzle `^0.36`, pglite `^0.2`, zod `^3`). Code appears mostly Zod-v3-compatible, but must be compiled/tested against host deps.

## 1. BACKFILL `0002` risk

### Real host legacy table shape

Host migration `/root/.openclaw/workspace/supercitadel/modules/inventory/migrations/0001_inventory.sql` defines:

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
org_id uuid NOT NULL,
name varchar(120) NOT NULL,
unit varchar(24) NOT NULL DEFAULT 'cái',
qty integer NOT NULL DEFAULT 0,
low_threshold integer NOT NULL DEFAULT 5,
updated_at timestamptz NOT NULL DEFAULT now(),
created_at timestamptz NOT NULL DEFAULT now()
```

Evidence: host file lines 1-10.

### What `0002` reads

`0002_backfill_legacy.sql` checks existence of `public.inventory_items` and then reads:

- `i.org_id` for default location seed (lines 18-23)
- `i.sku` for SKU fallback expression (line 28)
- `i.id`, `i.name`, `i.unit`, `i.low_threshold` (lines 27-32)
- `i.qty` for stock level and movement (lines 42-46, 52-59)

### Verdict

**As-is, it will fail on the real host table** because `inventory_items.sku` does not exist. PostgreSQL will error at the `SELECT COALESCE(NULLIF(i.sku, ''), ...)` expression. It will not merely misread; it will abort.

If `i.sku` is removed or guarded by dynamic SQL/column-existence logic, the intended mapping is otherwise reasonable:

- item SKU fallback: `LEGACY-<left(id,8)>`
- name/unit/low threshold map correctly
- positive and negative nonzero qty both become `GREATEST(i.qty,0)`; note negative legacy qty creates a zero movement because `WHERE i.qty <> 0` but `delta=GREATEST(i.qty,0)`. If negative legacy qty can exist, this is semantically odd.

### Recommendation

**Skip/guard `0002` in auto-deploy.** Treat it as **manual migration only** after patching for host shape, or run only with a preflight that confirms `inventory_items.sku` exists. Recommended safer behavior for R11.4 integration:

- Deploy schema migrations `0000`, `0001`, `0003`, `0004`, `0005`, `0006` automatically.
- Hold `0002` behind an explicit manual backfill command with dry preflight and row-count preview.
- If auto-backfill is required, rewrite `0002` to not reference `i.sku` unless the column exists.

## 2. RLS and org isolation

### RLS coverage

Schema has **21 `kho_*` tables** in `src/db/schema.ts`: `kho_items`, `kho_locations`, `kho_lots`, `kho_stock_levels`, `kho_movements`, `kho_reservations`, `kho_stocktakes`, `kho_stocktake_lines`, `kho_item_uoms`, `kho_boms`, `kho_bom_lines`, `kho_assembly_orders`, `kho_reorder_rules`, `kho_landed_costs`, `kho_landed_cost_lines`, `kho_cost_layers`, `kho_doc_counters`, `kho_demand_stats`, `kho_forecasts`, `kho_replenish_params`, `kho_automation_runs` (schema lines 14-376).

RLS migrations cover all 21:

- `0001_rls.sql`: 8 base tables, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, policy `org_id = current_setting('app.current_org_id')::uuid` (lines 11-72).
- `0004_v2_rls.sql`: 9 v2 tables with same pattern (lines 8-78).
- `0006_v2_1_rls.sql`: 4 automation tables with same pattern (lines 6-32).

**SQL-level RLS is fail-closed if the app role is not superuser/BYPASSRLS and `app.current_org_id` is set.** The module docs also explicitly warn that superuser always bypasses RLS (`0001_rls.sql` line 7; `docs/GUIDE.md` lines 18-21).

### Host caveat

Per task note, host DB role `citadel` is superuser+BYPASSRLS. Under that role, RLS will not filter. Therefore **app-level `ctx.orgId` filters are the real isolation on host**.

### Service-level org filtering

Every service file under `src/services/*.ts` references `ctx.orgId`; route context injection passes `KhoCtx` from `c.get('khoCtx')` consistently (routes lines 37, 57-318). Examples:

- automation SQL filters by `m.org_id = ${ctx.orgId}` (automation lines 51-59), `ds.org_id = ${ctx.orgId}` (lines 107-115), `p.org_id = ${ctx.orgId}` (lines 250-286), `i.org_id = ${ctx.orgId}` (tail lines 11-18), and writes `orgId: ctx.orgId` to `khoAutomationRuns` (tail lines 182-186).
- routes require host middleware to attach `KhoCtx` with db/orgId/userId/bus (`src/routes.ts` lines 37-38).

I did not find an obvious unscoped service file; however, because RLS is bypassed in host, integration should include a code-review gate or automated grep/check to prevent future raw SQL without `ctx.orgId` predicates.

## 3. Dry-run→confirm protocol

`src/contract.ts` implements `executeAction`:

- Input has optional `confirm` (lines 70-73).
- If `action.sensitive && confirm !== true`, it returns a `DryRunPreview` with `dry_run: true`, action name, preview message, sanitized input (without `confirm`), and `requires_security_level` (lines 83-111). It audits with result `dryrun` (lines 106-110).
- If not sensitive, or confirmed, it calls `action.handler(ctx, input)`, audits `ok`, and returns result (lines 114-122).
- On error it audits `error` and rethrows (lines 123-130).

This maps cleanly to host `tieu-tam/actions.ts` if the host invokes all write actions via `executeAction(deps, actor, action, ctx, rawInput)`.

### Sensitive/security-level-2 write actions

From `src/tools/index.ts` and `manifest.json`, securityLevel 2 sensitive actions are:

1. `kho.stock.receive` — `kho.stock.write` — sensitive, level 2 (tools lines 224-228; manifest lines 190-196)
2. `kho.stock.issue` — `kho.stock.write` — sensitive, level 2 (tools lines 235-239; manifest lines 199-205)
3. `kho.stock.transfer` — `kho.stock.write` — sensitive, level 2 (tools lines 246-250; manifest lines 208-214)
4. `kho.stocktake.execute` — `kho.stocktake.write` — sensitive, level 2 (tools lines 279-283; manifest lines 226-232)
5. `kho.assembly.execute` — `kho.stock.write` — sensitive, level 2 (tools lines 303-308; manifest lines 244-250)
6. `kho.stock.scrap` — `kho.stock.write` — sensitive, level 2 (tools lines 328-332; manifest lines 262-268)
7. `kho.landed_cost.apply` — `kho.stock.write` — sensitive, level 2 (tools lines 339-343; manifest lines 271-277)

Additionally sensitive but **level 1**:

8. `kho.reservation.manage` — `kho.reservation.write` — sensitive true, securityLevel 1 (tools lines 257-261; manifest lines 217-223). This is partly reasonable because `fulfill` writes stock; still, route/tool UX should preview.

### Integration risk

`src/routes.ts` invokes services/tool handlers directly (e.g. receive/issue/transfer at lines 76, 83, 90; assembly at line 192; landed cost line 222; scrap line 228), not through `executeAction`. If these HTTP routes are exposed as mutation endpoints, dry-run→confirm must be enforced by host wrapper/middleware, or routes should be considered unsafe for direct public use.

## 4. Permissions for host `PERMISSION_REGISTRY`

Eight flat permission IDs in `manifest.json` lines 38-99:

1. `kho.item.read`
2. `kho.item.write`
3. `kho.stock.read`
4. `kho.stock.write`
5. `kho.reservation.read`
6. `kho.reservation.write`
7. `kho.stocktake.read`
8. `kho.stocktake.write`

Observation: no tool/action in the manifest uses `kho.item.read`, `kho.reservation.read`, or `kho.stocktake.read` directly; they may be reserved for UI/pages.

## 5. Tools/actions inventory

The host ToolDef target shape is `{ name, module, description, requiresPermission?, handler(input, ctx) }`. Module definitions provide `name`, `description`, `permission`, `handler(ctx, rawInput)` and must be adapted to host shape/order.

### Read tools (13)

All read tools have `sensitive=false`, default `securityLevel=1`, and permission `kho.stock.read`:

1. `kho.stock.query` — `kho.stock.read`
2. `kho.stock.low_alerts` — `kho.stock.read`
3. `kho.lot.expiry_alerts` — `kho.stock.read`
4. `kho.report.stock_card` — `kho.stock.read`
5. `kho.report.summary` — `kho.stock.read`
6. `kho.picking.suggest` — `kho.stock.read`
7. `kho.bom.info` — `kho.stock.read`
8. `kho.reorder.suggest` — `kho.stock.read`
9. `kho.analytics.report` — `kho.stock.read`
10. `kho.replenish.suggest` — `kho.stock.read`
11. `kho.forecast.projected` — `kho.stock.read`
12. `kho.analytics.dead_stock` — `kho.stock.read`
13. `kho.barcode.lookup` — `kho.stock.read` (pushed after array; tools lines 404-417)

### Write actions (16)

1. `kho.item.upsert` — `kho.item.write` — not sensitive, level 1
2. `kho.uom.upsert` — `kho.item.write` — not sensitive, level 1
3. `kho.stock.receive` — `kho.stock.write` — **sensitive, level 2**
4. `kho.stock.issue` — `kho.stock.write` — **sensitive, level 2**
5. `kho.stock.transfer` — `kho.stock.write` — **sensitive, level 2**
6. `kho.reservation.manage` — `kho.reservation.write` — **sensitive, level 1**
7. `kho.stocktake.execute` — `kho.stocktake.write` — **sensitive, level 2**
8. `kho.bom.upsert` — `kho.item.write` — not sensitive, level 1
9. `kho.assembly.execute` — `kho.stock.write` — **sensitive, level 2**
10. `kho.reorder.rule_upsert` — `kho.item.write` — not sensitive, level 1
11. `kho.stock.scrap` — `kho.stock.write` — **sensitive, level 2**
12. `kho.landed_cost.apply` — `kho.stock.write` — **sensitive, level 2**
13. `kho.abc.run` — `kho.stocktake.write` — not sensitive, level 1
14. `kho.replenish.params_set` — `kho.item.write` — not sensitive, level 1
15. `kho.xyz.run` — `kho.stocktake.write` — not sensitive, level 1
16. `kho.automation.run` — `kho.stocktake.write` — not sensitive, level 1

Definitions validate with Zod at boundary via `inputSchema.parse(rawInput)` (`src/tools/index.ts` lines 97-99).

## 6. Scheduler / host cron hook

`runScheduledTasks(ctx, opts?)` signature is in `src/services/automation.service.ts` tail lines 135-140:

```ts
export async function runScheduledTasks(ctx: KhoCtx, opts?: {
  windowDays?: number;
  forecastMethod?: 'moving_avg' | 'ses';
  horizonDays?: number;
}): Promise<{
  demand_stats_items: number;
  forecast_items: number;
  replenish_alerts: number;
  dead_stock_alerts: number;
  ran_at: string;
}>
```

What it does:

1. Defaults `windowDays=90`, `method='moving_avg'`, `horizonDays=30` (tail lines 141-143).
2. Runs `computeDemandStats` and `computeForecasts` (tail lines 145-146).
3. Updates existing `kho_replenish_params` safety stock/reorder point for the org (tail lines 151-173).
4. Computes replenish suggestions and dead-stock findings (tail lines 175-176).
5. Inserts a `kho_automation_runs` log with `orgId: ctx.orgId` and emits `kho.automation.ran` (tail lines 178-186).
6. Returns counts + timestamp (tail line 188).

It **does not self-spawn** cron. Docs say host should call it per active org:

```ts
for (const orgId of await activeOrgs()) {
  await withTenant(orgId, (ctx) => runScheduledTasks(ctx));
}
```

Evidence: `docs/GUIDE.md` §3b lines 86-95; `src/index.ts` exports it at line 74. This is correct: wire to host cron per org, do not let module run timers.

## 7. Dependency mismatch / API risk

Module `package.json` lines 17-22 declares:

- `@electric-sql/pglite ^0.5.4`
- `drizzle-orm ^0.45.2`
- `xlsx ^0.18.5`
- `zod ^4.4.3`

Host target from task: drizzle `^0.36`, pglite `^0.2`, zod `^3`.

### Drizzle

Code uses Drizzle APIs like `pgTable`, `uuid`, `text`, `numeric`, `jsonb`, `boolean`, `timestamp`, `index`, `uniqueIndex`, `integer`, `date`, `bigint`, `primaryKey`, SQL template, `eq`, `and`, `.onConflictDoUpdate`, `.returning()`, and callback-style indexes. These are likely compatible with Drizzle 0.36, but **must be compiled against host** because module was authored against 0.45.

### PGlite

PGlite is mostly test-only in this module. Tests import PGlite and Drizzle; version mismatch mainly affects standalone tests, not runtime if host uses Postgres.

### Zod

Validation uses APIs present in Zod 3 in normal cases: `z.object`, `z.union`, `z.string`, `.trim()`, `.min()`, `.max()`, `z.number().int()`, `z.boolean().default()`, `z.discriminatedUnion`, `z.literal`, `z.enum`, `z.array`, `.regex()`, `.datetime({ offset: true })`, `z.record(z.string(), z.unknown())`. The likely risk is `z.record(z.string(), z.unknown())`: Zod 3 supports two-arg `record`, but behavior and type inference differ across versions. I did not see obvious Zod-v4-only APIs.

Recommendation: change declared versions or add a host-compat test/build using host lockfile before integration.

## 8. Test inventory

All four tests are standalone/self-contained PGlite+Drizzle smoke tests (each imports `@electric-sql/pglite` and Drizzle). Count below is static “assert/expect/test/it” occurrence count; these files mostly use custom `check(...)`, so assertion count is underrepresented by generic grep.

| Test file | Lines | Generic assert/expect/test/it count | Self-contained PGlite? | Notes |
|---|---:|---:|---|---|
| `tests/smoke.test.ts` | 243 | 0 | Yes | Base stock flows; custom checks, no test runner wrapper. |
| `tests/smoke-v2.test.ts` | 316 | 1 | Yes | V2 flows; one generic assertion occurrence plus custom checks. |
| `tests/smoke-v11.test.ts` | 195 | 0 | Yes | R11-ish smoke; custom checks. |
| `tests/smoke-v21.test.ts` | 195 | 0 | Yes | Automation v2.1 smoke; custom checks. |

`package.json` scripts expose `test:smoke`, `test:v11`, `test:v2`, `test:v21`, but default `npm test` intentionally fails with placeholder (`package.json` lines 6-12). For host CI, wire the named scripts explicitly or replace default.

## 9. Verification of `AUDIT_REPORT.md` claims

`AUDIT_REPORT.md` claims “144 PASS / 0 FAIL” and includes checks for manifest, store pricing, hooks, RLS, tools, docs, routes, and module statelessness (lines 3-206). The claims are mostly consistent with the module files, but with important caveats outside the report’s scope:

- It does not catch the real-host `0002` backfill column mismatch (`i.sku` vs host table without `sku`).
- It treats RLS as PASS, which is true for SQL definitions but not effective under host superuser/BYPASSRLS role.
- It counts dry-run protocol presence, but route handlers can bypass `executeAction` unless host wiring enforces it.
- It reports 13 read tools + 16 actions (line 133), matching code/manifest.

## Top risks ranked

1. **High — `0002_backfill_legacy.sql` will fail on live host** due to nonexistent `inventory_items.sku`. Guard/skip manual only.
2. **High — host role bypasses RLS.** SQL RLS is complete, but actual tenant isolation depends on app `ctx.orgId`; keep host non-superuser migration/runtime split as long-term fix.
3. **High — direct HTTP routes bypass dry-run.** Sensitive route paths call services/handlers directly; ensure host only exposes action wrapper or adds dry-run middleware.
4. **Medium — dependency mismatch.** Module declares newer Drizzle/PGlite/Zod than host; compile and run smoke tests against host deps.
5. **Medium — `npm test` is a failing placeholder.** CI must run named smoke scripts.
6. **Medium — automation action is non-sensitive but writes logs/updates params.** It is safe-ish (no PO creation), but still writes; permission `kho.stocktake.write` and audit should be enforced.
7. **Low/Medium — `kho.reservation.manage` is sensitive level 1 despite `fulfill` writing stock.** Consider level 2 for fulfill or split actions.
8. **Low — manifest route paths use `/inventory/...` despite module conflict with `inventory`.** Table collision is absent, but HTTP route namespace could collide unless host conflict disables old module or mounts under module namespace.

## Final go/no-go

**Recommendation: GO only if these conditions are met before deploy:**

- Exclude `0002_backfill_legacy.sql` from automatic migration, or patch it for host table shape and run manually with preview.
- Wire write actions through host `executeAction` dry-run→confirm path; do not expose direct mutation routes without equivalent guard.
- Register all 8 permissions in host `PERMISSION_REGISTRY`.
- Wire `runScheduledTasks(ctx)` from host cron per org, no module timers.
- Run TypeScript build and smoke scripts against host dependency versions/lockfile.

Without those guards: **NO-GO for unattended auto-deploy** because the backfill is expected to fail and dry-run enforcement may be bypassed on route path.
