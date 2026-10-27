/**
 * SOUL-RESTAURANT — entry point + lifecycle (mặt cắt ②)
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
import type { EventBus, RestoDb } from './types.js';
import { restoTools } from './tools/index.js';
import { restoIntents } from './intents.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = ['0000_init.sql', '0001_rls.sql', '0002_v1_1_loyalty.sql', '0003_v1_1_rls.sql'];

export interface RestoHostContext {
  db: RestoDb;
  bus: EventBus;
  /** Registry của host — module đăng ký tool/intent vào đây lúc activate */
  registry?: {
    registerTool(moduleId: string, tool: unknown): void;
    registerIntent(moduleId: string, intent: unknown): void;
    unregisterModule(moduleId: string): void;
  };
}

export const MODULE_ID = 'soul-restaurant';

/** INSTALL — chạy migrations (idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS) */
export async function onInstall(host: RestoHostContext): Promise<void> {
  for (const file of MIGRATIONS) {
    const ddl = await readFile(join(__dir, '..', 'migrations', file), 'utf8');
    await host.db.execute(sql.raw(ddl));
  }
  await host.bus.emit('resto.module.installed', { org_id: 'system', version: '1.0.0' });
}

/** ACTIVATE — đăng ký tool + intent vào registry của host (atomic all-or-none phía host) */
export async function onActivate(host: RestoHostContext): Promise<void> {
  if (host.registry) {
    for (const tool of restoTools) host.registry.registerTool(MODULE_ID, tool);
    for (const intent of restoIntents) host.registry.registerIntent(MODULE_ID, intent);
  }
  await host.bus.emit('resto.module.activated', { org_id: 'system' });
}

/** DISABLE — thu hồi sạch mọi đăng ký; dữ liệu GIỮ NGUYÊN (chỉ remove mới xóa) */
export async function onDisable(host: RestoHostContext): Promise<void> {
  host.registry?.unregisterModule(MODULE_ID);
  await host.bus.emit('resto.module.disabled', { org_id: 'system' });
}

/** REMOVE — gỡ hoàn toàn. Mặc định KHÔNG drop bảng (an toàn dữ liệu);
 *  host truyền dropData=true nếu thật sự muốn xóa. */
export async function onRemove(host: RestoHostContext, opts?: { dropData?: boolean }): Promise<void> {
  host.registry?.unregisterModule(MODULE_ID);
  if (opts?.dropData) {
    await host.db.execute(sql.raw(`
      DROP TABLE IF EXISTS resto_loyalty_ledger, resto_promo_redemptions,
        resto_promotions, resto_customers,
        resto_payments, resto_bill_items, resto_bills,
        resto_kots, resto_order_items, resto_orders, resto_reservations,
        resto_recipes, resto_combo_items, resto_item_option_groups,
        resto_options, resto_option_groups, resto_menu_items,
        resto_menu_categories, resto_stations, resto_tables, resto_areas,
        resto_settings CASCADE;
    `));
  }
  await host.bus.emit('resto.module.removed', { org_id: 'system' });
}

// Public API của module — host import từ một cổng duy nhất
export { restoTools, restoReadTools, restoWriteActions, getRestoTool } from './tools/index.js';
export type { RestoToolDefinition, RestoActionResult } from './tools/index.js';
export { executeAction } from './contract.js';
export type {
  HostModuleDeps, HostAuditSink, HostDb, HostEventBus,
  ActionExecuteInput, DryRunPreview,
} from './contract.js';
export { restoIntents } from './intents.js';
export type { IntentDefinition } from './intents.js';
export { restoUiCatalog, restoUiSummary, UI_GROUPS } from './ui-catalog.js';
export type { UiCapability, UiField, UiFieldType } from './ui-catalog.js';
export { restoSchema } from './db/schema.js';
export { createRestoRoutes } from './routes.js';
export type { MinimalRouter, MinimalContext } from './routes.js';
export * from './types.js';
