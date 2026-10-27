import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { AppError } from '@citadel/core';
import { auditLogs, orgs, schema, tokens, users } from '@citadel/db';
import { generateToken, hashToken, tokenPrefix } from './auth/token.js';
import { login } from './auth/service.js';
import { requireAuth } from './auth/middleware.js';
import { makeAudit, logAudit } from './audit/service.js';
import { buildTieuTamRoutes } from './tieu-tam/routes.js';
import { buildKeToan10aRoutes } from '@citadel/module-ke-toan-10a/server/routes.js';
import { buildInventoryRoutes } from '@citadel/module-inventory/server/routes.js';
import { seedChartOfAccounts } from '@citadel/module-ke-toan-10a/server/seed.js';
import { accounts } from '@citadel/module-ke-toan-10a/server/schema.js';
import { eq, and } from 'drizzle-orm';
import * as XLSX from 'xlsx';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }
process.env.JWT_SECRET = 'r111_secret_long_enough_hs256_xxx';

const client = new PGlite();
const mig = (f: string) => readFileSync(new URL(`../../../packages/db/migrations/${f}`, import.meta.url), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, '');
for (const f of ['0001_init.sql', '0002_org_modules.sql', '0003_super_admin.sql', '0004_v7a_p1.sql', '0005_v7a_p2.sql', '0006_v7a_p3.sql', '0007_module_rental.sql', '0010_tt_chat_history.sql', '0012_tt_files.sql', '0013_r112_settings_org.sql']) await client.exec(mig(f));
await client.exec(readFileSync(new URL('../../../modules/inventory/migrations/0001_inventory.sql', import.meta.url), 'utf8'));
await client.exec(readFileSync(new URL('../../../modules/hr/migrations/0001_hr.sql', import.meta.url), 'utf8'));
await client.exec(readFileSync(new URL('../../../modules/hr/migrations/0002_hr_v2.sql', import.meta.url), 'utf8'));
await client.exec(readFileSync(new URL('../../../modules/ke-toan-10a/migrations/0000_init.sql', import.meta.url), 'utf8'));
const db = drizzle(client, { schema }) as any;
const audit = makeAudit(db);
const app = new Hono();
app.onError((e, c) => e instanceof AppError ? c.json(e.toJSON(), e.status as 400) : (console.error(e), c.json({ error: { code: 'INTERNAL', message: String((e as any)?.message ?? e) } }, 500)));
app.post('/api/v1/auth/login', async (c) => { const b = await c.req.json().catch(() => ({})); const res = await login(db, String(b.token ?? '')); await logAudit(db, { orgId: res.user.orgId, userId: res.user.id, action: 'auth.login', resource: 'auth' }); return c.json(res); });
app.route('/api/v1/tieu-tam', buildTieuTamRoutes({ db, requireAuth, audit }));
app.route('/api/v1/ke-toan-10a', buildKeToan10aRoutes({ db, requireAuth, audit }));
app.route('/api/v1/inventory', buildInventoryRoutes({ db, requireAuth, audit }));
const H = { 'Content-Type': 'application/json' };
const auth = (jwt: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${jwt}`, ...extra });
async function mk(slug:string) { const [org]=await db.insert(orgs).values({name:slug,slug}).returning(); const [user]=await db.insert(users).values({orgId:org.id,displayName:slug,role:'owner'}).returning(); const raw=generateToken(); await db.insert(tokens).values({orgId:org.id,userId:user.id,tokenPrefix:tokenPrefix(raw),tokenHash:await hashToken(raw),role:'owner'}); await seedChartOfAccounts(org.id, db); const r=await app.request('/api/v1/auth/login',{method:'POST',headers:H,body:JSON.stringify({token:raw})}); return {org,user,jwt:(await r.json() as any).jwt}; }
const A = await mk('r111a'); const B = await mk('r111b');
async function post(path:string,jwt:string,body:any){ return app.request(path,{method:'POST',headers:auth(jwt,H),body:JSON.stringify(body)}); }
for (const [path, good] of [
  ['/api/v1/ke-toan-10a/budgets',{year:2026,accountCode:'642',amount:'1000'}],
  ['/api/v1/ke-toan-10a/recurring',{name:'Thuê VP',kind:'PAYMENT',frequency:'MONTHLY',payload:{counterAccountCode:'642',amount:'1000'},startDate:'2026-01-01'}],
  ['/api/v1/ke-toan-10a/receipts',{counterAccountCode:'411',amount:'1000'}],
  ['/api/v1/ke-toan-10a/payments',{counterAccountCode:'642',amount:'100'}],
  ['/api/v1/ke-toan-10a/contacts',{name:'Khách R111',type:'CUSTOMER'}],
] as const) {
  let r=await post(path,A.jwt,{}); assert(r.status===400, `${path} thiếu field → 400`);
  r=await post(path,A.jwt,good); assert([200,201].includes(r.status), `${path} payload đúng → ${r.status}`);
}
let r=await post('/api/v1/ke-toan-10a/advances',A.jwt,{type:'EMPLOYEE_ADVANCE',contactName:'Anh Tạm Ứng',amount:'500',reason:'Công tác'}); assert(r.status===201, '/advances contactName payload đúng → 201');
r=await post('/api/v1/ke-toan-10a/fx/revalue',A.jwt,{accountCode:'111',foreignAmount:'1',newRate:'24000'}); assert([200,201].includes(r.status), '/fx/revalue payload đúng không 500');

const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Tên hàng':'Bút R111','SL':7,'ĐVT':'cái' }]), 'Sheet1');
const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' }) as Buffer;
r=await app.request('/api/v1/tieu-tam/files',{method:'POST',headers:auth(A.jwt,H),body:JSON.stringify({filename:'kho.xlsx',fileBase64:buf.toString('base64')})}); assert(r.status===201,'upload xlsx → 201'); const file=(await r.json() as any).file; assert(file.summary.includes('1 dòng'),'xlsx parse đúng rows');
r=await app.request('/api/v1/tieu-tam/files',{method:'POST',headers:auth(A.jwt,H),body:JSON.stringify({filename:'bad.exe',fileBase64:Buffer.from('MZ').toString('base64')})}); assert(r.status===400,'.exe bị từ chối');
r=await app.request('/api/v1/tieu-tam/files',{method:'POST',headers:auth(A.jwt,H),body:JSON.stringify({filename:'big.txt',fileBase64:Buffer.alloc(5*1024*1024+1).toString('base64')})}); assert(r.status===400,'>5MB bị từ chối');
r=await app.request(`/api/v1/tieu-tam/files/${file.id}`,{headers:auth(B.jwt)}); assert(r.status===404,'org/user isolation file');
r=await post(`/api/v1/tieu-tam/files/${file.id}/import`,A.jwt,{target:'inventory'}); const dry=await r.json() as any; assert(dry.dryRun===true && dry.preview.length===1,'import dry-run preview');
r=await post(`/api/v1/tieu-tam/files/${file.id}/import`,A.jwt,{target:'inventory',confirm:true}); const imp=await r.json() as any; assert(imp.created===1,'confirm import tạo item thật');
r=await app.request('/api/v1/inventory/items',{headers:auth(A.jwt)}); const items=(await r.json() as any).items; assert(items.some((x:any)=>x.name==='Bút R111' && x.qty===7),'item xuất hiện trong kho');
const logs=await db.select().from(auditLogs).where(and(eq(auditLogs.orgId,A.org.id),eq(auditLogs.action,'tieu_tam.file_import'))); assert(logs.length>=1,'audit log import');
await client.close(); console.log('[api/r111] PASSED');
