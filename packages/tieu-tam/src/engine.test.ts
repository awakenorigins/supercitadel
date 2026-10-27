import { detectIntent } from './intent.js';
import { StubProvider, getProvider, ToolRegistry } from './index.js';
import { Role } from '@citadel/core';
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
assert(detectIntent('doanh thu hôm nay')==='revenue','intent revenue');
assert(detectIntent('deal CRM')==='deals','intent deals');
const p=new StubProvider();
const r=await p.reply('doanh thu',{orgName:'X',userName:'Minh'});
assert(r.mode==='stub','stub reply');
assert(r.toolCalls?.[0]?.module==='pos','revenue gen-UI');
delete process.env.LLM_MODE; assert(getProvider().mode==='stub','factory default stub');
const reg=new ToolRegistry();
reg.register({name:'t.x',module:'t',description:'d',requiresRole:Role.MANAGER,handler:async()=>({ok:true})});
let denied=false; try{await reg.invoke('t.x',{},{orgId:'o',userId:'u',role:Role.STAFF,permissions:new Set()});}catch{denied=true;}
assert(denied,'RBAC denies staff');
console.log('[tieu-tam] PASSED');
