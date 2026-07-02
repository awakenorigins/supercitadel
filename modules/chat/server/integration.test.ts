// integration.test.ts — proves the full real-time chain: API send → ws → client receive.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { WebSocket } from 'ws';
import * as chat from './schema.js';
import { buildChatRoutes } from './routes.js';
import { startWsServer } from '../../../services/ws/src/index.js';
process.env.JWT_SECRET='integ_secret_long_enough_for_hs256_x';
const SEC=new TextEncoder().encode(process.env.JWT_SECRET);
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const ORG='aaaaaaaa-0000-0000-0000-000000000001',MINH='11111111-0000-0000-0000-000000000001',LAN='22222222-0000-0000-0000-000000000002';
const jwt=(sub:string)=>new SignJWT({orgId:ORG,role:'owner'}).setProtectedHeader({alg:'HS256'}).setSubject(sub).setIssuedAt().setExpirationTime('1h').sign(SEC);
const requireAuth=async(c:any,next:any)=>{const h=c.req.header('Authorization');if(!h?.startsWith('Bearer '))return c.json({error:{code:'UNAUTHORIZED',message:'x'}},401);const{payload}=await (await import('jose')).jwtVerify(h.slice(7),SEC);c.set('auth',{sub:String(payload.sub),orgId:String(payload.orgId),role:payload.role});await next();};

const PORT=3731;
const ws=startWsServer(PORT); await wait(200);
const client=new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_chat.sql',import.meta.url),'utf8'));
const db=drizzle(client,{schema:chat}) as any;
const realEmit=async(ev:any)=>{await fetch(`http://localhost:${PORT}/internal/publish`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ev)});};
const app=new Hono(); app.route('/api/v1/chat',buildChatRoutes({db,emit:realEmit,requireAuth}));
const Hminh={'Content-Type':'application/json',Authorization:`Bearer ${await jwt(MINH)}`};
const cr=await app.request('/api/v1/chat/rooms',{method:'POST',headers:Hminh,body:JSON.stringify({name:'Ca Tối',isGroup:true,memberIds:[LAN]})});
const {room}=await cr.json(); assert(room.id,'room created via API');
const lanWs=new WebSocket(`ws://localhost:${PORT}?token=${await jwt(LAN)}`);
await new Promise(r=>lanWs.once('message',r));
let received:any=null;
lanWs.on('message',(d)=>{const ev=JSON.parse(d.toString());if(ev.type==='chat:message')received=ev;});
await app.request(`/api/v1/chat/rooms/${room.id}/messages`,{method:'POST',headers:Hminh,body:JSON.stringify({body:'Tối nay đông khách nhé Lan'})});
await wait(400);
assert(received!==null,'Lan nhận message qua WS real-time');
assert(received.payload.message.body==='Tối nay đông khách nhé Lan','nội dung đúng qua đường truyền');
lanWs.close(); await wait(100); await ws.close();
console.log('[chat/integration] PASSED — API→WS→client chain works');
