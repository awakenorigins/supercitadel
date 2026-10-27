import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModuleManifests, getLoaderState, buildCatalogFromManifests } from './modules/loader.js';

const state = loadModuleManifests(join(process.cwd(), '..', '..', 'modules'));
assert.equal(state.loaded.length, 15); // includes workflow, qldn-finance-flow, qldn-hr-plus and qldn-procurement built-in modules
// Pre-existing ngoài scope: 1ms-print manifest id sai format.
assert.equal(state.rejected.filter(r=>!['1ms-print'].includes(r.id)).length, 0);
assert.equal(state.loaded.find(m=>m.id==='soul-manager')?.routes, '/api/v1/soul-manager');
assert.equal(state.loaded.find(m=>m.id==='soul-inventory')?.routes, '/api/v1/soul-inventory');
assert.equal(state.loaded.find(m=>m.id==='qldn')?.routes, '/api/v1/qldn');
assert.equal(state.loaded.find(m=>m.id==='qldn')?.manifest.dependsOn?.[0], 'ke-toan-10a');
const cat = buildCatalogFromManifests();
assert.equal(cat.find(m=>m.id==='accounting')?.priceOm, 500);
assert.equal(cat.find(m=>m.id==='chat')?.tier, 'core');
assert.equal(cat.find(m=>m.id==='accounting')?.group, 'Tài chính');
assert.equal(cat.find(m=>m.id==='crm')?.group, 'Kinh doanh');
assert.equal(cat.find(m=>m.id==='inventory')?.group, 'Vận hành');
assert.equal(cat.find(m=>m.id==='hr')?.group, 'Nhân sự');
assert.equal(cat.find(m=>m.id==='chat')?.group, 'Cốt lõi');
const root = join(tmpdir(), `sc-v9-${Date.now()}`); mkdirSync(join(root,'good'),{recursive:true}); mkdirSync(join(root,'bad'),{recursive:true}); mkdirSync(join(root,'child'),{recursive:true});
const good = { id:'chat', name:'Chat', version:'1.0.0', tier:'core', priceOm:0, icon:'i', description:'d', permissions:['chat.message.read'], routes:'/api/v1/chat', docs:'docs/GUIDE.md' };
writeFileSync(join(root,'good','manifest.json'), JSON.stringify(good));
writeFileSync(join(root,'bad','manifest.json'), JSON.stringify({ ...good, id:'Bad' }));
writeFileSync(join(root,'child','manifest.json'), JSON.stringify({ ...good, id:'crm', permissions:['crm.contact.read'], routes:'/api/v1/crm', dependsOn:['missing'] }));
const s2 = loadModuleManifests(root);
assert.equal(s2.loaded.length, 1);
assert.ok(s2.rejected.find(r=>r.id==='Bad')?.errors.join(' ').includes('id'));
assert.ok(s2.rejected.find(r=>r.id==='crm')?.errors.join(' ').includes('dependsOn'));
assert.deepEqual(getLoaderState().loaded.map(x=>x.id), ['chat']);
console.log('[api/v9] PASSED');
