export type OutboxRecord = {
  id: string; orgId: string; topic: string; payload: unknown; attempts: number;
  status?: 'pending'|'processing'|'dispatched'|'failed'; dispatchedAt?: Date|null;
  lastError?: string|null; nextAttemptAt?: Date|null; failedAt?: Date|null;
};
export type OutboxStore = {
  claim(limit: number, now: Date): Promise<OutboxRecord[]>;
  dispatched(id: string, at: Date): Promise<void>;
  retry(id: string, attempts: number, error: string, nextAttemptAt: Date): Promise<void>;
  failed(id: string, attempts: number, error: string, at: Date): Promise<void>;
};
export type OutboxHandler = (event: OutboxRecord) => Promise<void>;
export const OUTBOX_MAX_ATTEMPTS = 5;
const errorText=(e:unknown)=>String(e instanceof Error?e.message:e).slice(0,2000);
export async function dispatchOutboxBatch(store:OutboxStore,handlers:ReadonlyMap<string,OutboxHandler>,options:{limit?:number;now?:Date;maxAttempts?:number}={}){
  const now=options.now??new Date(), max=options.maxAttempts??OUTBOX_MAX_ATTEMPTS;
  const rows=await store.claim(options.limit??50,now); let dispatched=0,retried=0,failed=0;
  for(const row of rows){
    try{const handler=handlers.get(row.topic);if(!handler)throw new Error(`OUTBOX_HANDLER_MISSING: ${row.topic}`);await handler(row);await store.dispatched(row.id,now);dispatched++;}
    catch(e){const attempts=(row.attempts??0)+1, message=errorText(e);if(attempts>=max){await store.failed(row.id,attempts,message,now);failed++;}else{const delay=Math.min(60_000,1000*2**(attempts-1));await store.retry(row.id,attempts,message,new Date(now.getTime()+delay));retried++;}}
  }
  return{claimed:rows.length,dispatched,retried,failed};
}
export function canViewOutboxFailure(event:Pick<OutboxRecord,'orgId'|'payload'>,actor:{orgId:string;sub:string;role?:string}){
  if(actor.orgId!==event.orgId)return false;
  if(['owner','admin'].includes(actor.role??''))return true;
  const p=(event.payload??{}) as Record<string,unknown>;
  return p.ownerId===actor.sub||p.requestedBy===actor.sub||p.createdBy===actor.sub;
}
