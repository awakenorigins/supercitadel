import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateManifest } from '../packages/core/src/manifest.js';
let root = process.cwd();
while (!existsSync(join(root, 'modules')) && root !== dirname(root)) root = dirname(root);
const dirs = readdirSync(join(root, 'modules'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
let fail = 0;
for (const id of dirs) {
  const file = join(root, 'modules', id, 'manifest.json');
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const r = validateManifest(raw);
    if (!r.ok) { fail++; console.error(`[manifest] FAIL ${id}: ${r.errors.join(' · ')}`); }
    else console.log(`[manifest] OK ${id} v${r.manifest.version}${r.warnings.length ? ' WARN '+r.warnings.join(' · ') : ''}`);
  } catch (e:any) { fail++; console.error(`[manifest] FAIL ${id}: ${e.message}`); }
}
if (fail) process.exit(1);
console.log(`[manifest] PASSED ${dirs.length}/${dirs.length}`);
