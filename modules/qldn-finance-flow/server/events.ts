import { and, eq } from 'drizzle-orm';
import { wfInstances } from '@citadel/module-workflow/server/schema.js';
import * as s from './schema.js';
import { executeDisbursement, executePayrollApproval } from './service.js';
type DB=any; const now=()=>new Date();
async function instance(db:DB, orgId:string, id:string){const [r]=await db.select().from(wfInstances).where(and(eq(wfInstances.orgId,orgId),eq(wfInstances.id,id))); return r;}
async function approved(ev:any,{db}:{db:DB}){const orgId=ev.orgId; const inst=await instance(db,orgId,ev.payload?.instanceId); if(!inst) return; await db.transaction(async(tx:DB)=>{switch(inst.entityType){
 case 'qfi_payment_request': await executeDisbursement(tx,orgId,inst.entityId); break;
 case 'qfi_travel_advance': await tx.update(s.qfiTravelAdvances).set({status:'approved',advancedAt:now(),updatedAt:now()}).where(and(eq(s.qfiTravelAdvances.id,inst.entityId),eq(s.qfiTravelAdvances.orgId,orgId))); break;
 case 'qfi_supplier_payment_plan': await tx.update(s.qfiSupplierPaymentPlans).set({status:'approved',approvedAt:now(),updatedAt:now()}).where(and(eq(s.qfiSupplierPaymentPlans.id,inst.entityId),eq(s.qfiSupplierPaymentPlans.orgId,orgId))); break;
 case 'qfi_debt_writeoff': await tx.update(s.qfiDebtWriteoffs).set({status:'approved',approvedAt:now()}).where(and(eq(s.qfiDebtWriteoffs.id,inst.entityId),eq(s.qfiDebtWriteoffs.orgId,orgId))); break;
 case 'qfi_payroll_run': await executePayrollApproval(tx,orgId,inst.entityId); break;
}});}
async function rejected(ev:any,{db}:{db:DB}){const orgId=ev.orgId; const inst=await instance(db,orgId,ev.payload?.instanceId); if(!inst) return; const set={status:'rejected' as const,updatedAt:now()}; switch(inst.entityType){
 case 'qfi_payment_request': await db.update(s.qfiPaymentRequests).set(set).where(and(eq(s.qfiPaymentRequests.id,inst.entityId),eq(s.qfiPaymentRequests.orgId,orgId))); break;
 case 'qfi_travel_advance': await db.update(s.qfiTravelAdvances).set(set).where(and(eq(s.qfiTravelAdvances.id,inst.entityId),eq(s.qfiTravelAdvances.orgId,orgId))); break;
 case 'qfi_supplier_payment_plan': await db.update(s.qfiSupplierPaymentPlans).set(set).where(and(eq(s.qfiSupplierPaymentPlans.id,inst.entityId),eq(s.qfiSupplierPaymentPlans.orgId,orgId))); break;
 case 'qfi_debt_writeoff': await db.update(s.qfiDebtWriteoffs).set({status:'rejected'}).where(and(eq(s.qfiDebtWriteoffs.id,inst.entityId),eq(s.qfiDebtWriteoffs.orgId,orgId))); break;
 case 'qfi_payroll_run': await db.update(s.qfiPayrollRuns).set(set).where(and(eq(s.qfiPayrollRuns.id,inst.entityId),eq(s.qfiPayrollRuns.orgId,orgId))); break;
}}
export const eventHandlers={'workflow.instance.approved':approved,'workflow.instance.rejected':rejected};
