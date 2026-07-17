import { and, eq } from 'drizzle-orm';
import { wfInstances } from '@citadel/module-workflow/server/schema.js';
import * as s from './schema.js';
type DB=any; const now=()=>new Date();
async function instance(db:DB,orgId:string,id:string){const [r]=await db.select().from(wfInstances).where(and(eq(wfInstances.orgId,orgId),eq(wfInstances.id,id))); return r;}
async function approved(ev:any,{db}:{db:DB}){const orgId=ev.orgId; const inst=await instance(db,orgId,ev.payload?.instanceId); if(!inst) return; await db.transaction(async(tx:DB)=>{switch(inst.entityType){
 case 'qhr_recruitment_requests': await tx.update(s.qhrRecruitmentRequests).set({status:'approved',updatedAt:now()}).where(and(eq(s.qhrRecruitmentRequests.id,inst.entityId),eq(s.qhrRecruitmentRequests.orgId,orgId))); break;
 case 'qhr_recruitment_plans': await tx.update(s.qhrRecruitmentPlans).set({status:'approved',updatedAt:now()}).where(and(eq(s.qhrRecruitmentPlans.id,inst.entityId),eq(s.qhrRecruitmentPlans.orgId,orgId))); break;
 case 'qhr_probation_extension_requests': { const [ex]=await tx.update(s.qhrProbationExtensionRequests).set({status:'approved',updatedAt:now()}).where(and(eq(s.qhrProbationExtensionRequests.id,inst.entityId),eq(s.qhrProbationExtensionRequests.orgId,orgId))).returning(); if(ex){const [p]=await tx.select().from(s.qhrProbationPeriods).where(and(eq(s.qhrProbationPeriods.id,ex.probationId),eq(s.qhrProbationPeriods.orgId,orgId))); if(p && p.extensionCount<1) await tx.update(s.qhrProbationPeriods).set({status:'extended',extensionCount:1,updatedAt:now()}).where(eq(s.qhrProbationPeriods.id,p.id));} break;}
}})}
async function rejected(ev:any,{db}:{db:DB}){const orgId=ev.orgId; const inst=await instance(db,orgId,ev.payload?.instanceId); if(!inst) return; const patch={status:'rejected' as const,updatedAt:now()}; switch(inst.entityType){
 case 'qhr_recruitment_requests': await db.update(s.qhrRecruitmentRequests).set(patch).where(and(eq(s.qhrRecruitmentRequests.id,inst.entityId),eq(s.qhrRecruitmentRequests.orgId,orgId))); break;
 case 'qhr_recruitment_plans': await db.update(s.qhrRecruitmentPlans).set(patch).where(and(eq(s.qhrRecruitmentPlans.id,inst.entityId),eq(s.qhrRecruitmentPlans.orgId,orgId))); break;
 case 'qhr_probation_extension_requests': await db.update(s.qhrProbationExtensionRequests).set(patch).where(and(eq(s.qhrProbationExtensionRequests.id,inst.entityId),eq(s.qhrProbationExtensionRequests.orgId,orgId))); break;
}}
export const eventHandlers={'workflow.instance.approved':approved,'workflow.instance.rejected':rejected};
