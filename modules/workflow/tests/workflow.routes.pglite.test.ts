import { Hono } from 'hono';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { and, asc, eq } from 'drizzle-orm';
import * as schema from '../server/schema.js';
import { buildWorkflowRoutes } from '../server/routes.js';
import { createDefinition } from '../server/service.js';
import type { JwtPayload } from '@citadel/core';

const ORG='aaaaaaaa-0000-0000-0000-000000000001', ORG_B='bbbbbbbb-0000-0000-0000-000000000002';
const U1='11111111-1111-1111-1111-111111111111', U2='22222222-2222-2222-2222-222222222222';
const E1='eeeeeeee-0000-0000-0000-000000000001';
const owner:JwtPayload={sub:U1,orgId:ORG,role:'owner'} as any;
const staff:JwtPayload={sub:U2,orgId:ORG,role:'staff'} as any;
const ownerB:JwtPayload={sub:U2,orgId:ORG_B,role:'owner'} as any;
function assert(c: unknown, m: string) { if (!c) throw new Error(m); console.log('✓', m); }
async function makeDb(){ const client=new PGlite(); await client.exec(readFileSync(new URL('../migrations/0001_workflow.sql', import.meta.url),'utf8')); return drizzle(client,{schema}) as any; }
const fakeAuth=(auth:JwtPayload)=>async(c:any,next:any)=>{ c.set('auth',auth); await next(); };
const denyGate=async(_c:any,_n:any)=>{ return new Response(JSON.stringify({error:{code:'FORBIDDEN'}}),{status:403,headers:{'content-type':'application/json'}}); };
function app(db:any, auth:JwtPayload, gate?:any){ const a=new Hono(); a.route('/api/v1/workflow', buildWorkflowRoutes({db,requireAuth:fakeAuth(auth) as any,gate,audit:async()=>{}})); return a; }
async function seed(db:any, orgId=ORG){ return createDefinition(db,orgId,{code:'PAY',name:'Duyệt chi',domain:'finance',entityType:'payment_request',stepsConfig:[{order:1,name:'KTT',approverRole:'accountant'},{order:2,name:'GĐ',approverRole:'director'}],thresholdRules:[]}); }
async function active(db:any, orgId=ORG){ const [s]=await db.select().from(schema.wfSteps).where(and(eq(schema.wfSteps.orgId,orgId),eq(schema.wfSteps.status,'active'))).orderBy(asc(schema.wfSteps.stepOrder)).limit(1); return s; }

// 403 khi module gate/permission thiếu
{ const db=await makeDb(); await seed(db); const res=await app(db,owner,denyGate).request('/api/v1/workflow/definitions'); assert(res.status===403,'gate thiếu quyền trả 403'); }

// staff bị chặn admin endpoint
{ const db=await makeDb(); const res=await app(db,staff).request('/api/v1/workflow/admin/rollouts'); assert(res.status===403,'staff bị chặn admin endpoint'); }

// duyệt full vòng qua API
{ const db=await makeDb(); await seed(db); const a=app(db,owner); let res=await a.request('/api/v1/workflow/instances/start',{method:'POST',body:JSON.stringify({definitionCode:'PAY',entityType:'payment_request',entityId:E1,amount:1000}),headers:{'content-type':'application/json'}}); assert(res.status===201,'API start instance'); const inst=(await res.json() as any).instance; res=await a.request(`/api/v1/workflow/steps/${(await active(db)).id}/approve`,{method:'POST',body:'{}',headers:{'content-type':'application/json'}}); assert(res.status===200,'API approve bước 1'); res=await a.request(`/api/v1/workflow/steps/${(await active(db)).id}/approve`,{method:'POST',body:'{}',headers:{'content-type':'application/json'}}); assert(res.status===200,'API approve bước 2'); res=await a.request(`/api/v1/workflow/instances/${inst.id}`); const body=await res.json() as any; assert(body.instance.status==='approved','API full vòng approved'); }

// org isolation qua API
{ const db=await makeDb(); await seed(db,ORG); await seed(db,ORG_B); const a=app(db,owner); const res=await a.request('/api/v1/workflow/instances/start',{method:'POST',body:JSON.stringify({definitionCode:'PAY',entityType:'payment_request',entityId:E1}),headers:{'content-type':'application/json'}}); const inst=(await res.json() as any).instance; const b=app(db,ownerB); const resB=await b.request(`/api/v1/workflow/instances/${inst.id}`); assert(resB.status===404,'org B không đọc instance org A qua API'); }
console.log('[workflow-routes] ALL PASSED');
