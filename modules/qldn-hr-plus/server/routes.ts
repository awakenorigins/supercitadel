import { Hono, type Context, type MiddlewareHandler, type Next } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { AppError, Errors, hasPermission, type JwtPayload, type Permission, type Role } from '@citadel/core';
import * as s from './schema.js';
import * as svc from './service.js';
declare module 'hono' { interface ContextVariableMap { auth: JwtPayload } }
type AuditFn=(c:Context,e:{action:string;resource?:string;resourceId?:string;detail?:unknown})=>Promise<void>;
const org=(c:Context)=>(c.get('auth') as JwtPayload).orgId; const actor=(c:Context)=>(c.get('auth') as JwtPayload).sub;
const user=(c:Context)=>({id:actor(c),roles:[(c.get('auth') as JwtPayload).role]});
function permit(p:Permission){return async(c:Context,next:Next)=>{const a=c.get('auth') as JwtPayload;if(!hasPermission(a.role as Role,p))throw Errors.forbidden(`Bạn không có quyền ${p} (PERMISSION_DENIED)`);await next();};}
async function body(c:Context){return c.req.json().catch(()=>({}));}
async function one(db:any,t:any,orgId:string,id:string){const [r]=await db.select().from(t).where(and(eq(t.orgId,orgId),eq(t.id,id))); if(!r) throw Errors.notFound('Không tìm thấy dữ liệu'); return r;}
const list=(db:any,t:any,orgId:string)=>db.select().from(t).where(eq(t.orgId,orgId)).orderBy(desc(t.createdAt));
async function audit(deps:any,c:Context,action:string,resource?:string,resourceId?:string,detail?:unknown){await deps.audit?.(c,{action,resource,resourceId,detail});}
export function buildQldnHrPlusRoutes(deps:{db:any;requireAuth:MiddlewareHandler;gate?:MiddlewareHandler;audit?:AuditFn}){const r=new Hono();
r.onError((err,c)=>err instanceof AppError?c.json(err.toJSON(),err.status as 400):(console.error('[qldn-hr-plus]',err),c.json({error:{code:'INTERNAL',message:'Lỗi hệ thống'}},500)));
r.use('*',deps.requireAuth); if(deps.gate) r.use('*',deps.gate); r.get('/health',c=>c.json({module:'qldn-hr-plus',ok:true,version:'1.0.0'}));
// Recruitment + probation + onboarding
r.get('/recruitment/requests',permit('qldn-hr-plus.recruitment.read'),async c=>c.json({requests:await list(deps.db,s.qhrRecruitmentRequests,org(c))}));
r.post('/recruitment/requests',permit('qldn-hr-plus.recruitment.write'),async c=>{const row=await svc.createRecruitmentRequest(deps.db,org(c),{...(await body(c)),createdBy:actor(c)});await audit(deps,c,'qhr.recruitment_request.create','qhr_recruitment_requests',row.id);return c.json({request:row},201);});
r.get('/recruitment/plans',permit('qldn-hr-plus.recruitment.read'),async c=>c.json({plans:await list(deps.db,s.qhrRecruitmentPlans,org(c))}));
r.post('/recruitment/plans',permit('qldn-hr-plus.recruitment.write'),async c=>c.json({plan:await svc.createRecruitmentPlan(deps.db,org(c),{...(await body(c)),requestedBy:actor(c)})},201));
r.get('/job-postings',permit('qldn-hr-plus.recruitment.read'),async c=>c.json({jobPostings:await list(deps.db,s.qhrJobPostings,org(c))}));
r.post('/job-postings',permit('qldn-hr-plus.recruitment.write'),async c=>c.json({jobPosting:await svc.createJobPosting(deps.db,org(c),await body(c))},201));
r.get('/candidates',permit('qldn-hr-plus.candidate.read'),async c=>c.json({candidates:await list(deps.db,s.qhrCandidates,org(c))}));
r.post('/candidates',permit('qldn-hr-plus.candidate.write'),async c=>{const row=await svc.createCandidate(deps.db,org(c),await body(c));await audit(deps,c,'qhr.candidate.create','qhr_candidates',row.id);return c.json({candidate:row},201);});
r.get('/applications',permit('qldn-hr-plus.candidate.read'),async c=>c.json({applications:await list(deps.db,s.qhrApplications,org(c))}));
r.post('/applications',permit('qldn-hr-plus.candidate.write'),async c=>c.json({application:await svc.applyCandidate(deps.db,org(c),await body(c))},201));
r.post('/applications/:id/advance',permit('qldn-hr-plus.candidate.write'),async c=>{const b=await body(c);const row=await svc.advanceApplication(deps.db,org(c),String(c.req.param('id')),b.stage,b);await audit(deps,c,'qhr.application.advance','qhr_applications',row.id,{stage:b.stage});return c.json({application:row});});
r.post('/applications/:id/hire',permit('qldn-hr-plus.onboarding.execute'),async c=>{const row=await svc.hireCandidate(deps.db,org(c),String(c.req.param('id')),await body(c));await audit(deps,c,'qhr.candidate.hire','qhr_applications',row.id);return c.json({application:row});});
r.get('/probations',permit('qldn-hr-plus.probation.read'),async c=>c.json({probations:await list(deps.db,s.qhrProbationPeriods,org(c))}));
r.post('/probations',permit('qldn-hr-plus.probation.write'),async c=>c.json({probation:await svc.createProbation(deps.db,org(c),await body(c))},201));
r.post('/probations/:id/evaluate',permit('qldn-hr-plus.probation.evaluate'),async c=>{const row=await svc.evaluateProbation(deps.db,org(c),String(c.req.param('id')),{...(await body(c)),evaluatedBy:actor(c)});await audit(deps,c,'qhr.probation.evaluate','qhr_probation_periods',String(c.req.param('id')));return c.json({probation:row});});
r.get('/onboarding/checklists',permit('qldn-hr-plus.recruitment.read'),async c=>c.json({checklists:await deps.db.select().from(s.qhrOnboardingChecklists).where(eq(s.qhrOnboardingChecklists.orgId,org(c)))}));
// Contracts + transfer + trip
r.get('/contracts',permit('qldn-hr-plus.contract.read'),async c=>c.json({contracts:await list(deps.db,s.qhrEmploymentContracts,org(c))}));
r.post('/contracts',permit('qldn-hr-plus.contract.write'),async c=>c.json({contract:await svc.createContract(deps.db,org(c),await body(c))},201));
r.post('/contracts/:id/transition',permit('qldn-hr-plus.contract.sign'),async c=>{const b=await body(c);const row=await svc.transitionContract(deps.db,org(c),String(c.req.param('id')),b.status,b);await audit(deps,c,'qhr.contract.transition','qhr_employment_contracts',row.id);return c.json({contract:row});});
r.post('/contracts/:id/tracking',permit('qldn-hr-plus.contract.write'),async c=>{const b=await body(c);return c.json({trackingEvent:await svc.addContractTrackingEvent(deps.db,org(c),String(c.req.param('id')),b.event,{...b,actorId:actor(c)})},201);});
r.post('/contracts/scan-expiry',permit('qldn-hr-plus.contract.read'),async c=>c.json({due:await svc.scanContractExpiry(deps.db,org(c),Number(c.req.query('days')??30))}));
r.get('/transfers',permit('qldn-hr-plus.transfer.read'),async c=>c.json({transfers:await list(deps.db,s.qhrTransferRequests,org(c))}));
r.post('/transfers',permit('qldn-hr-plus.transfer.write'),async c=>c.json({transfer:await svc.createTransferRequest(deps.db,org(c),{...(await body(c)),requestedBy:actor(c)})},201));
r.get('/trips',permit('qldn-hr-plus.trip.read'),async c=>c.json({trips:await list(deps.db,s.qhrBusinessTripRequests,org(c))}));
r.post('/trips',permit('qldn-hr-plus.trip.write'),async c=>c.json({trip:await svc.createTripRequest(deps.db,org(c),{...(await body(c)),requestedBy:actor(c)})},201));
r.post('/trips/:id/advance',permit('qldn-hr-plus.trip.write'),async c=>c.json({trip:await svc.requestTripAdvance(deps.db,org(c),String(c.req.param('id')),await body(c))}));
// Training
r.get('/training/requests',permit('qldn-hr-plus.training.read'),async c=>c.json({requests:await list(deps.db,s.qhrTrainingRequests,org(c))}));
r.post('/training/requests',permit('qldn-hr-plus.training.write'),async c=>c.json({request:await svc.createTrainingRequest(deps.db,org(c),{...(await body(c)),requesterId:actor(c)})},201));
r.get('/training/courses',permit('qldn-hr-plus.training.read'),async c=>c.json({courses:await list(deps.db,s.qhrTrainingCourses,org(c))}));
r.post('/training/courses',permit('qldn-hr-plus.training.write'),async c=>c.json({course:await svc.createTrainingCourse(deps.db,org(c),await body(c))},201));
r.get('/training/enrollments',permit('qldn-hr-plus.training.read'),async c=>c.json({enrollments:await list(deps.db,s.qhrTrainingEnrollments,org(c))}));
r.post('/training/enrollments',permit('qldn-hr-plus.training.write'),async c=>c.json({enrollment:await svc.enrollTraining(deps.db,org(c),await body(c))},201));
r.post('/training/enrollments/:id/evaluate',permit('qldn-hr-plus.training.evaluate'),async c=>{const b=await body(c);return c.json({evaluation:await svc.evaluateTraining(deps.db,org(c),{...b,enrollmentId:String(c.req.param('id')),evaluatorId:actor(c)})});});
// Discipline + offboarding + audit
r.get('/discipline/cases',permit('qldn-hr-plus.discipline.read'),async c=>c.json({cases:await list(deps.db,s.qhrViolationCases,org(c))}));
r.post('/discipline/cases',permit('qldn-hr-plus.discipline.write'),async c=>c.json({case:await svc.reportViolation(deps.db,org(c),{...(await body(c)),reportedBy:actor(c)})},201));
r.post('/discipline/cases/:id/decision',permit('qldn-hr-plus.discipline.write'),async c=>{const row=await svc.createDisciplinaryDecision(deps.db,org(c),{...(await body(c)),caseId:String(c.req.param('id')),signedBy:actor(c)});await audit(deps,c,'qhr.violation.decide','qhr_disciplinary_decisions',row.id);return c.json({decision:row});});
r.get('/offboarding/resignations',permit('qldn-hr-plus.offboarding.read'),async c=>c.json({resignations:await list(deps.db,s.qhrResignationRequests,org(c))}));
r.post('/offboarding/resignations',permit('qldn-hr-plus.offboarding.write'),async c=>c.json({resignation:await svc.createResignation(deps.db,org(c),{...(await body(c)),createdBy:actor(c)})},201));
r.post('/offboarding/resignations/:id/exit-interview',permit('qldn-hr-plus.offboarding.write'),async c=>c.json({exitInterview:await svc.conductExitInterview(deps.db,org(c),String(c.req.param('id')),{...(await body(c)),interviewerId:actor(c)})},201));
r.get('/offboarding/exit-interviews/:id',permit('qldn-hr-plus.exitinterview.read'),async c=>c.json({exitInterview:await svc.getExitInterview(deps.db,org(c),String(c.req.param('id')),user(c))}));
r.post('/offboarding/resignations/:id/handover',permit('qldn-hr-plus.offboarding.write'),async c=>c.json({handover:await svc.addHandoverRecord(deps.db,org(c),String(c.req.param('id')),await body(c))},201));
r.get('/offboarding/checklists',permit('qldn-hr-plus.offboarding.read'),async c=>c.json({checklists:await deps.db.select().from(s.qhrOffboardingChecklists).where(eq(s.qhrOffboardingChecklists.orgId,org(c)))}));
r.post('/offboarding/checklists/:id/done',permit('qldn-hr-plus.offboarding.write'),async c=>c.json({checklist:await svc.markOffboardingChecklist(deps.db,org(c),String(c.req.param('id')),{doneBy:actor(c)})}));
r.post('/offboarding/resignations/:id/settlement',permit('qldn-hr-plus.offboarding.write'),async c=>c.json({settlement:await svc.createFinalSettlement(deps.db,org(c),String(c.req.param('id')),{...(await body(c)),payrollSettledBy:actor(c)})}));
r.get('/audit/plans',permit('qldn-hr-plus.audit.read'),async c=>c.json({plans:await list(deps.db,s.qhrAuditPlans,org(c))}));
r.post('/audit/plans',permit('qldn-hr-plus.audit.write'),async c=>c.json({plan:await svc.createAuditPlan(deps.db,org(c),{...(await body(c)),requestedBy:actor(c)})},201));
r.post('/audit/findings',permit('qldn-hr-plus.audit.write'),async c=>c.json({finding:await svc.createAuditFinding(deps.db,org(c),{...(await body(c)),reportedBy:actor(c)})},201));
r.post('/audit/corrective-actions/scan-overdue',permit('qldn-hr-plus.audit.read'),async c=>c.json({overdue:await svc.scanOverdueCorrectiveActions(deps.db,org(c))}));
return r;}
