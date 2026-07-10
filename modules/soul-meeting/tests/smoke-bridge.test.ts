/**
 * SOUL-MEETING 1A — SMOKE BRIDGE (Beat 7)
 * Router shim end-to-end trên PGlite (parse Zod tại biên, SmError→422, Zod→400) ·
 * Contract Tiểu Tâm: read tools + write actions đúng shape host (normalizeParams
 * cần type object+properties), sensitive⇒level 2, permission ∈ manifest ·
 * execute TT parse Zod (params sai → message Việt, không nổ DB) · downloadUrl
 * Excel · intents trỏ tool có thật · nightly quét DISTINCT org.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup, check, eq as eqc, summary } from './harness.js';
import { createSoulMeetingRoutes } from '../src/routes.js';
import { smAllTools, smReadTools, smWriteActions } from '../src/tools/index.js';
import { smIntents } from '../src/intents.js';
import { soulMeetingTieuTamActions } from '../server/tieu-tam-actions.js';
import { soulMeetingTools, runSoulMeetingScheduledAll } from '../server/host-adapter.js';
import type { SmCtx } from '../src/types.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ORG = randomUUID();
const A = 'user-an';

// ── Fake MinimalRouter/Context ────────────────────────────────────────────────
type FakeRes = { status: number; body: any };
type Handler = (c: any) => Promise<FakeRes>;

class FakeRouter {
  routes: Array<{ method: string; parts: string[]; handler: Handler }> = [];
  post(path: string, h: Handler) { this.routes.push({ method: 'POST', parts: path.split('/').filter(Boolean), handler: h }); }
  get(path: string, h: Handler) { this.routes.push({ method: 'GET', parts: path.split('/').filter(Boolean), handler: h }); }
  async call(method: string, path: string, opts: { body?: unknown; query?: Record<string, string>; ctx: SmCtx }): Promise<FakeRes> {
    const parts = path.split('/').filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method || r.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length; i++) {
        const rp = r.parts[i]!;
        if (rp.startsWith(':')) params[rp.slice(1)] = parts[i]!;
        else if (rp !== parts[i]) { ok = false; break; }
      }
      if (!ok) continue;
      const c = {
        req: {
          json: async () => opts.body ?? {},
          query: (k: string) => opts.query?.[k],
          param: (k: string) => params[k]!,
        },
        get: (_k: string) => opts.ctx,
        json: (data: unknown, status = 200): FakeRes => ({ status, body: data }),
      };
      return r.handler(c as any);
    }
    throw new Error(`no route ${method} ${path}`);
  }
}

async function main() {
  console.log('— SOUL-MEETING SMOKE BRIDGE (Beat 7) —');
  const h = await setup();
  const r = new FakeRouter();
  createSoulMeetingRoutes(r as any);
  const call = (method: string, path: string, o?: { body?: unknown; query?: Record<string, string> }) =>
    h.as(ORG, A, (ctx) => r.call(method, path, { ...o, ctx }));

  // ── A. HTTP END-TO-END ─────────────────────────────────────────
  console.log('\n— A. HTTP END-TO-END —');
  eqc('A0. tổng số route đăng ký ≥ 60', r.routes.length >= 60 ? '≥60' : String(r.routes.length), '≥60');
  const seed = await call('POST', '/meeting/types/seed');
  check('A1. seed types qua HTTP → 6 loại', seed.status === 200 && seed.body.data.length === 6);
  const bad = await call('POST', '/meeting/meetings', { body: { title: 'thiếu giờ' } });
  check('A2. body sai → 400 INVALID_INPUT (Zod tại biên)', bad.status === 400 && bad.body.error.code === 'INVALID_INPUT');
  const mk = await call('POST', '/meeting/meetings', {
    body: { title: 'Họp qua HTTP', start_at: '2026-07-17T02:00:00Z', end_at: '2026-07-17T03:00:00Z', chair_user_id: A, apply_template: false, status: 'scheduled' },
  });
  check('A3. tạo họp 200 + id', mk.status === 200 && typeof mk.body.data.id === 'string');
  const mid = mk.body.data.id as string;
  const ls = await call('GET', '/meeting/meetings', { query: { q: 'HTTP', limit: '10' } });
  check('A4. list ?q=&limit= parse từ query', ls.status === 200 && ls.body.data.length === 1);
  await call('POST', '/meeting/agenda', { body: { meeting_id: mid, title: 'Nội dung chính', source: 'manual' } });
  const pub = await call('POST', `/meeting/meetings/${mid}/agenda/publish`);
  check('A5. publish agenda qua :id param', pub.status === 200 && pub.body.data.agendaPublished === true);
  const st = await call('POST', `/meeting/meetings/${mid}/start`);
  const st2 = await call('POST', `/meeting/meetings/${mid}/start`);
  check('A6. start OK rồi start lại → 422 SmError mapping', st.status === 200 && st2.status === 422 && st2.body.error.code === 'MEETING_STATUS_INVALID');
  const detail = await call('GET', `/meeting/meetings/${mid}`);
  check('A7. GET chi tiết trả composite (meeting+participants+agenda+documents+checklist)',
    detail.status === 200 && ['meeting', 'participants', 'agenda', 'documents', 'checklist'].every((k) => k in detail.body.data));
  await call('POST', '/meeting/actions', { body: { title: 'Việc qua HTTP', owner_user_id: A, priority: 'normal' } });
  const xl = await call('GET', '/meeting/actions/export-xlsx', { query: { limit: '50' } });
  check('A8. export xlsx (json base64) rows=1 + mime đúng',
    xl.status === 200 && xl.body.data.rows === 1 && xl.body.data.mime.includes('spreadsheetml') && Buffer.from(xl.body.data.content_base64, 'base64').length > 500);
  await call('POST', `/meeting/meetings/${mid}/finish`);
  const gen = await call('POST', '/meeting/minutes/generate', { body: { meeting_id: mid } });
  const pubm = await call('POST', '/meeting/minutes/publish', { body: { id: gen.body.data.id } });
  check('A9. biên bản generate→publish qua HTTP', pubm.status === 200 && pubm.body.data.status === 'published');
  const kpi = await call('GET', '/meeting/reports/kpi', { query: { from: '2026-07-01', to: '2026-07-31' } });
  check('A10. KPI qua HTTP có số liệu', kpi.status === 200 && kpi.body.data.meetings.completed === 1);

  // ── B. CONTRACT TIỂU TÂM ───────────────────────────────────────
  console.log('\n— B. CONTRACT TIỂU TÂM —');
  const names = smAllTools.map((t) => t.name);
  check('B1. tên tool/action unique + đúng prefix sm.', new Set(names).size === names.length && names.every((n) => n.startsWith('sm.')));
  eqc('B2. 10 read tools + 22 write actions', `${smReadTools.length}+${smWriteActions.length}`, '10+22');
  check('B3. mọi action sensitive ⇒ securityLevel 2', smAllTools.every((t) => !t.sensitive || t.securityLevel === 2));
  const manifest = JSON.parse(await readFile(join(__dir, '..', 'manifest.json'), 'utf8')) as { permissions: string[] };
  const permSet = new Set(manifest.permissions);
  const missing = smAllTools.filter((t) => !permSet.has(t.permission)).map((t) => `${t.name}:${t.permission}`);
  check('B4. mọi permission ∈ manifest.permissions', missing.length === 0, missing.join(' '));
  const ttDefs = soulMeetingTieuTamActions();
  check('B5. TT defs đủ 22 + requiredModule + execute', ttDefs.length === 22 && ttDefs.every((d) => d.requiredModule === 'soul-meeting' && typeof d.execute === 'function'));
  check('B6. parameters chuẩn normalizeParams (type object + properties)',
    ttDefs.every((d) => d.parameters?.type === 'object' && typeof d.parameters.properties === 'object'));
  check('B7. intents trỏ tool có thật', smIntents.every((i) => names.includes(i.tool)), smIntents.filter((i) => !names.includes(i.tool)).map((i) => i.id).join(' '));

  // ── C. TT EXECUTE RUNTIME ──────────────────────────────────────
  console.log('\n— C. TT EXECUTE —');
  const auditLog: string[] = [];
  const hostCtx = { db: h.db, orgId: ORG, userId: A, audit: async (e: { action: string }) => { auditLog.push(e.action); } };
  const act = (n: string) => ttDefs.find((d) => d.name === n)!;
  const bad2 = await act('sm.create_action').execute(hostCtx, { owner_user_id: A });
  check('C1. params thiếu title → ok:false + message Việt (không nổ DB)', bad2.ok === false && String(bad2.message).includes('Thiếu/sai tham số'));
  const good = await act('sm.create_action').execute(hostCtx, { title: 'Việc từ Tiểu Tâm', priority: 'high' });
  check('C2. execute thật: ok + message sẵn + audit hook gọi', good.ok === true && String(good.message).includes('Việc từ Tiểu Tâm') && auditLog.includes('sm.create_action'));
  const ex = await act('sm.export_actions_excel').execute(hostCtx, { limit: 50 });
  check('C3. export → downloadUrl + filename cho Shell', ex.ok === true && String(ex.downloadUrl).startsWith('/api/v1/soul-meeting/actions/export.xlsx') && String(ex.filename).endsWith('.xlsx'));

  // ── D. READ TOOLS REGISTRY + NIGHTLY ───────────────────────────
  console.log('\n— D. REGISTRY + NIGHTLY —');
  const reg = soulMeetingTools(h.db);
  check('D1. registry 10 tools, module soul-meeting, có description + permission',
    reg.length === 10 && reg.every((t) => t.module === 'soul-meeting' && t.description.length > 0 && !!t.requiresPermission));
  const dg = await reg.find((t) => t.name === 'sm.digest')!.handler({}, { orgId: ORG, userId: A });
  check('D2. gọi sm.digest qua registry → message', typeof (dg as { message: string }).message === 'string');
  const nightly = await runSoulMeetingScheduledAll(h.db);
  check('D3. nightly quét DISTINCT org → org test ok:true', nightly.some((x) => x.org_id === ORG && x.ok === true), JSON.stringify(nightly));

  summary('SMOKE BRIDGE');
}
main().catch((e) => { console.error(e); process.exit(1); });
