import assert from 'node:assert/strict';
import { validateManifest } from './manifest.js';
const valid = { id:'demo', name:'Demo', version:'1.0.0', tier:'paid', priceOm:1, icon:'i', description:'d', permissions:['crm.contact.read'], routes:'/api/v1/demo', docs:'docs/GUIDE.md', events:{ emits:['demo.thing.created'], subscribes:['accounting.*'] } };
assert.equal(validateManifest(valid).ok, true);
for (const [field, value, msg] of [['id','Bad','id'],['version','x','version'],['tier','free','tier'],['priceOm',-1,'priceOm']] as const) {
  const r = validateManifest({ ...valid, [field]: value }); assert.equal(r.ok, false); assert.match((r as any).errors.join('\n'), new RegExp(msg));
}
assert.equal(validateManifest({ ...valid, permissions:['crm:read'] }).ok, false);
assert.equal(validateManifest({ ...valid, events:{ subscribes:['accounting.*'] } }).ok, true);
assert.equal(validateManifest({ ...valid, events:{ subscribes:['accounting.invoice.created'] } }).ok, true);
assert.equal(validateManifest({ ...valid, events:{ emits:['accounting.*'] } }).ok, false);
assert.equal(validateManifest({ ...valid, events:{ emits:['bad'] } }).ok, false);
const warn = validateManifest({ ...valid, extra: true }); assert.equal(warn.ok, true); assert.equal((warn as any).warnings.length, 1);
console.log('[core/manifest] PASSED');
