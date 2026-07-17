import { Hono } from 'hono';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { and, asc, eq } from 'drizzle-orm';
import type { JwtPayload } from '@citadel/core';
import * as qpr from '../server/schema.js';
import * as wfSchema from '@citadel/module-workflow/server/schema.js';
import { buildQldnProcurementRoutes } from '../server/routes.js';
import { approve, createDefinition } from '@citadel/module-workflow/server/service.js';
import { eventHandlers } from '../server/events.js';
const ORG='aaaaaaaa-0000-0000-0000-000000000001', ORGB='bbbbbbbb-0000-0000-0000-000000000002', OWNER='11111111-1111-1111-1111-111111111111', STAFF='22222222-2222-2222-2222-222222222222', GD='55555555-5555-5555-5555-555555555555';
function assert(c:any,m:string){if(!c) throw new Error(m); console.log('✓',m)}
const fake=(a:JwtPayload)=>async(c:any,n:any)=>{c.set('auth',a);await n()};
function app(db:any,a:any){const h=new Hono();h.route('/api/v1/qldn-procurement',buildQldnProcurementRoutes({db,requireAuth:fake(a) as any,audit:async()=>{}}));return h}
const J={'content-type':'application/json'}; const post=(a:Hono,url:string,b:any={})=>a.request(url,{method:'POST',headers:J,body:JSON.stringify(b)});
async function make(){const c=new PGlite(); await c.exec(readFileSync(new URL('../../workflow/migrations/0001_workflow.sql',import.meta.url),'utf8')); await c.exec(readFileSync(new URL('../migrations/0001_qldn_procurement.sql',import.meta.url),'utf8')); (globalThis as any).__citadelOutboxEnabled=false; const db=drizzle(c,{schema:{...qpr,...wfSchema}}) as any;
 for(const orgId of [ORG,ORGB]){
  await createDefinition(db,orgId,{code:'vanhanh.qt-mua-hang-de-ban',name:'QT mua hàng để bán',domain:'vanhanh',entityType:'qpr_purchase_requests',stepsConfig:[{order:1,name:'Trưởng BP',approverRole:'truong-bp'},{order:2,name:'TGĐ',approverRole:'tong-giam-doc'}],thresholdRules:[{minAmount:20000000,addSteps:[{order:2,name:'GĐ Tài chính',approverRole:'giam-doc-tai-chinh'}]}]});
  await createDefinition(db,orgId,{code:'vanhanh.qt-dau-thau',name:'QT đấu thầu',domain:'vanhanh',entityType:'qpr_bid_projects',stepsConfig:[{order:1,name:'KTT',approverRole:'ke-toan-truong'},{order:2,name:'GĐKD',approverRole:'giam-doc-kinh-doanh'},{order:3,name:'P.TGĐ',approverRole:'pho-tong-giam-doc'},{order:4,name:'TGĐ',approverRole:'tong-giam-doc'}],thresholdRules:[{minAmount:20000000,addSteps:[{order:3,name:'GĐTC (giá khác chuẩn)',approverRole:'giam-doc-tai-chinh'}]}]});
 }
 return db;}
async function approveAll(db:any,orgId:string,instanceId:string){while(true){const [st]=await db.select().from(wfSchema.wfSteps).where(and(eq(wfSchema.wfSteps.orgId,orgId),eq(wfSchema.wfSteps.instanceId,instanceId),eq(wfSchema.wfSteps.status,'active'))).orderBy(asc(wfSchema.wfSteps.stepOrder)).limit(1); if(!st) break; await approve(db,orgId,{stepId:st.id,actorUserId:GD,entityOrgId:orgId});}}
const owner={sub:OWNER,orgId:ORG,role:'owner'} as any, staff={sub:STAFF,orgId:ORG,role:'staff'} as any, ownerB={sub:OWNER,orgId:ORGB,role:'owner'} as any;

// ── 403 thiếu quyền ──
{const db=await make(); const r=await app(db,staff).request('/api/v1/qldn-procurement/suppliers'); assert(r.status===403,'403 staff thiếu quyền supplier.read');
 const r2=await post(app(db,staff),'/api/v1/qldn-procurement/purchase-requests',{requestNo:'X'}); assert(r2.status===403,'403 staff thiếu quyền purchase.write');}

// ── Full flow API: PR 25tr → 3 quotes → submit → duyệt các cấp → PO → GR partial + full → closed ──
{const db=await make(); const a=app(db,owner);
 const sup=async(code:string)=>((await (await post(a,'/api/v1/qldn-procurement/suppliers',{code,name:`NCC ${code}`})).json()) as any).supplier;
 const s1=await sup('NCC1'), s2=await sup('NCC2'), s3=await sup('NCC3');
 const pr=((await (await post(a,'/api/v1/qldn-procurement/purchase-requests',{requestNo:'PR-25',totalEstimate:25000000,lines:[{productName:'Máy chủ',qty:2,estPrice:12500000}]})).json()) as any).purchaseRequest;
 let sub=await post(a,`/api/v1/qldn-procurement/purchase-requests/${pr.id}/submit`);
 assert(sub.status===400,'submit chặn khi <3 quotes (3-NCC enforce qua API)');
 for(const [sid,price,selected] of [[s1.id,25000000,false],[s2.id,26000000,false],[s3.id,24500000,true]] as any) await post(a,'/api/v1/qldn-procurement/quotes',{purchaseRequestId:pr.id,supplierId:sid,price,selected});
 const quotes=((await (await a.request(`/api/v1/qldn-procurement/purchase-requests/${pr.id}/quotes`)).json()) as any).quotes; assert(quotes.length===3,'API quotes list 3 báo giá');
 sub=await post(a,`/api/v1/qldn-procurement/purchase-requests/${pr.id}/submit`); const subj=(await sub.json()) as any;
 assert(sub.status===200&&subj.purchaseRequest.status==='pending_approval'&&subj.purchaseRequest.approvalRoute==='dept_finance_ceo','PR 25tr submit → pending, route dept_finance_ceo');
 const steps=await db.select().from(wfSchema.wfSteps).where(eq(wfSchema.wfSteps.instanceId,subj.purchaseRequest.workflowInstanceId)); assert(steps.length===3,'threshold 25tr sinh 3 cấp duyệt (thêm GĐTC)');
 await approveAll(db,ORG,subj.purchaseRequest.workflowInstanceId);
 await eventHandlers['workflow.instance.approved']({orgId:ORG,payload:{instanceId:subj.purchaseRequest.workflowInstanceId}},{db});
 const pos=((await (await a.request('/api/v1/qldn-procurement/purchase-orders')).json()) as any).purchaseOrders; assert(pos.length===1&&pos[0].status==='approved'&&pos[0].supplierId===s3.id,'workflow approved → PO tạo từ quote selected (NCC3)');
 const po=pos[0];
 const sent=((await (await post(a,`/api/v1/qldn-procurement/purchase-orders/${po.id}/send`)).json()) as any).purchaseOrder; assert(sent.status==='sent','PO gửi NCC → sent');
 const poLines=((await (await a.request(`/api/v1/qldn-procurement/purchase-orders/${po.id}`)).json()) as any).lines; assert(poLines.length===1&&Number(poLines[0].qty)===2,'PO lines copy từ PR lines');
 const gr1=((await (await post(a,`/api/v1/qldn-procurement/purchase-orders/${po.id}/receipts`,{receiptNo:'GR-1',lines:[{purchaseOrderLineId:poLines[0].id,qtyReceived:1}]})).json()) as any).goodsReceipt;
 assert(gr1.poStatus==='partially_received','GR partial (1/2) → PO partially_received');
 const gr2=((await (await post(a,`/api/v1/qldn-procurement/purchase-orders/${po.id}/receipts`,{receiptNo:'GR-2',lines:[{purchaseOrderLineId:poLines[0].id,qtyReceived:1}]})).json()) as any).goodsReceipt;
 assert(gr2.poStatus==='closed','GR đủ hàng (2/2) → PO closed');
 const grBlock=await post(a,`/api/v1/qldn-procurement/purchase-orders/${po.id}/receipts`,{receiptNo:'GR-3',lines:[{qtyReceived:1}]}); assert(grBlock.status===409,'PO closed chặn nhận thêm hàng');
 // supplier evaluation poor → suspended → không nhận PO/mời thầu mới
 await post(a,`/api/v1/qldn-procurement/suppliers/${s1.id}/evaluations`,{period:'2026-Q3',criteria:{quality:3},score:3});
 const s1After=((await (await a.request(`/api/v1/qldn-procurement/suppliers/${s1.id}`)).json()) as any).supplier; assert(s1After.status==='suspended','đánh giá poor (score<5) → supplier suspended');
 // ── Bid award flow: gói thầu → workflow 4-5 cấp → invite → evaluate → award ──
 const bid=((await (await post(a,'/api/v1/qldn-procurement/bids',{title:'Gói thầu server 2026',estimatedValue:150000000})).json()) as any).bidProject;
 const inviteEarly=await post(a,`/api/v1/qldn-procurement/bids/${bid.id}/bidders`,{supplierId:s2.id,bidAmount:140000000}); assert(inviteEarly.status===409,'chưa duyệt gói thầu → không mời thầu được');
 const bsub=((await (await post(a,`/api/v1/qldn-procurement/bids/${bid.id}/submit`)).json()) as any).bidProject; assert(bsub.status==='pending_approval','gói thầu submit → workflow');
 const bidSteps=await db.select().from(wfSchema.wfSteps).where(eq(wfSchema.wfSteps.instanceId,bsub.workflowInstanceId)); assert(bidSteps.length===5,'đấu thầu 150tr → 5 cấp duyệt (KTT→GĐKD→GĐTC→P.TGĐ→TGĐ)');
 await approveAll(db,ORG,bsub.workflowInstanceId);
 await eventHandlers['workflow.instance.approved']({orgId:ORG,payload:{instanceId:bsub.workflowInstanceId}},{db});
 const suspInvite=await post(a,`/api/v1/qldn-procurement/bids/${bid.id}/bidders`,{supplierId:s1.id,bidAmount:130000000}); assert(suspInvite.status===409,'supplier suspended không được mời thầu (enforce)');
 const b2=((await (await post(a,`/api/v1/qldn-procurement/bids/${bid.id}/bidders`,{supplierId:s2.id,bidAmount:140000000})).json()) as any).bidder;
 const b3=((await (await post(a,`/api/v1/qldn-procurement/bids/${bid.id}/bidders`,{supplierId:s3.id,bidAmount:145000000})).json()) as any).bidder;
 await post(a,`/api/v1/qldn-procurement/bids/${bid.id}/evaluations`,{bidderId:b2.id,criteria:{price:9},score:9,decision:'recommend'});
 await post(a,`/api/v1/qldn-procurement/bids/${bid.id}/evaluations`,{bidderId:b3.id,criteria:{price:7},score:7});
 const award=(await (await post(a,`/api/v1/qldn-procurement/bids/${bid.id}/award`,{winnerBidderId:b2.id})).json()) as any;
 assert(award.bidProject.status==='awarded'&&award.purchaseOrder?.supplierId===s2.id,'award → bid awarded + PO nối NCC thắng');
 const bidders=((await (await a.request(`/api/v1/qldn-procurement/bids/${bid.id}`)).json()) as any).bidders;
 assert(bidders.find((x:any)=>x.id===b2.id).status==='won'&&bidders.find((x:any)=>x.id===b3.id).status==='rejected','1 winner won, others rejected');
 // supplier suspended không nhận PO mới qua send
 const [poSusp]=await db.insert(qpr.qprPurchaseOrders).values({orgId:ORG,purchaseRequestId:pr.id,supplierId:s1.id,poNo:'PO-SUSP',totalAmount:'1000',status:'approved',createdAt:new Date(),updatedAt:new Date()}).returning();
 const sendSusp=await post(a,`/api/v1/qldn-procurement/purchase-orders/${poSusp.id}/send`); assert(sendSusp.status===409,'supplier suspended không nhận PO mới (send bị chặn)');
 // service acceptance
 const prq=((await (await post(a,'/api/v1/qldn-procurement/procurement-requests',{type:'service',items:[{name:'Vệ sinh tòa nhà'}],estValue:8000000})).json()) as any).procurementRequest;
 const sa=await post(a,'/api/v1/qldn-procurement/service-acceptances',{procurementRequestId:prq.id,supplierId:s2.id,result:'issue'}); assert(sa.status===400,'nghiệm thu issue thiếu issueDesc bị chặn');
 const sa2=((await (await post(a,'/api/v1/qldn-procurement/service-acceptances',{procurementRequestId:prq.id,supplierId:s2.id,result:'ok'})).json()) as any).serviceAcceptance; assert(sa2.result==='ok','nghiệm thu dịch vụ ok ghi nhận + emit event');
 // ── Org isolation qua API ──
 const bIso=await app(db,ownerB).request(`/api/v1/qldn-procurement/purchase-requests/${pr.id}`); assert(bIso.status===404,'org isolation: org B không đọc được PR org A');
 const bIso2=await post(app(db,ownerB),`/api/v1/qldn-procurement/bids/${bid.id}/award`,{winnerBidderId:b2.id}); assert(bIso2.status===404,'org isolation: org B không award được bid org A');
 const bList=((await (await app(db,ownerB).request('/api/v1/qldn-procurement/suppliers')).json()) as any).suppliers; assert(bList.length===0,'org isolation: list suppliers org B rỗng');}
console.log('[qldn-procurement-routes] ALL PASSED');
