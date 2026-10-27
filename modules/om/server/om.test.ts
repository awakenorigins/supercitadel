import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import * as om from './schema.js';
import { getBalance, topup, spend } from './service.js';
import { AppError } from '@citadel/core';
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
const ORG='aaaaaaaa-0000-0000-0000-000000000001';
const client=new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_om.sql',import.meta.url),'utf8'));
const db=drizzle(client,{schema:om}) as any;
assert(await getBalance(db,ORG)===0,'balance 0');
assert((await topup(db,ORG,1000)).balance===1000,'topup → 1000');
assert((await spend(db,ORG,2,'AI','tieu-tam')).balance===998,'spend → 998');
let insf=false; try{await spend(db,ORG,99999,'x');}catch(e){insf=e instanceof AppError;} assert(insf,'insufficient guard');
console.log('[om] PASSED');
