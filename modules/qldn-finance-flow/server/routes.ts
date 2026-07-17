import { Hono, type Context, type MiddlewareHandler, type Next } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { AppError, Errors, hasPermission, type JwtPayload, type Permission, type Role } from '@citadel/core';
import * as s from './schema.js';
import * as svc from './service.js';

type AuditFn = (c: Context, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;
declare module 'hono' { interface ContextVariableMap { auth: JwtPayload } }
const orgOf=(c:Context)=>(c.get('auth') as JwtPayload).orgId;
const actorOf=(c:Context)=>(c.get('auth') as JwtPayload).sub;
function permit(perm: Permission){ return async(c:Context,next:Next)=>{ const a=c.get('auth') as JwtPayload; if(!hasPermission(a.role as Role,perm)) throw Errors.forbidden(`Bạn không có quyền ${perm} (PERMISSION_DENIED)`); await next(); }; }
async function body(c:Context){ return c.req.json().catch(()=>({})); }
async function one(db:any,t:any,orgId:string,id:string){ const [r]=await db.select().from(t).where(and(eq(t.orgId,orgId),eq(t.id,id))); if(!r) throw Errors.notFound('Không tìm thấy dữ liệu'); return r; }

export function buildQldnFinanceFlowRoutes(deps:{db:any;requireAuth:MiddlewareHandler;gate?:MiddlewareHandler;audit?:AuditFn}){
 const r=new Hono();
 r.onError((err,c)=>err instanceof AppError?c.json(err.toJSON(),err.status as 400):(console.error('[qldn-finance-flow]',err),c.json({error:{code:'INTERNAL',message:'Lỗi hệ thống'}},500)));
 r.use('*',deps.requireAuth); if(deps.gate) r.use('*',deps.gate);
 r.get('/health',(c)=>c.json({module:'qldn-finance-flow',ok:true,version:'1.0.0'}));

 r.get('/payment-requests',permit('qldn-finance-flow.payment-request.read'),async(c)=>{ const q=c.req.query('status'); let w:any=eq(s.qfiPaymentRequests.orgId,orgOf(c)); if(q) w=and(w,eq(s.qfiPaymentRequests.status,q)); return c.json({paymentRequests:await deps.db.select().from(s.qfiPaymentRequests).where(w).orderBy(desc(s.qfiPaymentRequests.createdAt))}); });
 r.post('/payment-requests',permit('qldn-finance-flow.payment-request.write'),async(c)=>{ const b=await body(c); const row=await svc.createPaymentRequest(deps.db,orgOf(c),{...b,createdBy:actorOf(c),requesterId:b.requesterId??actorOf(c)}); await deps.audit?.(c,{action:'qfi.payment_request.create',resource:'qfi_payment_requests',resourceId:row.id}); return c.json({paymentRequest:row},201); });
 r.get('/payment-requests/:id',permit('qldn-finance-flow.payment-request.read'),async(c)=>c.json({paymentRequest:await one(deps.db,s.qfiPaymentRequests,orgOf(c),String(c.req.param('id')))}));
 r.post('/payment-requests/:id/submit',permit('qldn-finance-flow.payment-request.write'),async(c)=>{ const row=await svc.submitPaymentRequest(deps.db,orgOf(c),String(c.req.param('id')),{...(await body(c)),requestedBy:actorOf(c)}); await deps.audit?.(c,{action:'qfi.payment_request.submit',resource:'qfi_payment_requests',resourceId:row.id}); return c.json({paymentRequest:row}); });
 r.get('/payment-requests/:id/disbursement',permit('qldn-finance-flow.payment-request.read'),async(c)=>{ const rows=await deps.db.select().from(s.qfiPaymentDisbursements).where(and(eq(s.qfiPaymentDisbursements.orgId,orgOf(c)),eq(s.qfiPaymentDisbursements.paymentRequestId,String(c.req.param('id'))))); return c.json({disbursement:rows[0]??null}); });

 r.get('/advances',permit('qldn-finance-flow.advance.read'),async(c)=>c.json({travelAdvances:await deps.db.select().from(s.qfiTravelAdvances).where(eq(s.qfiTravelAdvances.orgId,orgOf(c))).orderBy(desc(s.qfiTravelAdvances.createdAt))}));
 r.post('/advances',permit('qldn-finance-flow.advance.write'),async(c)=>{ const b=await body(c); const row=await svc.createTravelAdvance(deps.db,orgOf(c),{...b,requestedBy:actorOf(c),employeeId:b.employeeId??actorOf(c)}); await deps.audit?.(c,{action:'qfi.advance.create',resource:'qfi_travel_advances',resourceId:row.id}); return c.json({travelAdvance:row},201); });
 r.post('/advances/submit',permit('qldn-finance-flow.advance.write'),async(c)=>{ const row=await svc.createTravelAdvance(deps.db,orgOf(c),{...(await body(c)),requestedBy:actorOf(c)}); return c.json({travelAdvance:row},201); });
 r.post('/advances/:id/settle',permit('qldn-finance-flow.advance.settle'),async(c)=>{ const b=await body(c); const adv=await one(deps.db,s.qfiTravelAdvances,orgOf(c),String(c.req.param('id'))); const res=await svc.settleTravelExpense(deps.db,orgOf(c),{...b,employeeId:b.employeeId??adv.employeeId,advanceAmount:b.advanceAmount??adv.advanceAmount,claimNo:b.claimNo??`CL-${Date.now()}`}); await deps.audit?.(c,{action:'qfi.advance.settle',resource:'qfi_travel_advances',resourceId:adv.id}); return c.json(res); });

 r.get('/material-receipts',permit('qldn-finance-flow.debt.read'),async(c)=>c.json({materialReceipts:await deps.db.select().from(s.qfiMaterialReceiptReports).where(eq(s.qfiMaterialReceiptReports.orgId,orgOf(c))).orderBy(desc(s.qfiMaterialReceiptReports.createdAt))}));
 r.post('/material-receipts',permit('qldn-finance-flow.debt.write'),async(c)=>c.json({materialReceipt:await svc.createMaterialReceiptReport(deps.db,orgOf(c),await body(c))},201));
 r.get('/material-receipts/:id',permit('qldn-finance-flow.debt.read'),async(c)=>c.json({materialReceipt:await one(deps.db,s.qfiMaterialReceiptReports,orgOf(c),String(c.req.param('id')))}));
 r.patch('/material-receipts/:id',permit('qldn-finance-flow.debt.write'),async(c)=>{ const [row]=await deps.db.update(s.qfiMaterialReceiptReports).set({...(await body(c)),updatedAt:new Date()}).where(and(eq(s.qfiMaterialReceiptReports.orgId,orgOf(c)),eq(s.qfiMaterialReceiptReports.id,String(c.req.param('id'))))).returning(); return c.json({materialReceipt:row}); });
 r.post('/supplier-debt/reconcile',permit('qldn-finance-flow.debt.write'),async(c)=>c.json({supplierDebt:await svc.reconcileSupplierDebt(deps.db,orgOf(c),await body(c))},201));
 r.post('/payment-plans',permit('qldn-finance-flow.debt.write'),async(c)=>c.json({paymentPlan:await svc.createSupplierPaymentPlan(deps.db,orgOf(c),{...(await body(c)),requestedBy:actorOf(c)})}));
 r.post('/payment-plans/:id/submit',permit('qldn-finance-flow.debt.write'),async(c)=>{ const row=await one(deps.db,s.qfiSupplierPaymentPlans,orgOf(c),String(c.req.param('id'))); return c.json({paymentPlan:row}); });

 r.get('/statements',permit('qldn-finance-flow.debt.read'),async(c)=>c.json({statements:await deps.db.select().from(s.qfiCustomerDebtStatements).where(eq(s.qfiCustomerDebtStatements.orgId,orgOf(c))).orderBy(desc(s.qfiCustomerDebtStatements.createdAt))}));
 r.post('/statements',permit('qldn-finance-flow.debt.write'),async(c)=>c.json({statement:await svc.createDebtStatement(deps.db,orgOf(c),await body(c))},201));
 r.post('/collection-actions',permit('qldn-finance-flow.debt.write'),async(c)=>c.json({collectionAction:await svc.recordCollectionAction(deps.db,orgOf(c),{...(await body(c)),actorId:actorOf(c)})},201));
 r.get('/reminders/due',permit('qldn-finance-flow.debt.read'),async(c)=>c.json({reminders:await svc.dueDebtReminders(deps.db,orgOf(c))}));
 r.post('/writeoffs/submit',permit('qldn-finance-flow.debt.write'),async(c)=>c.json({writeoff:await svc.writeoffDebt(deps.db,orgOf(c),{...(await body(c)),requestedBy:actorOf(c)})}));

 r.post('/payroll/runs',permit('qldn-finance-flow.payroll-flow.write'),async(c)=>c.json({run:await svc.createPayrollRun(deps.db,orgOf(c),{...(await body(c)),createdBy:actorOf(c)})},201));
 r.post('/payroll/runs/:id/submit',permit('qldn-finance-flow.payroll-flow.write'),async(c)=>c.json({run:await svc.submitPayrollRun(deps.db,orgOf(c),String(c.req.param('id')),{requestedBy:actorOf(c)})}));
 r.post('/payroll/runs/:id/approve-execute',permit('qldn-finance-flow.payroll-flow.approve'),async(c)=>{ const o=await deps.db.transaction((tx:any)=>svc.executePayrollApproval(tx,orgOf(c),String(c.req.param('id')))); return c.json({salaryPaymentOrder:o}); });
 r.get('/payslips/:id',permit('qldn-finance-flow.payroll-flow.read'),async(c)=>c.json({payslip:await svc.getPayslip(deps.db,orgOf(c),String(c.req.param('id')),{employeeUserId:actorOf(c),roles:[(c.get('auth') as JwtPayload).role]})}));
 return r;
}
