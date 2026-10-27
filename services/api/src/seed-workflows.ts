import { getDb, orgs } from '@citadel/db';
import { applyWorkflowSeed } from '@citadel/module-workflow/seed/apply-seed.js';

const db:any=getDb();
const all=await db.select({id:orgs.id}).from(orgs);
let total=0;
for(const org of all){const r=await applyWorkflowSeed(db,org.id);total+=r.count;console.log(`[workflow-seed] ${org.id}: ${r.count} definitions (${r.inserted} inserted, ${r.updated} updated)`);}
console.log(`[workflow-seed] done: ${all.length} org(s), ${total} definitions`);
process.exit(0);
