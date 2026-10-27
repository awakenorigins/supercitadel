/**
 * MODULE KHO — entry point + lifecycle (mặt cắt ②)
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
import type { EventBus, KhoDb } from './types.js';
import { khoTools } from './tools/index.js';
import { khoIntents } from './intents.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = ['0000_init.sql', '0001_rls.sql', '0002_backfill_legacy.sql', '0003_v2_final.sql', '0004_v2_rls.sql', '0005_v2_1_automation.sql', '0006_v2_1_rls.sql'];

export interface KhoHostContext {
  db: KhoDb;
  bus: EventBus;
  /** Registry của host — module đăng ký tool/intent vào đây lúc activate */
  registry?: {
    registerTool(moduleId: string, tool: unknown): void;
    registerIntent(moduleId: string, intent: unknown): void;
    unregisterModule(moduleId: string): void;
  };
}

export const MODULE_ID = 'soul-inventory';

/** INSTALL — chạy migrations (idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS) */
export async function onInstall(host: KhoHostContext): Promise<void> {
  for (const file of MIGRATIONS) {
    const ddl = await readFile(join(__dir, '..', 'migrations', file), 'utf8');
    await host.db.execute(sql.raw(ddl));
  }
  await host.bus.emit('kho.module.installed', { org_id: 'system', version: '1.0.0' });
}

/** ACTIVATE — đăng ký tool + intent vào registry của host (atomic all-or-none phía host) */
export async function onActivate(host: KhoHostContext): Promise<void> {
  if (host.registry) {
    for (const tool of khoTools) host.registry.registerTool(MODULE_ID, tool);
    for (const intent of khoIntents) host.registry.registerIntent(MODULE_ID, intent);
  }
  await host.bus.emit('kho.module.activated', { org_id: 'system' });
}

/** DISABLE — thu hồi sạch mọi đăng ký; dữ liệu GIỮ NGUYÊN (chỉ remove mới xóa) */
export async function onDisable(host: KhoHostContext): Promise<void> {
  host.registry?.unregisterModule(MODULE_ID);
  await host.bus.emit('kho.module.disabled', { org_id: 'system' });
}

/** REMOVE — gỡ hoàn toàn. Mặc định KHÔNG drop bảng (an toàn dữ liệu);
 *  host truyền dropData=true nếu thật sự muốn xóa. */
export async function onRemove(host: KhoHostContext, opts?: { dropData?: boolean }): Promise<void> {
  host.registry?.unregisterModule(MODULE_ID);
  if (opts?.dropData) {
    await host.db.execute(sql.raw(`
      DROP TABLE IF EXISTS kho_stocktake_lines, kho_stocktakes,
        kho_reservations, kho_movements, kho_stock_levels,
        kho_locations, kho_items CASCADE;
    `));
  }
  await host.bus.emit('kho.module.removed', { org_id: 'system' });
}

// Public API của module — host import từ một cổng duy nhất
export { khoTools, khoReadTools, khoWriteActions, getKhoTool } from './tools/index.js';
export { executeAction } from './contract.js';
export { runScheduledTasks } from './services/automation.service.js';
export type {
  HostModuleDeps, HostAuditSink, HostDb, HostEventBus,
  ActionExecuteInput, DryRunPreview,
} from './contract.js';
export { khoIntents } from './intents.js';
export { khoSchema } from './db/schema.js';
export { createKhoRoutes, createSoulInventoryExtraRoutes, createSoulInventoryV2Routes, createSoulInventoryAutomationRoutes } from './routes.js';
export * from './types.js';
