import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { qldnSalesPlusSchema } from '../server/schema.js';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  console.log('✓', message);
}
async function rejects(sql: string, message: string) {
  try { await client.exec(sql); throw new Error(`expected rejection: ${message}`); }
  catch (error) { if (String(error).includes('expected rejection')) throw error; console.log('✓', message); }
}

const client = new PGlite();
const migration = readFileSync(new URL('../migrations/0001_qldn_sales_plus.sql', import.meta.url), 'utf8');
await client.exec(migration);
await client.exec(migration).catch(error => { throw new Error(`migration is not rerunnable: ${String(error)}`); });

const tables = await client.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema='public' and table_name like 'qsa_%' order by table_name`);
assert(tables.rows.length === 16, 'migration creates exactly 16 qsa_ tables');
assert(Object.keys(qldnSalesPlusSchema).length === 16, 'Drizzle exports exactly 16 tables');
for (const table of Object.values(qldnSalesPlusSchema)) {
  const config = getTableConfig(table);
  const dbColumns = await client.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name=$1 order by ordinal_position`, [config.name]);
  assert(dbColumns.rows.map(x => x.column_name).join(',') === config.columns.map(x => x.name).join(','), `${config.name} migration/schema columns match`);
  const org = await client.query<{ is_nullable: string }>(`select is_nullable from information_schema.columns where table_name=$1 and column_name='org_id'`, [config.name]);
  assert(org.rows[0]?.is_nullable === 'NO', `${config.name} has org_id NOT NULL`);
  const indexes = await client.query(`select 1 from pg_indexes where tablename=$1 and indexdef like '%(org_id%'`, [config.name]);
  assert(indexes.rows.length >= 1, `${config.name} has an org-leading index`);
}

const a = 'aaaaaaaa-0000-0000-0000-000000000001';
const b = 'bbbbbbbb-0000-0000-0000-000000000002';
await client.exec(`insert into qsa_promotions(org_id,promo_code,name,starts_at) values('${a}','P1','A',now()),('${b}','P1','B',now())`);
await rejects(`insert into qsa_promotions(org_id,promo_code,name,starts_at) values('${a}','P1','duplicate',now())`, 'business uniqueness is tenant-scoped');
const parent = await client.query<{ id: string }>(`insert into qsa_return_requests(org_id,return_no,reason) values($1,'R1','reason') returning id`, [a]);
await rejects(`insert into qsa_return_lines(org_id,return_request_id,qty) values('${b}','${parent.rows[0].id}',1)`, 'composite FK rejects cross-tenant child links');
await rejects(`insert into qsa_return_lines(org_id,return_request_id,qty) values('${a}','${parent.rows[0].id}',0)`, 'positive quantity constraint is enforced');
await rejects(`insert into qsa_fulfillment_states(org_id,sales_order_id,state,state_version) values('${a}','cccccccc-0000-0000-0000-000000000003','packed',0)`, 'state_version must be positive');
await rejects(`insert into qsa_shipment_lines(org_id,shipment_type,shipment_id,description,qty) values('${a}','other','cccccccc-0000-0000-0000-000000000003','x',1)`, 'polymorphic shipment discriminator is constrained');

await client.close();
