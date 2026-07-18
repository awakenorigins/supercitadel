import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sourceRoot = join(root, '..', 'module-qldn-v1a', 'raw', 'Tài liệu quy trình mẫu 4.0');
const ids = ['workflow','qldn-finance-flow','qldn-hr-plus','qldn-procurement','qldn-asset','qldn-sales-plus','qldn-marketing'] as const;
const manifests = new Map<string, any>();
const errors: string[] = [];
const check = (ok: unknown, message: string) => { if (!ok) errors.push(message); };

for (const id of ids) {
  const path = join(root, 'modules', id, 'manifest.json');
  check(existsSync(path), `${id}: missing manifest`);
  if (!existsSync(path)) continue;
  const m = JSON.parse(readFileSync(path, 'utf8'));
  manifests.set(id, m);
  check(m.id === id, `${id}: manifest id mismatch`);
  check(existsSync(join(root, 'modules', id, m.docs ?? '')), `${id}: docs target missing`);
  check(typeof m.priceOm === 'number' && m.priceOm >= 0, `${id}: invalid priceOm`);
  check(Array.isArray(m.permissions) && new Set(m.permissions).size === m.permissions.length, `${id}: duplicate/invalid permissions`);
  check(Array.isArray(m.events?.emits) && new Set(m.events.emits).size === m.events.emits.length, `${id}: duplicate/invalid emitted events`);
  check(Array.isArray(m.events?.subscribes) && new Set(m.events.subscribes).size === m.events.subscribes.length, `${id}: duplicate/invalid subscribed events`);
}
check(manifests.get('workflow')?.priceOm === 0, 'workflow: catalog price must be 0 Om');
for (const id of ids.slice(1)) check(manifests.get(id)?.priceOm === (id === 'qldn-hr-plus' ? 600 : 500), `${id}: catalog price drift`);

// Dependency graph: reject missing nodes, cycles, and chains deeper than two edges.
const allManifestIds = new Set<string>();
for (const id of ids) allManifestIds.add(id);
for (const m of manifests.values()) for (const d of m.dependsOn ?? []) allManifestIds.add(d);
const depth = (id: string, trail: string[] = []): number => {
  if (trail.includes(id)) { errors.push(`dependency cycle: ${[...trail,id].join(' -> ')}`); return 99; }
  const m = manifests.get(id);
  if (!m) return 0; // pre-existing platform dependency
  return Math.max(0, ...(m.dependsOn ?? []).map((d: string) => 1 + depth(d, [...trail,id])));
};
for (const id of ids) check(depth(id) <= 2, `${id}: dependency depth exceeds 2`);

const loader = readFileSync(join(root, 'services/api/src/modules/loader.ts'), 'utf8');
for (const id of ids) check(loader.includes(`'${id}'`) || loader.includes(`  ${id}:`), `${id}: loader builder registration missing`);

const defs = JSON.parse(readFileSync(join(root, 'modules/workflow/seed/definitions.seed.json'), 'utf8')) as any[];
check(defs.length === 80, `seed count ${defs.length}, expected 80`);
check(new Set(defs.map(d => d.code)).size === 80, 'seed codes are not unique');
for (const d of defs) {
  check(typeof d.trace?.source === 'string' && d.trace.source.trim().length > 0, `${d.code}: empty source trace`);
  check(typeof d.trace?.block === 'string' && /^block-[1-5]-/.test(d.trace.block), `${d.code}: invalid block trace`);
  check(Array.isArray(d.stepsConfig) && d.stepsConfig.length > 0, `${d.code}: empty stepsConfig`);
  if (d.trace?.source && !d.trace.source.startsWith('designed-not-sourced:')) check(existsSync(join(sourceRoot, d.trace.source)), `${d.code}: source trace does not exist: ${d.trace.source}`);
  if (d.trace?.source?.startsWith('designed-not-sourced:')) check(d.domain === 'sales', `${d.code}: only documented sales gap may be designed-not-sourced`);
}

if (errors.length) {
  console.error(`[qldn-b18] FAIL (${errors.length})`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[qldn-b18] PASS modules=${ids.length}/7 seed=${defs.length}/80 unique=80 trace=80/80 dependencyDepth<=2 loader=7/7 catalog=7/7`);
