import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import * as hr from './schema.js';
import { createShift, listShifts, assignStaff } from './service.js';
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
const ORG='aaaaaaaa-0000-0000-0000-000000000001';
const client=new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_hr.sql',import.meta.url),'utf8'));
const db=drizzle(client,{schema:hr}) as any;
const ca=await createShift(db,ORG,{name:'Ca Tối',shiftDate:'2026-06-10',startTime:'17:00',endTime:'22:00',staff:['Lan','Hùng']});
assert(ca.staff==='Lan, Hùng','tạo ca + staff');
await createShift(db,ORG,{name:'Ca Sáng',shiftDate:'2026-06-10',startTime:'07:00',endTime:'12:00'});
assert((await listShifts(db,ORG,'2026-06-10')).length===2,'2 ca ngày 10/6');
assert((await listShifts(db,ORG))[0].name==='Ca Sáng','sort theo giờ');
const up=await assignStaff(db,ORG,ca.id,['Lan','Hùng','Tú']);
assert(up.staff==='Lan, Hùng, Tú','xếp thêm Tú');
assert((await listShifts(db,'bbbbbbbb-0000-0000-0000-000000000002')).length===0,'tenant isolation');
console.log('[hr] PASSED');
