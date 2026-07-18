import assert from'node:assert/strict';import{dispatchOutboxBatch,canViewOutboxFailure,type OutboxRecord}from'./outbox-dispatcher.js';
let event:OutboxRecord={id:'e1',orgId:'A',topic:'x.fail',payload:{ownerId:'u1'},attempts:0,status:'pending'};let sideEffects=0;
const store={async claim(){return event.status==='failed'||event.status==='dispatched'?[]:[{...event}]},async dispatched(){event={...event,status:'dispatched'}},async retry(_id:string,a:number,e:string,n:Date){event={...event,attempts:a,lastError:e,nextAttemptAt:n,status:'pending'}},async failed(_id:string,a:number,e:string,at:Date){event={...event,attempts:a,lastError:e,failedAt:at,status:'failed'}}};
const handlers=new Map([['x.fail',async()=>{throw new Error('boom')}]]);
for(let i=0;i<5;i++)await dispatchOutboxBatch(store,handlers,{now:new Date(1000+i)});
assert.equal(event.status,'failed');assert.equal(event.attempts,5);assert.equal(sideEffects,0);assert.equal((await dispatchOutboxBatch(store,handlers)).claimed,0);
assert.equal(canViewOutboxFailure(event,{orgId:'A',sub:'u1',role:'staff'}),true);assert.equal(canViewOutboxFailure(event,{orgId:'A',sub:'u2',role:'staff'}),false);assert.equal(canViewOutboxFailure(event,{orgId:'A',sub:'u2',role:'owner'}),true);assert.equal(canViewOutboxFailure(event,{orgId:'B',sub:'u1',role:'owner'}),false);
console.log('[core/outbox-dispatcher] 5 retries → failed, ACL and no duplicate side effect PASSED');
