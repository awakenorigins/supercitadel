import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, and } from 'drizzle-orm';
import { wfDefinitions } from '../server/schema.js';
const here=dirname(fileURLToPath(import.meta.url));
export const DEMO_ORG_ID='00000000-0000-0000-0000-000000000001';
export function loadSeedDefinitions(){ return JSON.parse(readFileSync(join(here,'definitions.seed.json'),'utf8')); }
export async function applyWorkflowSeed(db:any, orgId=DEMO_ORG_ID){
 const defs=loadSeedDefinitions(); let inserted=0, updated=0;
 for(const d of defs){ const value={orgId,code:d.code,name:d.name,domain:d.domain,entityType:d.entityType,stepsConfig:d.stepsConfig,thresholdRules:d.thresholdRules,version:d.version??1,isActive:d.isActive??true};
  const [existing]=await db.select().from(wfDefinitions).where(and(eq(wfDefinitions.orgId,orgId),eq(wfDefinitions.code,d.code),eq(wfDefinitions.version,d.version??1))).limit(1);
  if(existing){ await db.update(wfDefinitions).set({...value,updatedAt:new Date()}).where(eq(wfDefinitions.id,existing.id)); updated++; }
  else { await db.insert(wfDefinitions).values(value); inserted++; }
 }
 return {count:defs.length, inserted, updated, orgId};
}
if(import.meta.url===`file://${process.argv[1]}`){ console.error('Import applyWorkflowSeed(db, orgId) from this module to seed an app DB.'); }
