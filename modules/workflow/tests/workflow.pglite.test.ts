import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { and, asc, eq } from 'drizzle-orm';
import * as schema from '../server/schema.js';
import { approve, createDefinition, delegate, getInstance, reject, returnStep, start } from '../server/service.js';

function assert(c: unknown, m: string) { if (!c) { console.error('✗', m); process.exitCode = 1; throw new Error(m); } console.log('✓', m); }
async function expectErr(fn: () => Promise<unknown>, m: string) { try { await fn(); assert(false, m + ' (không throw)'); } catch { console.log('✓', m); } }
const ORG='aaaaaaaa-0000-0000-0000-000000000001', ORG_B='bbbbbbbb-0000-0000-0000-000000000002';
const U1='11111111-1111-1111-1111-111111111111', U2='22222222-2222-2222-2222-222222222222', U3='33333333-3333-3333-3333-333333333333', U4='44444444-4444-4444-4444-444444444444';
const E1='eeeeeeee-0000-0000-0000-000000000001', E2='eeeeeeee-0000-0000-0000-000000000002';
const steps=[{order:1,name:'KTT',approverRole:'accountant',slaHours:4},{order:2,name:'GĐ',approverRole:'director'}];
const rules=[{minAmount:10000000,addSteps:[{order:99,name:'GĐTC',approverRole:'finance_director'}]},{minAmount:25000000,addSteps:[{order:100,name:'TGĐ',approverRole:'ceo'}]}];
async function makeDb(){ const client=new PGlite(); await client.exec(readFileSync(new URL('../migrations/0001_workflow.sql', import.meta.url),'utf8')); return drizzle(client,{schema}) as any; }
async function seedDef(db:any, orgId=ORG){ return createDefinition(db,orgId,{code:'PAY',name:'Duyệt chi',domain:'finance',entityType:'payment_request',stepsConfig:steps,thresholdRules:rules}); }
async function txStart(db:any, amount=1000000, orgId=ORG, entityId=E1){ return db.transaction((tx:any)=>start(tx,{orgId,definitionCode:'PAY',entityType:'payment_request',entityId,requestedBy:U1,amount})); }
async function active(db:any, orgId=ORG){ const [s]=await db.select().from(schema.wfSteps).where(and(eq(schema.wfSteps.orgId,orgId),eq(schema.wfSteps.status,'active'))).orderBy(asc(schema.wfSteps.stepOrder)).limit(1); return s; }

// happy path
{ const db=await makeDb(); await seedDef(db); const inst=await txStart(db); await approve(db,ORG,{stepId:(await active(db)).id,actorUserId:U2,comment:'ok'}); await approve(db,ORG,{stepId:(await active(db)).id,actorUserId:U3,comment:'ok'}); assert((await getInstance(db,ORG,inst.id)).status==='approved','happy path approved'); }
// reject
{ const db=await makeDb(); await seedDef(db); const inst=await txStart(db); await reject(db,ORG,{stepId:(await active(db)).id,actorUserId:U2,comment:'no'}); assert((await getInstance(db,ORG,inst.id)).status==='rejected','reject đóng instance'); }
// return loop
{ const db=await makeDb(); await seedDef(db); const inst=await txStart(db); const s=await active(db); await returnStep(db,ORG,{stepId:s.id,actorUserId:U2,comment:'sửa'}); let same=await active(db); assert(!same,'return làm bước về waiting để domain sửa'); await db.update(schema.wfSteps).set({status:'active'}).where(eq(schema.wfSteps.id,s.id)); await approve(db,ORG,{stepId:s.id,actorUserId:U2}); await approve(db,ORG,{stepId:(await active(db)).id,actorUserId:U3}); assert((await getInstance(db,ORG,inst.id)).status==='approved','return loop duyệt lại thành công'); }
// threshold escalation
{ const db=await makeDb(); await seedDef(db); await txStart(db,1000000,ORG,E1); assert((await db.select().from(schema.wfSteps)).length===2,'1tr → 2 cấp'); const db2=await makeDb(); await seedDef(db2); await txStart(db2,10000000,ORG,E1); assert((await db2.select().from(schema.wfSteps)).length===3,'10tr → 3 cấp'); const db3=await makeDb(); await seedDef(db3); await txStart(db3,25000000,ORG,E1); assert((await db3.select().from(schema.wfSteps)).length===4,'25tr → 4 cấp'); }
// org isolation
{ const db=await makeDb(); await seedDef(db); await seedDef(db,ORG_B); const inst=await txStart(db,1000000,ORG,E1); await expectErr(()=>getInstance(db,ORG_B,inst.id),'org B không đọc instance org A'); const orgAStep = await active(db,ORG); await expectErr(()=>approve(db,ORG_B,{stepId:orgAStep.id,actorUserId:U2}),'org B không duyệt step org A'); }
// delegate
{ const db=await makeDb(); await seedDef(db); await txStart(db,1000000,ORG,E2); const s=await active(db); await delegate(db,ORG,{stepId:s.id,actorUserId:U2,delegatedToUserId:U4,comment:'ủy quyền'}); const [row]=await db.select().from(schema.wfSteps).where(eq(schema.wfSteps.id,s.id)); assert(row.assigneeUserId===U4,'delegate gán assignee_user_id'); await expectErr(()=>approve(db,ORG,{stepId:s.id,actorUserId:U2}),'người cũ không duyệt sau delegate'); await approve(db,ORG,{stepId:s.id,actorUserId:U4}); assert((await active(db)).stepOrder===2,'người được delegate duyệt được'); }
console.log('[workflow] ALL PASSED');
