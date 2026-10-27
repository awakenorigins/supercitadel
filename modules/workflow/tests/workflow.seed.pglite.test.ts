import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import * as schema from '../server/schema.js';
import { start } from '../server/service.js';
import { applyWorkflowSeed, DEMO_ORG_ID } from '../seed/apply-seed.js';
function assert(c: unknown, m: string) { if (!c) throw new Error(m); console.log('✓', m); }
const U='11111111-1111-1111-1111-111111111111', E='eeeeeeee-0000-0000-0000-000000000001';
const client=new PGlite(); await client.exec(readFileSync(new URL('../migrations/0001_workflow.sql', import.meta.url),'utf8')); const db=drizzle(client,{schema}) as any;
const r1=await applyWorkflowSeed(db, DEMO_ORG_ID); assert(r1.count===80 && r1.inserted===80, 'seed inserts 80 definitions');
const r2=await applyWorkflowSeed(db, DEMO_ORG_ID); const rows=await db.select().from(schema.wfDefinitions); assert(r2.updated===80 && rows.length===80, 'seed idempotent: second run does not duplicate');
const inst=await db.transaction((tx:any)=>start(tx,{orgId:DEMO_ORG_ID,definitionCode:'ketoan.qt-chi-tien-mat',entityType:'qfi_payment_requests',entityId:E,requestedBy:U,amount:25000000}));
const steps=await db.select().from(schema.wfSteps).where(and(eq(schema.wfSteps.orgId,DEMO_ORG_ID),eq(schema.wfSteps.instanceId,inst.id)));
assert(steps.length>=2, 'start() instance from seeded ketoan.qt-chi-tien-mat creates approval steps');
console.log('[workflow-seed] ALL PASSED');
