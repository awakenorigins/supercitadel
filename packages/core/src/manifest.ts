import { PERMISSION_REGISTRY } from './permissions.js';

export type ModuleTier = 'core' | 'paid' | 'demo' | 'custom';
export interface ModuleManifestEvents { emits?: string[]; subscribes?: string[] }
export interface ModuleManifest {
  id: string; name: string; version: string; tier: ModuleTier; priceOm: number; icon: string; description: string;
  permissions: string[]; routes: string; docs: string; group?: string; dependsOn?: string[]; engine?: string; events?: ModuleManifestEvents;
  rentPlans?: Record<string, number>;
}

export type ManifestValidation = { ok: true; manifest: ModuleManifest; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };
const allowed = new Set(['id','name','version','tier','priceOm','icon','description','permissions','routes','docs','group','dependsOn','engine','events','rentPlans']);
const tiers = new Set(['core','paid','demo','custom']);
export const TOPIC_RE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*$/;
export const TOPIC_SUBSCRIBE_RE = /^(?:[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*|[a-z][a-z0-9-]*\.\*)$/;
const permSet = new Set(PERMISSION_REGISTRY.map((p) => p.key));
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function str(o: Record<string, unknown>, k: string, errors: string[]) { if (typeof o[k] !== 'string' || !(o[k] as string).trim()) errors.push(`Trường ${k} bắt buộc là chuỗi không rỗng`); }
function arrStr(v: unknown, field: string, errors: string[]) { if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) errors.push(`Trường ${field} bắt buộc là mảng chuỗi không rỗng`); }
export function validateTopic(topic: string): boolean { return TOPIC_RE.test(topic); }
export function validateSubscribeTopic(topic: string): boolean { return TOPIC_SUBSCRIBE_RE.test(topic); }
export function validateManifest(raw: unknown): ManifestValidation {
  const errors: string[] = [], warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['Manifest phải là object JSON'], warnings };
  for (const k of Object.keys(raw)) if (!allowed.has(k)) warnings.push(`Trường lạ ${k} sẽ bị bỏ qua`);
  for (const k of ['id','name','version','tier','icon','description','routes','docs']) str(raw, k, errors);
  if (typeof raw.id === 'string' && !/^[a-z][a-z0-9-]*$/.test(raw.id)) errors.push('id phải khớp ^[a-z][a-z0-9-]*$');
  if (typeof raw.version === 'string' && !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(raw.version)) errors.push('version phải là semver, ví dụ 1.0.0');
  if (typeof raw.tier === 'string' && !tiers.has(raw.tier)) errors.push('tier chỉ được là core|paid|demo|custom');
  if (typeof raw.priceOm !== 'number' || raw.priceOm < 0) errors.push('priceOm bắt buộc là số >= 0');
  if (typeof raw.routes === 'string' && !/^\/api\/v1\/[a-z0-9-]+/.test(raw.routes)) errors.push('routes phải bắt đầu bằng /api/v1/');
  if (raw.group !== undefined && (typeof raw.group !== 'string' || !raw.group.trim() || raw.group.length > 40)) errors.push('group phải là chuỗi không rỗng, tối đa 40 ký tự');
  arrStr(raw.permissions, 'permissions', errors);
  if (Array.isArray(raw.permissions)) for (const p of raw.permissions) {
    if (typeof p !== 'string' || !/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(p)) errors.push(`permission ${String(p)} sai format module.resource.action`);
    else if (!permSet.has(p)) errors.push(`permission ${p} chưa có trong PERMISSION_REGISTRY`);
  }
  if (raw.dependsOn !== undefined) arrStr(raw.dependsOn, 'dependsOn', errors);
  if (raw.engine !== undefined && typeof raw.engine !== 'string') errors.push('engine phải là chuỗi semver range');

  if (raw.rentPlans !== undefined) {
    if (!isObj(raw.rentPlans)) errors.push('rentPlans phải là object { "7"|"30"|"90": số Om }');
    else {
      const allowedRentDays = new Set(['7','30','90']);
      for (const [k, v] of Object.entries(raw.rentPlans)) {
        if (!allowedRentDays.has(k)) errors.push(`rentPlans.${k} không hợp lệ — chỉ hỗ trợ 7, 30, 90 ngày`);
        if (!Number.isInteger(v) || (v as number) <= 0) errors.push(`rentPlans.${k} phải là số nguyên Om > 0`);
      }
    }
  }
  if (raw.events !== undefined) {
    if (!isObj(raw.events)) errors.push('events phải là object { emits, subscribes }');
    else {
      if (raw.events.emits !== undefined) {
        arrStr(raw.events.emits, 'events.emits', errors);
        if (Array.isArray(raw.events.emits)) for (const t of raw.events.emits as unknown[]) if (typeof t === 'string' && !validateTopic(t)) errors.push(`event emit topic ${t} sai format module.entity.verb`);
      }
      if (raw.events.subscribes !== undefined) {
        arrStr(raw.events.subscribes, 'events.subscribes', errors);
        if (Array.isArray(raw.events.subscribes)) for (const t of raw.events.subscribes as unknown[]) if (typeof t === 'string' && !validateSubscribeTopic(t)) errors.push(`event subscribe topic ${t} sai format module.entity.verb hoặc module.*`);
      }
    }
  }
  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, manifest: raw as unknown as ModuleManifest, warnings };
}
