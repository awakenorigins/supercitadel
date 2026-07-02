import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
const db = new PGlite();
let ddl = readFileSync(join(__dirname,'..','migrations','0001_init.sql'),'utf8').replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i,'');
await db.exec(ddl);
const t = await db.query<{table_name:string}>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
const names = t.rows.map(r=>r.table_name);
for(const x of ['orgs','users','tokens','audit_logs']) assert(names.includes(x),`table ${x} exists`);
const o = await db.query<{id:string}>(`INSERT INTO orgs (name,slug) VALUES ('X','x') RETURNING id`);
assert(o.rows[0].id,'org insert works');
console.log('[db/schema] PASSED');
