import { and, eq } from 'drizzle-orm';
import { wfInstances } from '@citadel/module-workflow/server/schema.js';
import * as s from './schema.js';
import { approveTransfer, issueResignationDecision } from './service.js';
type DB=any; const now=()=>new Date();
async function instance(db:DB,orgId:string,id:string){const [r]=await db.select().from(wfInstances).where(and(eq(wfInstances.orgId,orgId),eq(wfInstances.id,id))); return r;}
async function approved(ev:any,{db}:{db:DB}){const orgId=ev.orgId; const inst=await instance(db,orgId,ev.payload?.instanceId); if(!inst) return; await db.transaction(async(tx:DB)=>{switch(inst.entityType){
 case 'qhr_recruitment_requests': await tx.update(s.qhrRecruitmentRequests).set({status:'approved',updatedAt:now()}).where(and(eq(s.qhrRecruitmentRequests.id,inst.entityId),eq(s.qhrRecruitmentRequests.orgId,orgId))); break;
 case 'qhr_recruitment_plans': await tx.update(s.qhrRecruitmentPlans).set({status:'approved',updatedAt:now()}).where(and(eq(s.qhrRecruitmentPlans.id,inst.entityId),eq(s.qhrRecruitmentPlans.orgId,orgId))); break;
 case 'qhr_transfer_requests': await approveTransfer(tx,orgId,inst.entityId,{signedBy:ev.payload?.actorUserId}); break;
 case 'qhr_business_trip_requests': await tx.update(s.qhrBusinessTripRequests).set({status:'approved',updatedAt:now()}).where(and(eq(s.qhrBusinessTripRequests.id,inst.entityId),eq(s.qhrBusinessTripRequests.orgId,orgId))); break;
 case 'qhr_training_requests': await tx.update(s.qhrTrainingRequests).set({status:'approved',approvedBy:ev.payload?.actorUserId,updatedAt:now()}).where(and(eq(s.qhrTrainingRequests.id,inst.entityId),eq(s.qhrTrainingRequests.orgId,orgId))); break;
 case 'qhr_training_plans': await tx.update(s.qhrTrainingPlans).set({status:'approved',updatedAt:now()}).where(and(eq(s.qhrTrainingPlans.id,inst.entityId),eq(s.qhrTrainingPlans.orgId,orgId))); break;
 case 'qhr_resignation_requests': await issueResignationDecision(tx,orgId,inst.entityId,{signedBy:ev.payload?.actorUserId}); break;
 case 'qhr_audit_plans': await tx.update(s.qhrAuditPlans).set({status:'approved',approvedBy:ev.payload?.actorUserId,updatedAt:now()}).where(and(eq(s.qhrAuditPlans.id,inst.entityId),eq(s.qhrAuditPlans.orgId,orgId))); break;
 case 'qhr_disciplinary_meetings': await tx.update(s.qhrDisciplinaryMeetings).set({status:'held',heldAt:now(),updatedAt:now()}).where(and(eq(s.qhrDisciplinaryMeetings.id,inst.entityId),eq(s.qhrDisciplinaryMeetings.orgId,orgId))); break;
 case 'qhr_probation_extension_requests': { const [ex]=await tx.update(s.qhrProbationExtensionRequests).set({status:'approved',updatedAt:now()}).where(and(eq(s.qhrProbationExtensionRequests.id,inst.entityId),eq(s.qhrProbationExtensionRequests.orgId,orgId))).returning(); if(ex){const [p]=await tx.select().from(s.qhrProbationPeriods).where(and(eq(s.qhrProbationPeriods.id,ex.probationId),eq(s.qhrProbationPeriods.orgId,orgId))); if(p && p.extensionCount<1) await tx.update(s.qhrProbationPeriods).set({status:'extended',extensionCount:1,updatedAt:now()}).where(and(eq(s.qhrProbationPeriods.id,p.id),eq(s.qhrProbationPeriods.orgId,orgId)));} break;}
}})}
async function rejected(ev:any,{db}:{db:DB}){const orgId=ev.orgId; const inst=await instance(db,orgId,ev.payload?.instanceId); if(!inst) return; const patch={status:'rejected' as const,updatedAt:now()}; switch(inst.entityType){
 case 'qhr_recruitment_requests': await db.update(s.qhrRecruitmentRequests).set(patch).where(and(eq(s.qhrRecruitmentRequests.id,inst.entityId),eq(s.qhrRecruitmentRequests.orgId,orgId))); break;
 case 'qhr_recruitment_plans': await db.update(s.qhrRecruitmentPlans).set(patch).where(and(eq(s.qhrRecruitmentPlans.id,inst.entityId),eq(s.qhrRecruitmentPlans.orgId,orgId))); break;
 case 'qhr_transfer_requests': await db.update(s.qhrTransferRequests).set(patch).where(and(eq(s.qhrTransferRequests.id,inst.entityId),eq(s.qhrTransferRequests.orgId,orgId))); break;
 case 'qhr_business_trip_requests': await db.update(s.qhrBusinessTripRequests).set(patch).where(and(eq(s.qhrBusinessTripRequests.id,inst.entityId),eq(s.qhrBusinessTripRequests.orgId,orgId))); break;
 case 'qhr_training_requests': await db.update(s.qhrTrainingRequests).set(patch).where(and(eq(s.qhrTrainingRequests.id,inst.entityId),eq(s.qhrTrainingRequests.orgId,orgId))); break;
 case 'qhr_training_plans': await db.update(s.qhrTrainingPlans).set(patch).where(and(eq(s.qhrTrainingPlans.id,inst.entityId),eq(s.qhrTrainingPlans.orgId,orgId))); break;
 case 'qhr_probation_extension_requests': await db.update(s.qhrProbationExtensionRequests).set(patch).where(and(eq(s.qhrProbationExtensionRequests.id,inst.entityId),eq(s.qhrProbationExtensionRequests.orgId,orgId))); break;
 case 'qhr_resignation_requests': await db.update(s.qhrResignationRequests).set(patch).where(and(eq(s.qhrResignationRequests.id,inst.entityId),eq(s.qhrResignationRequests.orgId,orgId))); break;
 case 'qhr_audit_plans': await db.update(s.qhrAuditPlans).set(patch).where(and(eq(s.qhrAuditPlans.id,inst.entityId),eq(s.qhrAuditPlans.orgId,orgId))); break;
 case 'qhr_disciplinary_meetings': await db.update(s.qhrDisciplinaryMeetings).set(patch).where(and(eq(s.qhrDisciplinaryMeetings.id,inst.entityId),eq(s.qhrDisciplinaryMeetings.orgId,orgId))); break;
}}
export const eventHandlers={'workflow.instance.approved':approved,'workflow.instance.rejected':rejected};
