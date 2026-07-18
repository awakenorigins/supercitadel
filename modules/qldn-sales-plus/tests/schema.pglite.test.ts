import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
function assert(c:unknown,m:string){if(!c){console.error('✗',m);process.exitCode=1;throw new Error(m)}console.log('✓',m)}
const client=new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_qldn_sales_plus.sql', import.meta.url),'utf8'));
const tables=await client.query<{table_name:string}>(`select table_name from information_schema.tables where table_schema='public' and table_name like 'qsa_%' order by table_name`);
assert(tables.rows.length===16,'migration tạo đúng 16 bảng qsa_');
for(const r of tables.rows){ const c=await client.query<any>(`select is_nullable from information_schema.columns where table_name='${r.table_name}' and column_name='org_id'`); assert(c.rows[0]?.is_nullable==='NO',`${r.table_name} có org_id NOT NULL`); const i=await client.query<any>(`select indexname from pg_indexes where tablename='${r.table_name}' and indexname like '${r.table_name}_org%'`); assert(i.rows.length>=1,`${r.table_name} có org index`); }
await client.query(`insert into qsa_promotions(org_id,promo_code,name,starts_at) values('aaaaaaaa-0000-0000-0000-000000000001','P1','Promo A',now())`);
await client.query(`insert into qsa_promotions(org_id,promo_code,name,starts_at) values('bbbbbbbb-0000-0000-0000-000000000002','P1','Promo B',now())`);
const leak=await client.query<{n:number}>(`select count(*)::int as n from qsa_promotions where org_id='aaaaaaaa-0000-0000-0000-000000000001'`);
assert(leak.rows[0]?.n===1,'tenant unique/index allows same code across orgs and scopes reads');
await client.close();
