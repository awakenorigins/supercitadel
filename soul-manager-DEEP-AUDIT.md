# Soul-Manager HR Module — Deep Code Audit

Scope: read-only audit of `/tmp/soul-manager-stage` for SuperCitadel integration. No files in the staged module were modified. Host collision search covered `/root/.openclaw/workspace/supercitadel/modules/hr/migrations/` and `/root/.openclaw/workspace/supercitadel/packages/db/migrations/`.

## Executive verdict

**Do not deploy `migrations/0002_backfill_legacy.sql` unguarded.** The core 18-table Soul-Manager schema is internally coherent and RLS is fail-closed for its own tables, but the staged module collides hard with existing SuperCitadel HR tables (`hr_shifts`, `hr_employees`, `hr_attendance`, `hr_leave_types`) and the optional backfill assumes legacy bare tables named `departments` and `employees` with a shape that may not exist. The safest integration path is: deploy only after reconciling/replacing the existing `modules/hr` schema, register flat permissions in the host registry, and skip or heavily guard `0002` behind explicit schema introspection + backup + dry-run.

## 1. SCHEMA SAFETY / COLLISION RISK

### 1.1 Staged Soul-Manager tables

`src/db/schema.ts` defines 18 `hr_*` tables: `hr_settings`, `hr_departments`, `hr_positions`, `hr_employees`, `hr_contracts`, `hr_dependents`, `hr_allowances`, `hr_shifts`, `hr_attendance`, `hr_leave_types`, `hr_leave_balances`, `hr_leave_requests`, `hr_payroll_periods`, `hr_payslips`, `hr_job_openings`, `hr_candidates`, `hr_courses`, `hr_enrollments` (`schema.ts:12-362`). `0000_init.sql` mirrors these tables (`0000_init.sql:9-341`).

### 1.2 Existing SuperCitadel HR migrations already define conflicting `hr_*` tables

Host search found existing migrations:

- `/root/.openclaw/workspace/supercitadel/modules/hr/migrations/0001_hr.sql:1-12` creates `hr_shifts` with columns: `id`, `org_id`, `name`, `shift_date`, `start_time varchar(8)`, `end_time varchar(8)`, `staff`, `note`, `created_at`.
- `/root/.openclaw/workspace/supercitadel/modules/hr/migrations/0002_hr_v2.sql:2-13` creates `hr_employees` with columns: `id`, `org_id`, `user_id`, `full_name varchar(120)`, `role_title`, `phone`, `joined_date`, `status`, `created_at`.
- `0002_hr_v2.sql:15-29` creates `hr_attendance` with columns: `att_date`, `working_hours`, `late_entry`, etc.
- `0002_hr_v2.sql:31-40` creates `hr_leave_types` with `name`, `days_per_year`, `is_paid`, `carry_forward`.
- `0002_hr_v2.sql:42-68` creates `hr_leave_allocations` and `hr_leave_applications`.

These are not compatible with Soul-Manager’s shape:

- Soul `hr_shifts` requires `code`, `start_time time`, `end_time time`, `break_minutes`, `work_hours`, `active`, `updated_at` (`0000_init.sql:139-153`). Existing `hr_shifts` lacks `code` and has a different semantic model (`shift_date`, `staff`).
- Soul `hr_employees` requires `code`, `hire_date`, `contract_type`, `base_salary`, `updated_at`, etc. (`0000_init.sql:52-87`). Existing `hr_employees` lacks `code`, `hire_date`, `base_salary`, `updated_at` and uses `joined_date`/`role_title`.
- Soul `hr_attendance` requires `work_date`, `work_days`, OT columns, `updated_at` (`0000_init.sql:155-177`). Existing uses `att_date`, `working_hours`, `late_entry`.
- Soul `hr_leave_types` requires `code`, `paid`, `annual_quota`, `active`, `updated_at` (`0000_init.sql:180-192`). Existing uses `name`, `days_per_year`, `is_paid`, `carry_forward`.

**Risk:** `0000_init.sql` uses `CREATE TABLE IF NOT EXISTS`; if host already has these tables, it will not add missing columns. Later indexes/RLS/policies and service code will assume Soul columns exist and fail at runtime. Worse, `0001_rls.sql` will enable/force RLS on existing HR tables, changing behavior of the old module.

### 1.3 `0002_backfill_legacy.sql` risk against bare `departments` / `employees`

`0002_backfill_legacy.sql` is explicitly optional (`0002_backfill_legacy.sql:2`) and assumes legacy shapes:

- `departments(id uuid, org_id uuid, name text)` (`0002_backfill_legacy.sql:8-9`)
- `employees(id uuid, org_id uuid, full_name text, code text, base_salary numeric, hire_date date, department_id uuid)` (`0002_backfill_legacy.sql:10-11`)

It only checks table existence via `to_regclass('public.departments')` and `to_regclass('public.employees')` (`0002_backfill_legacy.sql:18`, `34`). It does **not** verify required columns/types before selecting `d.org_id`, `d.name`, `e.code`, `e.full_name`, `e.base_salary`, `e.hire_date`, `e.department_id` (`0002_backfill_legacy.sql:20-23`, `42-54`).

Host search in the requested locations did **not** find bare `departments` or `employees` definitions, but absence in these migration folders is not proof they do not exist in a live DB or another package. If any unrelated SuperCitadel table named `employees` exists with a different shape, this migration will either fail mid-deploy or misread data. It inserts into `hr_departments` and `hr_employees` (`0002_backfill_legacy.sql:19-27`, `39-59`), so a bad mapping could pollute HR records.

### 1.4 Recommendation for `0002`

**Skip `0002_backfill_legacy.sql` in host deploy by default.** If migration is needed, replace it with a guarded backfill that:

1. requires an explicit deploy flag, not automatic install;
2. checks `information_schema.columns` for exact required columns and compatible types;
3. checks target Soul tables are the Soul shape, not the old `hr_*` shape;
4. runs a dry-run count/report first;
5. stores migration provenance and legacy ids in typed columns or robust metadata checks;
6. is executed only after backup and after resolving the old `modules/hr` collision.

## 2. RLS CORRECTNESS

`0001_rls.sql` covers all 18 Soul tables. For each, it runs:

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE ... FORCE ROW LEVEL SECURITY;`
- drops/recreates `tenant_isolation` policy with both `USING` and `WITH CHECK` comparing `org_id` to `current_setting('app.current_org_id')::uuid`.

Examples: `hr_settings` (`0001_rls.sql:11-17`), `hr_employees` (`35-41`), `hr_payslips` (`115-121`), `hr_enrollments` (`147-153`). This is fail-closed because no fallback/coalesce is used; missing `app.current_org_id` raises an error. The file also warns superusers bypass RLS despite FORCE (`0001_rls.sql:7-8`).

**No Soul table is missing a policy** based on the 18 tables in `schema.ts` and `0000_init.sql`.

**Integration caveat:** Because host already has `hr_shifts`, `hr_employees`, `hr_attendance`, and `hr_leave_types`, applying `0001_rls.sql` before schema reconciliation would force RLS onto old tables too, potentially breaking the old HR module.

## 3. PAYROLL LAW / CONFIG SPOT CHECK

### Confirmed against stated module law

- Personal deduction: `15,500,000` VND/month (`config.ts:39`) matches the stated requirement.
- Dependent deduction: `6,200,000` VND/month (`config.ts:40`) matches the stated requirement.
- 5-bracket PIT table: up to 10m at 5%, 30m at 10%, 60m at 20%, 100m at 30%, above at 35% (`config.ts:41-47`) matches the stated 5-bracket progressive schedule.
- Employee insurance rates: SI 8%, HI 1.5%, UI 1% (`config.ts:50`) match the staged comments and tests.
- SI/HI cap multiplier 20x reference and UI cap 20x regional minimum wage (`config.ts:56-57`) are implemented in payroll (`payroll.service.ts:93-99`).
- Reference level changes from 2.34m to 2.53m on 2026-07-01 (`config.ts:53-55`) and regional minimum wage changes from 2026-01-01 (`config.ts:59-66`).
- OT multipliers 1.5/2.0/3.0 and premium tax exempt true (`config.ts:69`) are implemented by splitting OT pay into full pay and premium-exempt part (`payroll.service.ts:75-87`, `119-121`).

### Payroll correctness notes

- The progressive tax implementation is bracket-by-bracket and rounds only at the end (`money.ts:116-134`), which is good.
- Insurance skip rule uses `unpaidDays = standardWorkDays - paidDays` and skips when `>= 14` (`payroll.service.ts:102-109`). This follows the stated rule in module comments, but it treats all non-paid days by payroll standard days, not necessarily legally counted “working days not working/unpaid” if attendance data is incomplete.
- Paid leave aggregation only counts leave requests whose `start_date` is inside the month (`payroll.service.ts:221-230`). The leave request schema/test disallows spanning months, so this is consistent with current constraints.
- Potential business risk: insurance base is floored to regional minimum wage even for a lower base salary (`payroll.service.ts:97`). Tests expect this (`payroll.test.ts:139-145`), but real-world applicability can vary by contract/part-time/minimum salary rules. Keep policy configurable.

## 4. PERMISSION MODEL

The manifest uses nested permission objects with `id`, `description`, `actions` (`manifest.json:27-43`). Host `PERMISSION_REGISTRY` uses flat string keys via helper `p(key, description, ...)` (`packages/core/src/permissions.ts:7-12`) and currently has only older HR permissions: `hr.employee.create`, `hr.attendance.checkin`, `hr.attendance.checkout`, `hr.shift.create` (`permissions.ts:23-26`). Manifest validation checks flat registry keys (`packages/core/src/manifest.ts:16`, `36`). Therefore, all Soul permissions must be registered as flat keys before manifest validation/integration.

Required permission ids:

1. `hr.employee.read`
2. `hr.employee.write`
3. `hr.org.read`
4. `hr.attendance.read`
5. `hr.attendance.write`
6. `hr.leave.read`
7. `hr.leave.write`
8. `hr.leave.approve`
9. `hr.payroll.read`
10. `hr.payroll.run`
11. `hr.payroll.approve`
12. `hr.report.read`
13. `hr.recruitment.read`
14. `hr.recruitment.write`
15. `hr.training.write`

Recommended security levels/sensitivity: payroll read/run/approve and employee write should likely be level 2 / sensitive; attendance write, leave approve, recruitment/training write may also be sensitive depending on host policy.

## 5. DEPENDENCY / API MISMATCH

Module `package.json` requests:

- `drizzle-orm ^0.45.2`
- `@electric-sql/pglite ^0.5.4`
- `zod ^4.4.3`
- TypeScript 6 / Node types 26

The task states host uses Drizzle `^0.36`, PGlite `^0.2`, and older stack.

### Likely breakpoints

- **Drizzle table callback arrays:** `schema.ts` uses new-style callback returning arrays for indexes, e.g. `(t) => [uniqueIndex(...), index(...)]` (`schema.ts:21-24`, many others). Drizzle 0.36 commonly used object-return style; array-return may not typecheck/compile under host version.
- **PGlite driver import:** smoke test imports `drizzle` from `drizzle-orm/pglite` (`smoke.test.ts:14`). This may not exist or may differ in Drizzle 0.36/PGlite 0.2.
- **PGlite behavior:** smoke test relies on roles/RLS/`SET LOCAL ROLE` in PGlite (`smoke.test.ts:54-67`, `306-321`). Older PGlite may not support the same role/RLS semantics.
- **Zod v4:** schemas use Zod APIs that are mostly stable (`schemas.ts`), but host Zod v3 may not accept a package requiring v4. The code uses `z.infer`, `z.coerce.number()`, `z.enum`, `z.union`, `refine`; these are available in v3, but dependency resolution/type packages may break if module is compiled against v4.
- **SQL regex operator in service:** employee code generation uses Postgres regex `~` (`employee.service.ts:32-33`); this is Postgres-specific and may fail if host swaps dialect/test DB.

## 6. TEST INVENTORY

### `tests/payroll.test.ts`

Self-contained pure unit test; no DB or host wiring. It imports money/config/payroll engine and uses a custom `check`/`eqM` harness.

Inventory: **47 checks** by manual count.

Coverage:

- money decimal arithmetic: add/mulDiv/round0/cmp (`payroll.test.ts:29-34`)
- PIT progressive tax: 0, bracket edges, multi-bracket values (`36-43`)
- payroll cases: 20m salary, 30m + 1 dependent, 120m cap July 2026, 120m June 2026, OT tax exemption, >=14 unpaid days insurance skip, regional minimum floor (`45-145`).

Can run standalone if dependencies compile. It does not require PGlite or host wiring.

### `tests/smoke.test.ts`

Self-contained integration smoke using in-process PGlite, migrations, tools, routes, event bus, and RLS role setup (`smoke.test.ts:11-24`, `50-67`).

Inventory: **72 actual checks** as written, not 62, because test #59 loops over 10 required event names (`smoke.test.ts:279-283`) and each loop calls `check`. The file labels final checks through 62, but the counter will report higher.

Coverage:

- tool registry: 18 tools, 8 read, 10 write, permissions, 18 routes (`75-86`)
- golden path employee/dependent/search/profile (`90-125`)
- attendance records/duplicates/time validation (`129-174`)
- leave request/balance/approval guards (`178-219`)
- payroll run/payslip/approve/lock (`221-267`)
- org chart/headcount, recruitment/training, employee update/termination (`269-303`)
- RLS tenant isolation + fail-closed missing org (`305-326`)
- event bus org_id and required event names (`328-337`)
- `0002` backfill idempotence with synthetic legacy tables (`339-363`)
- read-tools classification (`366-367`)

Can run standalone only with the module’s dependency versions; under host’s older Drizzle/PGlite it may fail before exercising logic. It does not require host app wiring.

## 7. OTHER MODULE FILES

- Manifest correctly declares `conflicts: ["hr"]` (`manifest.json:7`) and 8 read tools + 10 write actions (`manifest.json:44-62`). But the conflict declaration is not enough by itself to prevent DB table collisions if migrations are applied alongside existing HR.
- Tool registry matches manifest names/permissions (`src/tools/index.ts:77-253`).
- Validation schemas are reasonably strict at the boundary (`src/validation/schemas.ts:10-184`).
- Intents map Vietnamese/English examples to tools (`src/intents.ts:16-164`), but some examples contain placeholder UUID (`src/intents.ts:119`) and must not be executed without context.
- Author `AUDIT_REPORT.md` claims `321/321 PASS` (`AUDIT_REPORT.md:5`) and validates internal structure/RLS/permissions, but it does not address the host’s existing `hr_*` table shape collisions nor the flat host permission registry mismatch. Treat it as an internal self-audit, not an integration safety audit.

## 8. TOP RISKS RANKED

1. **Critical — Existing host `hr_*` table collisions.** Soul’s `CREATE TABLE IF NOT EXISTS` will not reshape old `hr_shifts`, `hr_employees`, `hr_attendance`, `hr_leave_types`; services will fail and `0001_rls` may break old HR.
2. **Critical — Unguarded `0002_backfill_legacy.sql`.** It checks only table existence, not shape; a live `employees` or `departments` table with different columns/types can fail or pollute target data.
3. **High — Permission registry mismatch.** Manifest permission ids are not in host `PERMISSION_REGISTRY`; validation/authorization will fail unless flat keys are added.
4. **High — Dependency mismatch.** Drizzle/PGlite/Zod versions are newer than host; schema callback and pglite driver imports are likely compile/test breakpoints.
5. **High — RLS migration applied to old tables.** If `0001_rls` runs against pre-existing old `hr_*`, it forces tenant policies with Soul assumptions and may block old module behavior.
6. **Medium — Payroll business-law edge cases.** Core stated 2026 numbers are implemented, but insurance skip and minimum-base logic are simplified/config-driven and need legal/product signoff.
7. **Medium — Author audit overstates integration readiness.** `321/321 PASS` ignores host collision and dependency mismatches.
8. **Medium — Tests are strong but version-sensitive.** Payroll tests are pure; smoke tests are useful but may not run on host versions and use synthetic legacy tables matching the module’s assumptions.

## Final deployment recommendation

- **Do not include `0002_backfill_legacy.sql` in the initial host deploy.** Mark it as a manual, post-install migration only after explicit schema verification and backup.
- **Do not apply `0000/0001` until the existing `modules/hr` schema conflict is resolved.** Options: remove/retire old HR module migrations in a controlled migration, rename Soul tables with a non-conflicting namespace, or write an explicit migration from old `hr_*` shape to Soul shape.
- Register all 15 flat permission keys in `packages/core/src/permissions.ts` before manifest validation.
- Align module dependencies to host or upgrade host intentionally; run typecheck and both tests after alignment.
