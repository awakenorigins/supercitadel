// Item routes (V7A P3 — G3/G4): store vật phẩm + kho chứa + sử dụng.
// GET  /store/items            → catalog + giá (toàn cục)
// POST /store/items/:code/buy  → trừ Om THẬT (transaction) + vào kho + audit
// GET  /inventory-items        → kho của user (org+user filter — hiến pháp #1)
// POST /inventory-items/:id/use → hiệu ứng THẬT (energy/theme) + trừ qty + audit
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { AppError, type JwtPayload } from '@citadel/core';
import { listCatalog, buyItem, listOwned, useItem, listOwnedThemes, selectTheme } from './service.js';

declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;
const userOf = (c: any) => (c.get('auth') as JwtPayload).sub;

type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

export function buildStoreItemRoutes(deps: { db: any; requireAuth: MiddlewareHandler; audit?: AuditFn }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : (console.error('[store-items]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);

  // Catalog vật phẩm đang bán
  r.get('/items', async (c) => c.json({ items: await listCatalog(deps.db) }));

  // Mua — trừ Om thật (R5: body {qty} mua nhiều trong 1 giao dịch), cộng kho, audit
  r.post('/items/:code/buy', async (c) => {
    const code = c.req.param('code');
    const body = await c.req.json().catch(() => ({}));
    const qty = body?.qty === undefined ? 1 : Number(body.qty);
    const res = await buyItem(deps.db, orgOf(c), userOf(c), code, qty);
    await deps.audit?.(c, { action: 'store.item_purchase', resource: 'item_catalog', resourceId: code, detail: { paidOm: res.paidOm, qtyBought: res.qtyBought, qty: res.owned.qty } });
    return c.json({
      ok: true,
      item: { code: res.item.code, name: res.item.name },
      paidOm: res.paidOm,
      qtyBought: res.qtyBought,
      balance: res.balance,
      qty: res.owned.qty,
      message: `Đã mua ${res.qtyBought > 1 ? `${res.qtyBought} × ` : ''}${res.item.name} (−${res.paidOm} Om · còn ${res.balance.toLocaleString('vi')}) — vào Kho vật phẩm để dùng nha!`,
    });
  });

  return r;
}

export function buildInventoryItemRoutes(deps: { db: any; requireAuth: MiddlewareHandler; audit?: AuditFn }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : (console.error('[inventory-items]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);

  // Kho của user — info đầy đủ từ catalog
  r.get('/', async (c) => c.json({ items: await listOwned(deps.db, orgOf(c), userOf(c)) }));

  // R7.7: danh sách theme dùng được (jade Cơ Bản + theme đã sở hữu) + theme đang bật
  r.get('/themes', async (c) => {
    const owned = await listOwnedThemes(deps.db, orgOf(c), userOf(c));
    return c.json({ owned });
  });

  // R7.7: chọn theme đã sở hữu / về Cơ Bản (jade) — KHÔNG tiêu hao vật phẩm
  r.post('/themes/select', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const theme = String(body?.theme ?? 'jade');
    const res = await selectTheme(deps.db, orgOf(c), userOf(c), theme);
    await deps.audit?.(c, { action: 'tieu_tam.theme_select', resource: 'tt_soul_state', detail: { theme } });
    return c.json({ ok: true, theme: res.theme, message: theme === 'jade' ? 'Đã về Theme Cơ Bản 🦊' : 'Đã đổi theme — giao diện + avatar thay ngay ✨' });
  });

  // Sử dụng — hiệu ứng thật + trừ qty + audit
  r.post('/:id/use', async (c) => {
    const id = c.req.param('id');
    const res = await useItem(deps.db, orgOf(c), userOf(c), id);
    await deps.audit?.(c, {
      action: 'item.use', resource: 'user_items', resourceId: id,
      detail: { itemCode: res.item.code, effect: res.effect, energyBefore: res.energyBefore, energyAfter: res.energyAfter, theme: res.theme },
    });
    return c.json({
      ok: true,
      message: res.message,
      item: res.item,
      effect: res.effect,
      energyBefore: res.energyBefore,
      energyAfter: res.energyAfter,
      theme: res.theme,
      qtyLeft: res.qtyLeft,
      energy: Math.round(res.soul.energy),
      status: res.soul.status,
    });
  });

  return r;
}
