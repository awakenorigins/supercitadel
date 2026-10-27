import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import * as crm from './schema.js';
import { createContact, createDeal, moveDealStage, crmStats, listDeals } from './service.js';
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
const ORG='aaaaaaaa-0000-0000-0000-000000000001';
const client=new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_crm.sql',import.meta.url),'utf8'));
const db=drizzle(client,{schema:crm}) as any;
const hoa=await createContact(db,ORG,{name:'Cô Hoa',tag:'vip'});
const d=await createDeal(db,ORG,{title:'HĐ Hoa',valueVnd:22000000,contactId:hoa.id,stage:'negotiation'});
await createDeal(db,ORG,{title:'Tú',valueVnd:15200000,stage:'quote'});
const s=await crmStats(db,ORG); assert(s.openDeals===2,'2 open deals'); assert(s.totalValueVnd===37200000,'total 37.2tr');
await moveDealStage(db,ORG,d.id,'won'); assert((await crmStats(db,ORG)).openDeals===1,'after won 1 open');
assert((await listDeals(db,'bbbbbbbb-0000-0000-0000-000000000002')).length===0,'tenant isolation');
console.log('[crm] PASSED');
