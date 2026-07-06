import { Hono } from 'hono';
import { AppError } from '@citadel/core';
import { rateLimit, _resetRateLimit } from './middleware/rateLimit.js';
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
_resetRateLimit();
const app=new Hono();
app.onError((e,c)=> e instanceof AppError ? c.json(e.toJSON(),e.status as 429):c.json({error:{code:'INTERNAL'}},500));
app.post('/login', rateLimit({windowMs:60_000,max:3}), (c)=>c.json({ok:true}));
const H={'x-forwarded-for':'1.2.3.4'};
for(let i=1;i<=3;i++){const r=await app.request('/login',{method:'POST',headers:H});assert(r.status===200,`req ${i} 200`);}
const r4=await app.request('/login',{method:'POST',headers:H});
assert(r4.status===429,'req 4 → 429');
assert(((await r4.json()) as any).error.code==='RATE_LIMITED','code RATE_LIMITED');
assert((await app.request('/login',{method:'POST',headers:{'x-forwarded-for':'9.9.9.9'}})).status===200,'IP khác OK');
console.log('[api/rl] PASSED');
