import { Hono, type MiddlewareHandler } from 'hono';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateManifest, type ModuleManifest, type JwtPayload, AppError } from '@citadel/core';
import { buildChatRoutes } from '@citadel/module-chat/server/routes.js';
import { publishEvent } from '@citadel/module-chat/server/emit.js';
import { buildNotificationRoutes } from '@citadel/module-notification/server/routes.js';
import { buildCrmRoutes } from '@citadel/module-crm/server/routes.js';
import { buildOmRoutes } from '@citadel/module-om/server/routes.js';
import { buildInventoryRoutes } from '@citadel/module-inventory/server/routes.js';
import { buildHrRoutes } from '@citadel/module-hr/server/routes.js';
import { buildAccountingRoutes } from '@citadel/module-accounting/server/routes.js';
import { eventHandlers as notificationEventHandlers } from '@citadel/module-notification/server/events.js';
import { subscribeOutbox, type OutboxHandler } from '../outbox.js';

type Deps = { db:any; requireAuth:MiddlewareHandler; requireModule:(db:any,id:string)=>MiddlewareHandler; audit?:any; sensitiveGate?:any; cancelGate?:any };
type Builder = (deps: Deps) => Hono;
const builders: Record<string, Builder> = {
  chat: (d) => buildChatRoutes({ db:d.db, emit: publishEvent, requireAuth:d.requireAuth }),
  notification: (d) => buildNotificationRoutes({ db:d.db, requireAuth:d.requireAuth }),
  crm: (d) => buildCrmRoutes({ db:d.db, requireAuth:d.requireAuth, gate:d.requireModule(d.db,'crm') } as any),
  om: (d) => buildOmRoutes({ db:d.db, requireAuth:d.requireAuth, audit:d.audit, sensitiveGate:d.sensitiveGate }),
  inventory: (d) => buildInventoryRoutes({ db:d.db, requireAuth:d.requireAuth, gate:d.requireModule(d.db,'inventory') }),
  hr: (d) => buildHrRoutes({ db:d.db, requireAuth:d.requireAuth, gate:d.requireModule(d.db,'hr'), audit:d.audit }),
  accounting: (d) => buildAccountingRoutes({ db:d.db, requireAuth:d.requireAuth, gate:d.requireModule(d.db,'accounting'), audit:d.audit, cancelGate:d.cancelGate }),
};
const moduleEventHandlers: Record<string, Record<string, OutboxHandler>> = {
  notification: notificationEventHandlers as Record<string, OutboxHandler>,
};
export interface LoadedModule { id:string; version:string; routes:string; manifest:ModuleManifest }
export interface RejectedModule { id:string; errors:string[] }
let loaderState: { loaded:LoadedModule[]; rejected:RejectedModule[] } = { loaded:[], rejected:[] };
export function getLoaderState(){ return loaderState; }
function modulesRoot(){
  const candidates = [resolve(process.cwd(), 'modules'), resolve(process.cwd(), '..', '..', 'modules')];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}
export function loadModuleManifests(root = modulesRoot()) {
  const loaded: LoadedModule[] = [], rejected: RejectedModule[] = [];
  const candidates: { id:string; manifest:ModuleManifest }[] = [];
  for (const dir of readdirSync(root, { withFileTypes:true }).filter(d=>d.isDirectory()).map(d=>d.name).sort()) {
    try {
      const raw = JSON.parse(readFileSync(join(root, dir, 'manifest.json'), 'utf8'));
      const r = validateManifest(raw);
      if (!r.ok) { rejected.push({ id: raw?.id || dir, errors: r.errors }); continue; }
      if (!builders[r.manifest.id]) { rejected.push({ id:r.manifest.id, errors:['Chưa đăng ký route builder cho module'] }); continue; }
      candidates.push({ id:r.manifest.id, manifest:r.manifest });
    } catch (e:any) { rejected.push({ id:dir, errors:[`Không đọc được manifest: ${e.message}`] }); }
  }
  const ok = new Set(candidates.map(c=>c.id));
  for (const c of candidates) {
    const missing = (c.manifest.dependsOn ?? []).filter(d => !ok.has(d));
    if (missing.length) rejected.push({ id:c.id, errors:[`dependsOn không thỏa: ${missing.join(', ')}`] });
    else loaded.push({ id:c.id, version:c.manifest.version, routes:c.manifest.routes, manifest:c.manifest });
  }
  loaderState = { loaded, rejected };
  return loaderState;
}
export function buildCatalogFromManifests(){
  return loaderState.loaded.map(({manifest:m}) => ({ id:m.id, name:m.name, icon:m.icon, desc:m.description, tier:m.tier, priceOm:m.priceOm, group:m.tier==='core'?'Cốt lõi':'Module', route:m.routes.replace('/api/v1',''), status:'ready' as const, manifest:m }));
}
export function coreIds(){ return loaderState.loaded.filter(m=>m.manifest.tier==='core').map(m=>m.id); }
export function wireManifestEventSubscribers(state = loaderState) {
  for (const m of state.loaded) {
    const handlers = moduleEventHandlers[m.id];
    if (!handlers) continue;
    for (const topic of m.manifest.events?.subscribes ?? []) {
      const handler = handlers[topic];
      if (handler) subscribeOutbox(topic, handler);
      else console.error(`[module-loader] ❌ ${m.id} khai báo subscribe ${topic} nhưng thiếu eventHandlers[${topic}]`);
    }
  }
}
export function mountLoadedModules(app: Hono, deps: Deps) {
  const state = loadModuleManifests();
  for (const m of state.rejected) console.error(`[module-loader] ❌ Từ chối ${m.id}: ${m.errors.join(' · ')}`);
  for (const m of state.loaded) app.route(m.routes, builders[m.id](deps));
  wireManifestEventSubscribers(state);
  console.log(`[module-loader] ✅ Nạp ${state.loaded.length} module · ❌ Từ chối ${state.rejected.length}`);
  app.get('/api/v1/modules/loader-status', deps.requireAuth, async (c) => {
    const auth = c.get('auth') as JwtPayload;
    if (!['owner','super_admin'].includes(auth.role)) throw new AppError('FORBIDDEN' as any, 'Chỉ owner được xem trạng thái loader', 403);
    return c.json({ loaded: loaderState.loaded.map(({id,version,routes})=>({id,version,routes})), rejected: loaderState.rejected });
  });
}
