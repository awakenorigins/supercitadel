import { loadApiEnv } from './env.js';
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
const ok=loadApiEnv({DATABASE_URL:'postgres://x',JWT_SECRET:'long_enough_secret_16+',LLM_MODE:'stub'} as any);
assert(ok.LLM_MODE==='stub','valid env parses');
let m1=false; try{loadApiEnv({JWT_SECRET:'long_enough_secret_16+'} as any);}catch{m1=true;} assert(m1,'missing DATABASE_URL throws');
let m2=false; try{loadApiEnv({DATABASE_URL:'x',JWT_SECRET:'short'} as any);}catch{m2=true;} assert(m2,'short JWT throws');
console.log('[core/env] PASSED');
