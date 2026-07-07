/**
 * SOUL-RESTAURANT — Hono routes (lớp HTTP mỏng)
 * Host mount router này SAU chuỗi middleware chuẩn Citadel:
 * auth → rbac → tenant-rls (SET LOCAL app.current_org_id) → handler.
 * Mọi mutation validate Zod tại biên (mặt cắt ⑦). Route chỉ gọi service —
 * không chứa logic nghiệp vụ. 31 endpoint = 31 năng lực, không nút chết.
 *
 * Lưu ý: KHÔNG import 'hono' trực tiếp để module không khóa cứng version —
 * host truyền app thật vào (dependency injection).
 */
import type { RestoCtx } from './types.js';
import { RestoError } from './types.js';
import {
  tableMapSchema, menuSearchSchema, itemInfoSchema, orderViewSchema,
  openOrdersSchema, kdsQueueSchema, billViewSchema, reservationListSchema,
  salesReportSchema, topItemsSchema,
  tableUpsertSchema, tableOpenSchema, addItemsSchema, sendKitchenSchema,
  kdsUpdateSchema, serveSchema, cancelItemSchema, moveTableSchema,
  mergeOrdersSchema, discountSchema, billCreateSchema, payBillSchema,
  voidBillSchema, cancelOrderSchema, reservationManageSchema,
  menuUpsertSchema, setAvailabilitySchema, recipeSetSchema, settingsUpdateSchema,
  promoListSchema, customerLookupSchema, customerListSchema, loyaltyHistorySchema,
  promoUpsertSchema, promoApplySchema, customerUpsertSchema, orderSetCustomerSchema,
  loyaltyAdjustSchema, fireCourseSchema, consoleDashboardSchema,
} from './validation/schemas.js';
import { restoUiCatalog, restoUiSummary } from './ui-catalog.js';
import { tableMap, upsertTable } from './services/table.service.js';
import {
  menuSearch, itemInfo, upsertMenuItem, setAvailability,
  setRecipe, recipeCoverage,
} from './services/catalog.service.js';
import {
  openOrder, addItems, orderView, openOrders, cancelItem,
  applyDiscount, moveTable, mergeOrders, cancelOrder, setOrderCustomer,
} from './services/order.service.js';
import { sendKitchen, kdsUpdate, kdsQueue, serveItems, fireCourse } from './services/kitchen.service.js';
import { createBill, payBill, voidBill, billView } from './services/billing.service.js';
import { manageReservation, listReservations } from './services/reservation.service.js';
import { salesSummary, topItems } from './services/report.service.js';
import { getSettings, updateSettings } from './services/settings.service.js';
import { upsertPromo, listPromos, applyPromo } from './services/promotion.service.js';
import { upsertCustomer, lookupCustomer, listCustomers } from './services/customer.service.js';
import { adjustPoints, loyaltyHistory } from './services/loyalty.service.js';
import { dashboard } from './services/console.service.js';

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
  /** Host middleware đã gắn sẵn RestoCtx (db + orgId + userId + bus) vào biến này */
  get(key: 'restoCtx'): RestoCtx;
  json(data: unknown, status?: number): Response;
}

function errorToResponse(c: MinimalContext, err: unknown): Response {
  if (err instanceof RestoError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, 422);
  }
  if (err && typeof err === 'object' && 'issues' in err) { // ZodError
    return c.json({ error: { code: 'INVALID_INPUT', issues: (err as { issues: unknown }).issues } }, 400);
  }
  throw err; // lỗi hệ thống → error middleware của host xử lý + log
}

const num = (v: string | undefined) => (v !== undefined ? Number(v) : undefined);
const bool = (v: string | undefined) => (v !== undefined ? v === 'true' : undefined);

/** Gắn toàn bộ route của module vào router host cung cấp */
export function createRestoRoutes(app: MinimalRouter): void {
  // ───────────── BÀN & SƠ ĐỒ SÀN ─────────────
  app.get('/restaurant/tables/map', async (c) => {
    try {
      const input = tableMapSchema.parse({ area: c.req.query('area') });
      return c.json(await tableMap(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/tables', async (c) => {
    try {
      const input = tableUpsertSchema.parse(await c.req.json());
      return c.json(await upsertTable(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── ĐƠN HÀNG ─────────────
  app.post('/restaurant/orders/open', async (c) => {
    try {
      const input = tableOpenSchema.parse(await c.req.json());
      return c.json(await openOrder(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/items', async (c) => {
    try {
      const input = addItemsSchema.parse(await c.req.json());
      return c.json(await addItems(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/send-kitchen', async (c) => {
    try {
      const input = sendKitchenSchema.parse(await c.req.json());
      return c.json(await sendKitchen(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/fire-course', async (c) => {
    try {
      const input = fireCourseSchema.parse(await c.req.json());
      return c.json(await fireCourse(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/serve', async (c) => {
    try {
      const input = serveSchema.parse(await c.req.json());
      return c.json(await serveItems(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/cancel-item', async (c) => {
    try {
      const input = cancelItemSchema.parse(await c.req.json());
      return c.json(await cancelItem(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/discount', async (c) => {
    try {
      const input = discountSchema.parse(await c.req.json());
      return c.json(await applyDiscount(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/move-table', async (c) => {
    try {
      const input = moveTableSchema.parse(await c.req.json());
      return c.json(await moveTable(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/merge', async (c) => {
    try {
      const input = mergeOrdersSchema.parse(await c.req.json());
      return c.json(await mergeOrders(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/cancel', async (c) => {
    try {
      const input = cancelOrderSchema.parse(await c.req.json());
      return c.json(await cancelOrder(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/restaurant/orders/open-list', async (c) => {
    try {
      const input = openOrdersSchema.parse({ type: c.req.query('type') });
      return c.json(await openOrders(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/restaurant/orders/view', async (c) => {
    try {
      const input = orderViewSchema.parse({
        order_code: c.req.query('order_code'),
        table: c.req.query('table'),
      });
      return c.json(await orderView(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── BẾP / KDS ─────────────
  app.get('/restaurant/kds/queue', async (c) => {
    try {
      const input = kdsQueueSchema.parse({
        station: c.req.query('station'),
        status: c.req.query('status'),
        limit: num(c.req.query('limit')),
      });
      return c.json(await kdsQueue(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/kds/update', async (c) => {
    try {
      const input = kdsUpdateSchema.parse(await c.req.json());
      return c.json(await kdsUpdate(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── MENU & ĐỊNH LƯỢNG ─────────────
  app.get('/restaurant/menu', async (c) => {
    try {
      const input = menuSearchSchema.parse({
        query: c.req.query('query'),
        category: c.req.query('category'),
        include_soldout: bool(c.req.query('include_soldout')),
        limit: num(c.req.query('limit')),
      });
      return c.json(await menuSearch(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/restaurant/menu/item', async (c) => {
    try {
      const input = itemInfoSchema.parse({
        name: c.req.query('name'),
        sku: c.req.query('sku'),
      });
      return c.json(await itemInfo(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/menu', async (c) => {
    try {
      const input = menuUpsertSchema.parse(await c.req.json());
      return c.json(await upsertMenuItem(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/menu/availability', async (c) => {
    try {
      const input = setAvailabilitySchema.parse(await c.req.json());
      return c.json(await setAvailability(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/recipes', async (c) => {
    try {
      const input = recipeSetSchema.parse(await c.req.json());
      return c.json(await setRecipe(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/restaurant/recipes/coverage', async (c) => {
    try {
      return c.json(await recipeCoverage(c.get('restoCtx')));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── BILL & THANH TOÁN ─────────────
  app.post('/restaurant/bills', async (c) => {
    try {
      const input = billCreateSchema.parse(await c.req.json());
      return c.json(await createBill(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/bills/pay', async (c) => {
    try {
      const input = payBillSchema.parse(await c.req.json());
      return c.json(await payBill(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/bills/void', async (c) => {
    try {
      const input = voidBillSchema.parse(await c.req.json());
      return c.json(await voidBill(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/restaurant/bills/view', async (c) => {
    try {
      const input = billViewSchema.parse({
        bill_code: c.req.query('bill_code'),
        order_code: c.req.query('order_code'),
        table: c.req.query('table'),
      });
      return c.json(await billView(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── ĐẶT BÀN ─────────────
  app.post('/restaurant/reservations/manage', async (c) => {
    try {
      const input = reservationManageSchema.parse(await c.req.json());
      return c.json(await manageReservation(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/restaurant/reservations', async (c) => {
    try {
      const input = reservationListSchema.parse({
        date: c.req.query('date'),
        days: num(c.req.query('days')),
        include_done: bool(c.req.query('include_done')),
      });
      return c.json(await listReservations(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── BÁO CÁO ─────────────
  app.get('/restaurant/reports/sales', async (c) => {
    try {
      const input = salesReportSchema.parse({
        from: c.req.query('from'),
        to: c.req.query('to'),
      });
      return c.json(await salesSummary(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/restaurant/reports/top-items', async (c) => {
    try {
      const input = topItemsSchema.parse({
        from: c.req.query('from'),
        to: c.req.query('to'),
        limit: num(c.req.query('limit')),
      });
      return c.json(await topItems(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── CẤU HÌNH ─────────────
  app.get('/restaurant/settings', async (c) => {
    try {
      return c.json(await getSettings(c.get('restoCtx')));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/settings', async (c) => {
    try {
      const input = settingsUpdateSchema.parse(await c.req.json());
      return c.json(await updateSettings(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── v1.1 · KHUYẾN MÃI ─────────────
  app.get('/restaurant/promotions', async (c) => {
    try {
      const input = promoListSchema.parse({ active_only: bool(c.req.query('active_only')) });
      return c.json(await listPromos(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/promotions', async (c) => {
    try {
      const input = promoUpsertSchema.parse(await c.req.json());
      return c.json(await upsertPromo(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/promotions/apply', async (c) => {
    try {
      const input = promoApplySchema.parse(await c.req.json());
      return c.json(await applyPromo(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── v1.1 · KHÁCH HÀNG & ĐIỂM ─────────────
  app.get('/restaurant/customers', async (c) => {
    try {
      const input = customerListSchema.parse({
        query: c.req.query('query'),
        limit: num(c.req.query('limit')),
      });
      return c.json(await listCustomers(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/restaurant/customers/lookup', async (c) => {
    try {
      const input = customerLookupSchema.parse({ phone: c.req.query('phone') });
      return c.json(await lookupCustomer(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/customers', async (c) => {
    try {
      const input = customerUpsertSchema.parse(await c.req.json());
      return c.json(await upsertCustomer(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/orders/set-customer', async (c) => {
    try {
      const input = orderSetCustomerSchema.parse(await c.req.json());
      return c.json(await setOrderCustomer(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.get('/restaurant/loyalty/history', async (c) => {
    try {
      const input = loyaltyHistorySchema.parse({
        phone: c.req.query('phone'),
        limit: num(c.req.query('limit')),
      });
      return c.json(await loyaltyHistory(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  app.post('/restaurant/loyalty/adjust', async (c) => {
    try {
      const input = loyaltyAdjustSchema.parse(await c.req.json());
      return c.json(await adjustPoints(c.get('restoCtx'), input));
    } catch (e) { return errorToResponse(c, e); }
  });

  // ───────────── v1.2 · BẢNG ĐIỀU KHIỂN ─────────────
  app.get('/restaurant/dashboard', async (c) => {
    try {
      consoleDashboardSchema.parse({});
      return c.json(await dashboard(c.get('restoCtx')));
    } catch (e) { return errorToResponse(c, e); }
  });

  // Catalog năng lực cho UI render động (không cần org — meta tĩnh của module)
  app.get('/restaurant/capabilities', async (c) => {
    try {
      return c.json({ summary: restoUiSummary, capabilities: restoUiCatalog });
    } catch (e) { return errorToResponse(c, e); }
  });
}
