/**
 * SOUL-MANAGER — entry point + lifecycle (mặt cắt ②)
 * Vòng đời duy nhất: available → installed → active → disabled → removed.
 * Đăng ký (tool/intent/route) chỉ lúc activate; thu hồi sạch lúc disable —
 * module rời đi không để lại rác.
 *
 * Host (Citadel core) gọi các hook này qua manifest.hooks.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { EventBus, HrDb } from './types.js';
import { hrTools } from './tools/index.js';
import { hrIntents } from './intents.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = ['0000_init.sql', '0001_rls.sql', '0002_backfill_legacy.sql'];

export interface HrHostContext {
  db: HrDb;
  bus: EventBus;
  /** Registry của host — module đăng ký tool/intent vào đây lúc activate */
  registry?: {
    registerTool(moduleId: string, tool: unknown): void;
    registerIntent(moduleId: string, intent: unknown): void;
    unregisterModule(moduleId: string): void;
  };
}

export const MODULE_ID = 'soul-manager';
export const MODULE_VERSION = '1.0.0';

/** INSTALL — chạy migrations (idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS) */
export async function onInstall(host: HrHostContext): Promise<void> {
  for (const file of MIGRATIONS) {
    const ddl = await readFile(join(__dir, '..', 'migrations', file), 'utf8');
    await host.db.execute(sql.raw(ddl));
  }
  await host.bus.emit('hr.module.installed', { org_id: 'system', version: MODULE_VERSION });
}

/** ACTIVATE — đăng ký tool + intent vào registry của host (atomic all-or-none phía host) */
export async function onActivate(host: HrHostContext): Promise<void> {
  if (host.registry) {
    for (const tool of hrTools) host.registry.registerTool(MODULE_ID, tool);
    for (const intent of hrIntents) host.registry.registerIntent(MODULE_ID, intent);
  }
  await host.bus.emit('hr.module.activated', { org_id: 'system' });
}

/** DISABLE — thu hồi sạch mọi đăng ký; dữ liệu GIỮ NGUYÊN (chỉ remove mới xóa) */
export async function onDisable(host: HrHostContext): Promise<void> {
  host.registry?.unregisterModule(MODULE_ID);
  await host.bus.emit('hr.module.disabled', { org_id: 'system' });
}

/** REMOVE — gỡ hoàn toàn. Mặc định KHÔNG drop bảng (an toàn dữ liệu);
 *  host truyền dropData=true nếu thật sự muốn xóa. */
export async function onRemove(host: HrHostContext, opts?: { dropData?: boolean }): Promise<void> {
  host.registry?.unregisterModule(MODULE_ID);
  if (opts?.dropData) {
    await host.db.execute(sql.raw(`
      DROP TABLE IF EXISTS sm_enrollments, sm_courses, sm_candidates,
        sm_job_openings, sm_payslips, sm_payroll_periods,
        sm_leave_requests, sm_leave_balances, sm_leave_types,
        sm_attendance, sm_shifts, sm_allowances, sm_dependents,
        sm_contracts, sm_employees, sm_positions, sm_departments,
        sm_settings CASCADE;
    `));
  }
  await host.bus.emit('hr.module.removed', { org_id: 'system' });
}

// Public API của module — host import từ một cổng duy nhất
export {
  hrTools, hrReadTools, hrWriteActions, hrRecruitmentReadTools, getHrTool,
} from './tools/index.js';
export { hrIntents } from './intents.js';
export { hrSchema } from './db/schema.js';
export { createHrRoutes } from './routes.js';
export { M, progressiveTax } from './money.js';
export { DEFAULT_POLICY, mergePolicy } from './config.js';
export { computePayslipNumbers } from './services/payroll.service.js';
export * from './types.js';
