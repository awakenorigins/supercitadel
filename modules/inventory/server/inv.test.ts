import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import * as inv from './schema.js';
import { createItem, adjustQty, lowStock, listItems, updateItem } from './service.js';
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
const ORG='aaaaaaaa-0000-0000-0000-000000000001';
const client=new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_inventory.sql',import.meta.url),'utf8'));
const db=drizzle(client,{schema:inv}) as any;
const milk=await createItem(db,ORG,{name:'Sữa tươi',unit:'hộp',qty:10,lowThreshold:12});
await createItem(db,ORG,{name:'Cà phê hạt',unit:'kg',qty:30,lowThreshold:5});
assert((await listItems(db,ORG)).length===2,'2 items');
const low=await lowStock(db,ORG);
assert(low.length===1&&low[0].name==='Sữa tươi','sữa (10<=12) là low-stock');
const after=await adjustQty(db,ORG,milk.id,20);
assert(after.qty===30,'nhập +20 → 30');
assert((await lowStock(db,ORG)).length===0,'sau nhập: hết cảnh báo');
const floor=await adjustQty(db,ORG,milk.id,-999);
assert(floor.qty===0,'trừ quá → floor 0 (không âm)');
assert((await listItems(db,'bbbbbbbb-0000-0000-0000-000000000002')).length===0,'tenant isolation');
const ren=await updateItem(db,ORG,milk.id,{name:'Sữa tươi Vinamilk',lowThreshold:3});
assert(ren.name==='Sữa tươi Vinamilk'&&ren.lowThreshold===3,'sửa tên + ngưỡng');
// chứng minh KHÔNG có giới hạn 5: đẩy lên 999
let big=milk; for(let i=0;i<5;i++) big=await adjustQty(db,ORG,milk.id,200);
assert(big.qty===1000,'qty lên 1000 — không có giới hạn nào');
console.log('[inventory] PASSED');
