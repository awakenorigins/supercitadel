import { Hono } from 'hono';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { and, asc, eq } from 'drizzle-orm';
import type { JwtPayload } from '@citadel/core';
import * as qfi from '../server/schema.js';
import { buildQldnFinanceFlowRoutes } from '../server/routes.js';
import { eventHandlers } from '../server/events.js';
import * as wfSchema from '@citadel/module-workflow/server/schema.js';
import { buildWorkflowRoutes } from '@citadel/module-workflow/server/routes.js';
import { createDefinition } from '@citadel/module-workflow/server/service.js';
const ORG='aaaaaaaa-0000-0000-0000-000000000001', ORG_B='bbbbbbbb-0000-0000-0000-000000000002';
const OWNER='11111111-1111-1111-1111-111111111111', STAFF='22222222-2222-2222-2222-222222222222', OTHER='33333333-3333-3333-3333-333333333333';
function assert(c:any,m:string){ if(!c) throw new Error(m); console.log('✓',m); }
const fakeAuth=(auth:JwtPayload)=>async(c:any,n:any)=>{c.set('auth',auth); await n();};
function app(db:any,auth:JwtPayload){const a=new Hono(); a.route('/api/v1/qldn-finance-flow',buildQldnFinanceFlowRoutes({db,requireAuth:fakeAuth(auth) as any,audit:async()=>{}})); a.route('/api/v1/workflow',buildWorkflowRoutes({db,requireAuth:fakeAuth(auth) as any,audit:async()=>{}})); return a;}
async function db(){const c=new PGlite(); await c.exec(readFileSync(new URL('../../workflow/migrations/0001_workflow.sql',import.meta.url),'utf8')); await c.exec(readFileSync(new URL('../migrations/0001_qldn_finance_flow.sql',import.meta.url),'utf8')); return drizzle(c,{schema:{...qfi,...wfSchema}}) as any;}
async function seed(d:any,orgId=ORG){await createDefinition(d,orgId,{code:'ketoan.qt-chi-tien-mat',name:'Chi tiền mặt',domain:'finance',entityType:'qfi_payment_request',stepsConfig:[{order:1,name:'KTT',approverRole:'ke-toan-truong'},{order:2,name:'GĐ',approverRole:'giam-doc'}],thresholdRules:[]});}
async function active(d:any,orgId=ORG){const [s]=await d.select().from(wfSchema.wfSteps).where(and(eq(wfSchema.wfSteps.orgId,orgId),eq(wfSchema.wfSteps.status,'active'))).orderBy(asc(wfSchema.wfSteps.stepOrder)).limit(1); return s;}
const owner={sub:OWNER,orgId:ORG,role:'owner'} as any, staff={sub:STAFF,orgId:ORG,role:'staff'} as any, ownerB={sub:OWNER,orgId:ORG_B,role:'owner'} as any;
{const d=await db(); const r=await app(d,staff).request('/api/v1/qldn-finance-flow/payment-requests'); assert(r.status===403,'403 thiếu quyền qldn-finance-flow');}
{const d=await db(); const r=await app(d,staff).request('/api/v1/qldn-finance-flow/payroll/runs',{method:'POST',body:'{}'}); assert(r.status===403,'staff chặn endpoint nhạy cảm payroll write');}
{const d=await db(); await seed(d); const a=app(d,owner); let r=await a.request('/api/v1/qldn-finance-flow/payment-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestNo:'PR1',amount:1000,purpose:'test',documentStatus:'valid',paymentMethod:'cash'})}); assert(r.status===201,'create payment request API'); const pr=(await r.json() as any).paymentRequest; r=await a.request(`/api/v1/qldn-finance-flow/payment-requests/${pr.id}/submit`,{method:'POST',body:'{}'}); assert(r.status===200,'submit payment request API'); await a.request(`/api/v1/workflow/steps/${(await active(d)).id}/approve`,{method:'POST',body:'{}'}); await a.request(`/api/v1/workflow/steps/${(await active(d)).id}/approve`,{method:'POST',body:'{}'}); const [inst]=await d.select().from(wfSchema.wfInstances).where(eq(wfSchema.wfInstances.entityId,pr.id)); await eventHandlers['workflow.instance.approved']({orgId:ORG,payload:{instanceId:inst.id}},{db:d}); r=await a.request(`/api/v1/qldn-finance-flow/payment-requests/${pr.id}/disbursement`); assert((await r.json() as any).disbursement,'disbursement xuất hiện sau workflow approved handler'); const b=app(d,ownerB); r=await b.request(`/api/v1/qldn-finance-flow/payment-requests/${pr.id}`); assert(r.status===404,'org isolation qua API');}
{const d=await db(); const run=await d.insert(qfi.qfiPayrollRuns).values({orgId:ORG,runNo:'R1',periodCode:'2026-07',sourceModule:'generic',grossTotal:'1',netTotal:'1',status:'approved',createdAt:new Date(),updatedAt:new Date()}).returning(); const line=await d.insert(qfi.qfiPayrollLines).values({orgId:ORG,payrollRunId:run[0].id,employeeId:OTHER,grossAmount:'1',deductionAmount:'0',netAmount:'1',status:'approved'}).returning(); const ps=await d.insert(qfi.qfiPayslipFlows).values({orgId:ORG,payrollLineId:line[0].id,employeeId:OTHER,deliveryStatus:'ready',createdAt:new Date()}).returning(); const r=await app(d,staff).request(`/api/v1/qldn-finance-flow/payslips/${ps[0].id}`); assert(r.status===403,'payslip forbidden cho staff/user khác');}
console.log('[qldn-finance-flow-routes] ALL PASSED');
