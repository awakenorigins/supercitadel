// Module registry routes — list catalog với trạng thái org, bật/tắt, mua bằng Om (trừ tiền thật).
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { eq, and } from 'drizzle-orm';
import { AppError, Errors, type JwtPayload } from '@citadel/core';
import { orgModules } from '@citadel/db';
import { MODULE_CATALOG, CORE_IDS } from './catalog.js';
import { spend } from '@citadel/module-om/server/service.js';

declare module 'hono' { interface ContextVariableMap { auth: JwtPayload; } }
const orgOf = (c: any) => (c.get('auth') as JwtPayload).orgId;

async function orgState(db: any, orgId: string) {
  const rows = await db.select().from(orgModules).where(eq(orgModules.orgId, orgId));
  const map = new Map(rows.map((r: any) => [r.moduleId, r]));
  return MODULE_CATALOG.map((m) => {
    const r: any = map.get(m.id);
    const isCore = m.tier === 'core';
    return {
      ...m,
      active: isCore ? true : (r?.status === 'active'),
      purchased: isCore || m.tier === 'free' ? true : (r?.purchased ?? false),
    };
  });
}

/** Một module dùng được khi: core, hoặc đã active trong org_modules. */
export async function isModuleActive(db: any, orgId: string, moduleId: string): Promise<boolean> {
  if (CORE_IDS.includes(moduleId)) return true;
  const [r] = await db.select().from(orgModules)
    .where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, moduleId)));
  return r?.status === 'active';
}

/** Middleware gate: chặn API module chưa bật (403 MODULE_INACTIVE). */
export function requireModule(db: any, moduleId: string): MiddlewareHandler {
  return async (c, next) => {
    const ok = await isModuleActive(db, orgOf(c), moduleId);
    if (!ok) throw new AppError('MODULE_INACTIVE' as any, `Module "${moduleId}" chưa kích hoạt — vào Cửa hàng Module để bật`, 403);
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

  // POST /:id/activate — bật (free: luôn được; paid: phải purchased)
  r.post('/:id/activate', async (c) => {
    const id = c.req.param('id');
    const def = MODULE_CATALOG.find((m) => m.id === id);
    if (!def) throw Errors.notFound('Module không tồn tại');
    if (def.status !== 'ready') throw Errors.validation('Module sắp ra mắt');
    if (def.tier === 'core') return c.json({ ok: true, module: id, note: 'Module cốt lõi luôn bật' });
    const orgId = orgOf(c);
    const [existing] = await deps.db.select().from(orgModules).where(and(eq(orgModules.orgId, orgId), eq(orgModules.moduleId, id)));
    if (def.tier === 'paid' && !existing?.purchased) throw Errors.validation('Cần mua module trước khi bật', 'purchase');
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
