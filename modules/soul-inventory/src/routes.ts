/**
 * MODULE KHO — Hono routes (lớp HTTP mỏng)
 * Host mount router này SAU chuỗi middleware chuẩn Citadel:
 * auth → rbac → tenant-rls (SET LOCAL app.current_org_id) → handler.
 * Mọi mutation validate Zod tại biên (mặt cắt ⑦). Route chỉ gọi service —
 * không chứa logic nghiệp vụ.
 *
 * Lưu ý: file này KHÔNG import 'hono' trực tiếp để module không khóa
 * cứng version — host truyền Hono app factory vào (dependency injection).
 */
import type { KhoCtx } from './types.js';
import {
  itemUpsertSchema, receiveStockSchema, issueStockSchema,
  transferStockSchema, queryStockSchema, lowAlertsSchema,
  reservationManageSchema, stocktakeExecuteSchema,
} from './validation/schemas.js';
import { upsertItem } from './services/catalog.service.js';
import {
  receiveStock, issueStock, transferStock, queryStock,
  lowStockAlerts, movementHistory,
} from './services/stock.service.js';
import { manageReservation } from './services/reservation.service.js';
import { executeStocktake } from './services/stocktake.service.js';
import { KhoError } from './types.js';

/** Interface tối thiểu của Hono-like router — host cung cấp app thật */
export interface MinimalRouter {
  post(path: string, handler: (c: MinimalContext) => Promise<Response>): void;
  get(path: string, handler: (c: MinimalContext) => Promise<Response>): void;
}
export interface MinimalContext {
  req: {
    json(): Promise<unknown>;
    query(key: string): string | undefined;
    param(key: string): string;
  };
  /** Host middleware đã gắn sẵn KhoCtx (db + orgId + userId + bus) vào biến này */
  get(key: 'khoCtx'): KhoCtx;
  json(data: unknown, status?: number): Response;
}

function errorToResponse(c: MinimalContext, err: unknown): Response {
  if (err instanceof KhoError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, 422);
  }
  if (err && typeof err === 'object' && 'issues' in err) { // ZodError
    return c.json({ error: { code: 'INVALID_INPUT', issues: (err as { issues: unknown }).issues } }, 400);
  }
  throw err; // lỗi hệ thống → error middleware của host xử lý + log
}

/** Gắn toàn bộ route của module vào router host cung cấp */
export function createKhoRoutes(app: MinimalRouter): void {
  app.post('/inventory/items', async (c) => {
    try {
      const input = itemUpsertSchema.parse(await c.req.json());
      return c.json(await upsertItem(c.get('khoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/inventory/stock', async (c) => {
    try {
      const input = queryStockSchema.parse({
        sku: c.req.query('sku'),
        keyword: c.req.query('keyword'),
        location_code: c.req.query('location'),
        limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      });
      return c.json(await queryStock(c.get('khoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/inventory/stock/receive', async (c) => {
    try {
      const input = receiveStockSchema.parse(await c.req.json());
      return c.json(await receiveStock(c.get('khoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/inventory/stock/issue', async (c) => {
    try {
      const input = issueStockSchema.parse(await c.req.json());
      return c.json(await issueStock(c.get('khoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/inventory/stock/transfer', async (c) => {
    try {
      const input = transferStockSchema.parse(await c.req.json());
      return c.json(await transferStock(c.get('khoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/inventory/stock/low-alerts', async (c) => {
    try {
      const input = lowAlertsSchema.parse({
        location_code: c.req.query('location'),
        limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      });
      return c.json(await lowStockAlerts(c.get('khoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/inventory/stock/history/:sku', async (c) => {
    try {
      return c.json(await movementHistory(c.get('khoCtx'), c.req.param('sku')));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/inventory/reservations', async (c) => {
    try {
      const input = reservationManageSchema.parse(await c.req.json());
      return c.json(await manageReservation(c.get('khoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/inventory/stocktakes', async (c) => {
    try {
      const input = stocktakeExecuteSchema.parse(await c.req.json());
      return c.json(await executeStocktake(c.get('khoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });
}

/** Routes bổ sung Soul-Inventory v1.1 — gắn thêm sau createKhoRoutes(app) */
export function createSoulInventoryExtraRoutes(app: MinimalRouter): void {
  app.get('/inventory/stock/expiry-alerts', async (c) => {
    try {
      const { expiryAlertsSchema } = await import('./validation/schemas.js');
      const { expiryAlerts } = await import('./services/lot.service.js');
      const input = expiryAlertsSchema.parse({
        within_days: c.req.query('days') ? Number(c.req.query('days')) : undefined,
        limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      });
      return c.json(await expiryAlerts(c.get('khoCtx'), input.within_days, input.limit));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/inventory/stock/card/:sku', async (c) => {
    try {
      const { stockCard } = await import('./services/report.service.js');
      return c.json(await stockCard(c.get('khoCtx'), c.req.param('sku')));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/inventory/summary', async (c) => {
    try {
      const { inventorySummary } = await import('./services/report.service.js');
      return c.json(await inventorySummary(c.get('khoCtx')));
    } catch (e) { return errorToResponse(c, e); }
  });
}

/** Routes v2.0 — UoM, BOM, assembly, reorder, picking, landed cost, scrap, analytics, Excel */
export function createSoulInventoryV2Routes(app: MinimalRouter): void {
  // ── UoM ──
  app.post('/inventory/uoms', async (c) => {
    try {
      const { uomUpsertSchema } = await import('./validation/schemas.js');
      const { getKhoTool } = await import('./tools/index.js');
      const input = uomUpsertSchema.parse(await c.req.json());
      return c.json(await getKhoTool('kho.uom.upsert')!.handler(c.get('khoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ── Barcode lookup ──
  app.get('/inventory/barcode/:code', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.barcode.lookup')!.handler(
        c.get('khoCtx'), { barcode: c.req.param('code') }));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ── BOM ──
  app.post('/inventory/boms', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.bom.upsert')!.handler(c.get('khoCtx'), await c.req.json()));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.get('/inventory/boms/:sku', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.bom.info')!.handler(
        c.get('khoCtx'), { sku: c.req.param('sku') }));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.post('/inventory/assembly', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.assembly.execute')!.handler(c.get('khoCtx'), await c.req.json()));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ── Reorder ──
  app.post('/inventory/reorder-rules', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.reorder.rule_upsert')!.handler(c.get('khoCtx'), await c.req.json()));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.get('/inventory/reorder-suggestions', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.reorder.suggest')!.handler(c.get('khoCtx'), {}));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ── Picking suggestion ──
  app.post('/inventory/picking-suggest', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.picking.suggest')!.handler(c.get('khoCtx'), await c.req.json()));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ── Landed cost + Scrap ──
  app.post('/inventory/landed-costs', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.landed_cost.apply')!.handler(c.get('khoCtx'), await c.req.json()));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.post('/inventory/scrap', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.stock.scrap')!.handler(c.get('khoCtx'), await c.req.json()));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ── Analytics ──
  app.post('/inventory/abc-analysis', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.abc.run')!.handler(c.get('khoCtx'), await c.req.json().catch(() => ({}))));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.get('/inventory/analytics', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.analytics.report')!.handler(c.get('khoCtx'), {}));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ── Excel: import (multipart base64 JSON {file_base64}) + export ──
  app.post('/inventory/excel/import-items', async (c) => {
    try {
      const { importItems } = await import('./services/excel.service.js');
      const body = await c.req.json() as { file_base64: string };
      return c.json(await importItems(c.get('khoCtx'), Buffer.from(body.file_base64, 'base64')));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.post('/inventory/excel/import-stock', async (c) => {
    try {
      const { importOpeningStock } = await import('./services/excel.service.js');
      const body = await c.req.json() as { file_base64: string; ref?: string };
      return c.json(await importOpeningStock(c.get('khoCtx'), Buffer.from(body.file_base64, 'base64'), body.ref));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.get('/inventory/excel/export-stock', async (c) => {
    try {
      const { exportStockReport } = await import('./services/excel.service.js');
      const buf = await exportStockReport(c.get('khoCtx'));
      return c.json({ filename: 'ton-kho.xlsx', file_base64: buf.toString('base64') });
    } catch (e) { return errorToResponse(c, e); }
  });
  app.get('/inventory/excel/export-card/:sku', async (c) => {
    try {
      const { exportStockCard } = await import('./services/excel.service.js');
      const buf = await exportStockCard(c.get('khoCtx'), c.req.param('sku'));
      return c.json({ filename: `the-kho-${c.req.param('sku')}.xlsx`, file_base64: buf.toString('base64') });
    } catch (e) { return errorToResponse(c, e); }
  });
}

/** Routes v2.1 — AUTOMATION: replenish, projected, dead stock, XYZ, scheduled run */
export function createSoulInventoryAutomationRoutes(app: MinimalRouter): void {
  app.post('/inventory/replenish-params', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.replenish.params_set')!.handler(c.get('khoCtx'), await c.req.json()));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.get('/inventory/replenish-suggestions', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.replenish.suggest')!.handler(c.get('khoCtx'), {}));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.get('/inventory/projected', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      const days = c.req.query('days');
      return c.json(await getKhoTool('kho.forecast.projected')!.handler(
        c.get('khoCtx'), days ? { horizon_days: Number(days) } : {}));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.get('/inventory/dead-stock', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      const idle = c.req.query('idle_days');
      return c.json(await getKhoTool('kho.analytics.dead_stock')!.handler(
        c.get('khoCtx'), idle ? { idle_days: Number(idle) } : {}));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.post('/inventory/xyz-analysis', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.xyz.run')!.handler(
        c.get('khoCtx'), await c.req.json().catch(() => ({}))));
    } catch (e) { return errorToResponse(c, e); }
  });
  app.post('/inventory/automation/run', async (c) => {
    try {
      const { getKhoTool } = await import('./tools/index.js');
      return c.json(await getKhoTool('kho.automation.run')!.handler(
        c.get('khoCtx'), await c.req.json().catch(() => ({}))));
    } catch (e) { return errorToResponse(c, e); }
  });
}
