// Module registry routes — list catalog với trạng thái org, bật/tắt, mua bằng Om (trừ tiền thật).
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { eq, and } from 'drizzle-orm';
import { AppError, Errors, type JwtPayload } from '@citadel/core';
import { orgModules } from '@citadel/db';
import { MODULE_CATALOG, CORE_IDS } from './catalog.js';
import { spend } from '@citadel/module-om/server/service.js';

declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;

/** Số ngày thuê còn lại (làm tròn lên); null nếu không thuê hoặc đã hết hạn. */
function rentDaysLeft(rentedUntil: Date | null | undefined): number | null {
  if (!rentedUntil) return null;
  const ms = new Date(rentedUntil).getTime() - Date.now();
  if (ms <= 0) return null;
  return Math.ceil(ms / 86_400_000);
}

/** Giá thuê theo gói ngày — % của priceOm, làm tròn lên. */
export const RENT_PLANS: Record<number, number> = { 7: 0.10, 30: 0.25, 90: 0.60 };
export function rentPriceOm(priceOm: number, days: number): number {
  return Math.ceil(priceOm * RENT_PLANS[days]);
}

async function orgState(db: any, orgId: string) {
  const rows = await db.select().from(orgModules).where(eq(orgModules.orgId, orgId));
  const map = new Map(rows.map((r: any) => [r.moduleId, r]));
  return MODULE_CATALOG.map((m) => {
    const r: any = map.get(m.id);
    const isCore = m.tier === 'core';
    const rentedUntil = r?.rentedUntil ? new Date(r.rentedUntil).toISOString() : null;
    return {
      ...m,
      active: isCore ? true : (r?.status === 'active'),
      purchased: isCore || m.tier === 'free' ? true : (r?.purchased ?? false),
      rentedUntil,
      rentDaysLeft: rentDaysLeft(r?.rentedUntil),
    };
  });
}

/** Một module dùng được khi: core, hoặc active + (purchased HOẶC rent còn hạn). */
export async function isModuleActive(db: any, orgId: string, moduleId: string): Promise<boolean> {
  if (CORE_IDS.includes(moduleId)) return true;
  const [r] = await db.select().from(orgModules)
    .where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, moduleId)));
  if (r?.status !== 'active') return false;
  const def = MODULE_CATALOG.find((m) => m.id === moduleId);
  if (def?.tier !== 'paid') return true; // free: chỉ cần active
  const rentOk = r.rentedUntil && new Date(r.rentedUntil).getTime() > Date.now();
  return Boolean(r.purchased || rentOk);
}

/** Middleware gate: chặn API module chưa bật (403 MODULE_INACTIVE) hoặc hết hạn thuê (403 MODULE_RENT_EXPIRED). */
export function requireModule(db: any, moduleId: string): MiddlewareHandler {
  return async (c, next) => {
    const orgId = orgOf(c);
    const ok = await isModuleActive(db, orgId, moduleId);
    if (!ok) {
      // Phân biệt: đã từng thuê nhưng hết hạn → MODULE_RENT_EXPIRED
      const [r] = await db.select().from(orgModules)
        .where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, moduleId)));
      const def = MODULE_CATALOG.find((m) => m.id === moduleId);
      const rentExpired = def?.tier === 'paid' && !r?.purchased && r?.rentedUntil
        && new Date(r.rentedUntil).getTime() <= Date.now();
      if (rentExpired) throw new AppError('MODULE_RENT_EXPIRED' as any, 'Module đã hết hạn thuê — gia hạn trong Cửa hàng', 403);
      throw new AppError('MODULE_INACTIVE' as any, `Module "${moduleId}" chưa kích hoạt — vào Cửa hàng Module để bật`, 403);
    }
    await next();
  };
}

type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

export function buildModuleRoutes(deps: { db: any; requireAuth: MiddlewareHandler; audit?: AuditFn }) {
  const r = new Hono();
  r.onError((err, c) => err instanceof AppError ? c.json(err.toJSON(), err.status as 400) : (console.error('[modules]', err), c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500)));
  r.use('*', deps.requireAuth);

  // GET / — catalog + trạng thái org
  r.get('/', async (c) => c.json({ modules: await orgState(deps.db, orgOf(c)) }));

  // POST /:id/purchase — trừ Om thật, đánh dấu purchased + active
  r.post('/:id/purchase', async (c) => {
    const id = c.req.param('id');
    const def = MODULE_CATALOG.find((m) => m.id === id);
    if (!def) throw Errors.notFound('Module không tồn tại');
    if (def.status !== 'ready') throw Errors.validation('Module sắp ra mắt, chưa mua được');
    if (def.tier !== 'paid') throw Errors.validation('Module này miễn phí — chỉ cần bật');
    const orgId = orgOf(c);
    const [existing] = await deps.db.select().from(orgModules).where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, id)));
    if (existing?.purchased) throw Errors.conflict('Đã mua module này rồi');
    // trừ Om thật (throw conflict nếu không đủ)
    const pay = await spend(deps.db, orgId, def.priceOm, `Mua module ${def.name}`, id);
    if (existing) {
      await deps.db.update(orgModules).set({ purchased: true, status: 'active', activatedAt: new Date() })
        .where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, id)));
    } else {
      await deps.db.insert(orgModules).values({ orgId, moduleId: id, purchased: true, status: 'active', activatedAt: new Date() });
    }
    await deps.audit?.(c, { action: 'module.purchase', resource: 'module', resourceId: id, detail: { paidOm: def.priceOm } });
    return c.json({ ok: true, module: id, paidOm: def.priceOm, balance: pay.balance });
  });

  // POST /:id/rent — thuê module theo gói ngày (7/30/90), trừ Om thật, cộng dồn hạn thuê
  r.post('/:id/rent', async (c) => {
    const id = c.req.param('id');
    const def = MODULE_CATALOG.find((m) => m.id === id);
    if (!def) throw Errors.notFound('Module không tồn tại');
    if (def.status !== 'ready') throw Errors.validation('Module sắp ra mắt, chưa thuê được');
    if (def.tier !== 'paid') throw Errors.validation('Module này miễn phí — chỉ cần bật');
    const body = await c.req.json().catch(() => ({}));
    const days = Number(body?.days);
    if (!RENT_PLANS[days]) throw Errors.validation('Gói thuê không hợp lệ — chọn 7, 30 hoặc 90 ngày', 'days');
    const orgId = orgOf(c);
    const [existing] = await deps.db.select().from(orgModules).where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, id)));
    if (existing?.purchased) throw Errors.conflict('Đã mua đứt module này rồi — không cần thuê');
    const paidOm = rentPriceOm(def.priceOm, days);
    // trừ Om thật — không đủ → 400 kèm message tiếng Việt
    let pay;
    try {
      pay = await spend(deps.db, orgId, paidOm, `Thuê module ${def.name} (${days} ngày)`, id);
    } catch (e: any) {
      if (e instanceof AppError && /Không đủ Om/.test(e.message)) throw Errors.validation(`Không đủ Om để thuê (cần ${paidOm} Om) — nạp thêm vào Ví Om`, 'balance');
      throw e;
    }
    // cộng dồn từ thời điểm còn lại: GREATEST(now, rented_until hiện tại) + days
    const base = existing?.rentedUntil && new Date(existing.rentedUntil).getTime() > Date.now()
      ? new Date(existing.rentedUntil) : new Date();
    const rentedUntil = new Date(base.getTime() + days * 86_400_000);
    if (existing) {
      await deps.db.update(orgModules).set({ rentedUntil, status: 'active', activatedAt: new Date() })
        .where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, id)));
    } else {
      await deps.db.insert(orgModules).values({ orgId, moduleId: id, rentedUntil, status: 'active', activatedAt: new Date() });
    }
    await deps.audit?.(c, { action: 'module.rent', resource: 'module', resourceId: id, detail: { days, paidOm } });
    return c.json({ ok: true, module: id, days, paidOm, rentedUntil: rentedUntil.toISOString(), balance: pay.balance });
  });

  // POST /:id/activate — bật (free: luôn được; paid: phải purchased hoặc rent còn hạn)
  r.post('/:id/activate', async (c) => {
    const id = c.req.param('id');
    const def = MODULE_CATALOG.find((m) => m.id === id);
    if (!def) throw Errors.notFound('Module không tồn tại');
    if (def.status !== 'ready') throw Errors.validation('Module sắp ra mắt');
    if (def.tier === 'core') return c.json({ ok: true, module: id, note: 'Module cốt lõi luôn bật' });
    const orgId = orgOf(c);
    const [existing] = await deps.db.select().from(orgModules).where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, id)));
    const rentOk = existing?.rentedUntil && new Date(existing.rentedUntil).getTime() > Date.now();
    if (def.tier === 'paid' && !existing?.purchased && !rentOk) throw Errors.validation('Cần mua hoặc thuê module trước khi bật', 'purchase');
    if (existing) {
      await deps.db.update(orgModules).set({ status: 'active', activatedAt: new Date() })
        .where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, id)));
    } else {
      await deps.db.insert(orgModules).values({ orgId, moduleId: id, status: 'active', activatedAt: new Date() });
    }
    await deps.audit?.(c, { action: 'module.activate', resource: 'module', resourceId: id });
    return c.json({ ok: true, module: id, active: true });
  });

  // POST /:id/deactivate — tắt (core không cho tắt)
  r.post('/:id/deactivate', async (c) => {
    const id = c.req.param('id');
    if (CORE_IDS.includes(id)) throw Errors.validation('Module cốt lõi không thể tắt');
    const orgId = orgOf(c);
    await deps.db.update(orgModules).set({ status: 'inactive' })
      .where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, id)));
    await deps.audit?.(c, { action: 'module.deactivate', resource: 'module', resourceId: id });
    return c.json({ ok: true, module: id, active: false });
  });

  return r;
}
