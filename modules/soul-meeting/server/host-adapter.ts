/**
 * SOUL-MEETING — Host adapter cho SuperCitadel (Hono + postgres-js/Drizzle).
 *
 * Module lõi framework-neutral (createSoulMeetingRoutes(router), ctx qua
 * c.get('smCtx')). File này BIND vào host:
 *  - buildSoulMeetingRoutes: Hono sub-app; middleware bọc mỗi request trong
 *    org-tx (SET LOCAL app.current_org_id — RLS defense-in-depth) + gắn smCtx
 *    (db=tx, orgId, userId=auth.sub, bus, caps asr/notify/contacts nếu host nối).
 *    Kèm 2 GET nhị phân ngoài shim json: /meetings/:id/ics và /actions/export.xlsx
 *    (downloadUrl của Tiểu Tâm trỏ vào đây → Shell render nút tải).
 *  - soulMeetingTools: read tools cho toolRegistry Tiểu Tâm.
 *  - runSoulMeetingScheduledAll + startSoulMeetingNightlyAutomation: việc đêm
 *    quét DISTINCT org_id từ smeet_settings ∪ smeet_meetings — non-fatal per org.
 */
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createSoulMeetingRoutes } from '../src/routes.js';
import { smReadTools } from '../src/tools/index.js';
import { runScheduledTasks } from '../src/services/scheduled.service.js';
import { getMeeting } from '../src/services/common.js';
import { buildMeetingIcs } from '../src/services/ics.service.js';
import { exportActionsXlsx } from '../src/services/report.service.js';
import { actionListSchema } from '../src/validation/schemas.js';
import type { SmCtx, SmCaps, EventBus } from '../src/types.js';
import { SmError } from '../src/types.js';

type AuthLike = { orgId: string; sub?: string; role?: string };
type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

function makeBus(emit?: (topic: string, payload: Record<string, unknown>) => unknown): EventBus {
  return { emit: async (name, payload) => { try { await emit?.(name, payload); } catch { /* non-fatal */ } } };
}

async function withOrgTx<T>(db: any, orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

export interface SoulMeetingDeps {
  db: any;
  requireAuth: MiddlewareHandler;
  gate?: MiddlewareHandler;
  audit?: AuditFn;
  emit?: (topic: string, payload: Record<string, unknown>) => unknown;
  /** Capability optional — thiếu cái nào module degrade cái đó (ASR_UNAVAILABLE / bỏ notify / suggest rỗng) */
  caps?: SmCaps;
}

const authOf = (c: any): AuthLike => c.get('auth') as AuthLike;

export function buildSoulMeetingRoutes(deps: SoulMeetingDeps): Hono {
  const app = new Hono();
  app.use('*', deps.requireAuth);
  if (deps.gate) app.use('*', deps.gate);
  const bus = makeBus(deps.emit);

  const makeCtx = (tx: any, auth: AuthLike): SmCtx =>
    ({ db: tx, orgId: auth.orgId, userId: auth.sub ?? '', bus, caps: deps.caps } as SmCtx);

  // Router shim: nhận path '/meeting/...' của module → strip prefix, bọc org-tx + smCtx
  const shim = {
    _register(method: 'get' | 'post', path: string, handler: (c: any) => Promise<Response>) {
      const p = path.replace(/^\/meeting/, '') || '/';
      (app as any)[method](p, async (c: any) => {
        const auth = authOf(c);
        if (!auth?.sub) {
          throw new Error('soul-meeting: missing user id (auth.sub) — refusing request (fail-closed)');
        }
        return withOrgTx(deps.db, auth.orgId, async (tx) => {
          c.set('smCtx', makeCtx(tx, auth));
          const res = await handler(c);
          if (deps.audit && method === 'post') await deps.audit(c, { action: 'soul-meeting.route', detail: { path } });
          return res;
        });
      });
    },
    post(path: string, handler: (c: any) => Promise<Response>) { this._register('post', path, handler); },
    get(path: string, handler: (c: any) => Promise<Response>) { this._register('get', path, handler); },
  };
  createSoulMeetingRoutes(shim as any);

  // ── GET nhị phân (ngoài shim json-only) ──────────────────────────────────
  app.get('/meetings/:id/ics', async (c) => {
    const auth = authOf(c);
    try {
      const ics = await withOrgTx(deps.db, auth.orgId, async (tx) => {
        const m = await getMeeting(makeCtx(tx, auth), c.req.param('id'));
        return buildMeetingIcs(m);
      });
      return new Response(ics, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="hop-${c.req.param('id')}.ics"`,
        },
      });
    } catch (e) {
      if (e instanceof SmError) return c.json({ error: { code: e.code, message: e.message } }, 422);
      throw e;
    }
  });

  app.get('/actions/export.xlsx', async (c) => {
    const auth = authOf(c);
    const raw: Record<string, string> = {};
    for (const k of ['status', 'owner_user_id', 'meeting_id', 'overdue_only', 'limit']) {
      const v = c.req.query(k);
      if (v !== undefined && v !== '') raw[k] = v;
    }
    try {
      const input = actionListSchema.parse(raw);
      const file = await withOrgTx(deps.db, auth.orgId, (tx) => exportActionsXlsx(makeCtx(tx, auth), input));
      const buf = Buffer.from(file.content_base64, 'base64');
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': file.mime,
          'Content-Disposition': `attachment; filename="${file.file_name}"`,
          'Content-Length': String(buf.length),
        },
      });
    } catch (e) {
      if (e instanceof z.ZodError) return c.json({ error: { code: 'INVALID_INPUT', issues: e.issues } }, 400);
      if (e instanceof SmError) return c.json({ error: { code: e.code, message: e.message } }, 422);
      throw e;
    }
  });

  return app;
}

/** Read tools cho toolRegistry Tiểu Tâm của host */
export function soulMeetingTools(db: any, opts?: { emit?: SoulMeetingDeps['emit']; caps?: SmCaps }) {
  const bus = makeBus(opts?.emit);
  return smReadTools.map((t) => ({
    name: t.name,
    module: 'soul-meeting',
    description: t.docs ?? t.name,
    requiresPermission: t.permission,
    async handler(input: any, ctx: { orgId: string; userId?: string }) {
      return withOrgTx(db, ctx.orgId, async (tx) => {
        const smCtx: SmCtx = { db: tx, orgId: ctx.orgId, userId: ctx.userId ?? '', bus, caps: opts?.caps } as SmCtx;
        return t.handler(smCtx, t.inputSchema.parse(input ?? {}));
      });
    },
  }));
}

/**
 * Việc đêm cho MỌI org đang dùng module: quét DISTINCT org_id từ
 * smeet_settings ∪ smeet_meetings (org nào từng đụng module là có mặt).
 * Non-fatal: lỗi 1 org không chặn org khác.
 */
export async function runSoulMeetingScheduledAll(db: any, opts?: { emit?: SoulMeetingDeps['emit']; caps?: SmCaps; horizonDays?: number }) {
  const bus = makeBus(opts?.emit);
  const res: any = await db.execute(sql`
    SELECT DISTINCT org_id FROM (
      SELECT org_id FROM smeet_settings
      UNION SELECT org_id FROM smeet_meetings
    ) t
  `);
  const orgs: Array<{ org_id: string }> = res?.rows ?? res ?? [];
  const results: Array<{ org_id: string; ok: boolean; error?: string }> = [];
  for (const o of orgs) {
    try {
      await withOrgTx(db, o.org_id, async (tx) => {
        const ctx: SmCtx = { db: tx, orgId: o.org_id, userId: 'system:nightly', bus, caps: opts?.caps } as SmCtx;
        await runScheduledTasks(ctx, opts?.horizonDays ?? 35);
      });
      results.push({ org_id: o.org_id, ok: true });
    } catch (e) {
      results.push({ org_id: o.org_id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

/** Cron 24h (kèm chạy ngay 1 lần sau 60s khởi động) — non-fatal */
export function startSoulMeetingNightlyAutomation(db: any, opts?: { emit?: SoulMeetingDeps['emit']; caps?: SmCaps }) {
  const run = async () => {
    try {
      const r = await runSoulMeetingScheduledAll(db, opts);
      const fail = r.filter((x) => !x.ok).length;
      console.log(`[soul-meeting] nightly: ${r.length} org, ${fail} lỗi`);
    } catch (e) {
      console.error('[soul-meeting] nightly fatal:', e);
    }
  };
  setTimeout(run, 60_000);
  const timer = setInterval(run, 24 * 3_600_000);
  (timer as any).unref?.();
  return timer;
}
