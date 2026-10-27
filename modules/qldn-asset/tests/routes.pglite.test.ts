import { Hono } from 'hono';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import * as qas from '../server/schema.js';
import { buildQldnAssetRoutes } from '../server/routes.js';
const ORG='aaaaaaaa-0000-0000-0000-000000000001', ORGB='bbbbbbbb-0000-0000-0000-000000000002', U='11111111-1111-1111-1111-111111111111';
function assert(c:any,m:string){if(!c) throw new Error(m); console.log('✓',m)}
function app(db:any,auth:any){const a=new Hono(); a.onError((e:any,c)=>c.json({error:e.toJSON?.()??{message:e.message}},e.status??500)); a.route('/api/v1/qldn-asset',buildQldnAssetRoutes({db,requireAuth:async(c,n)=>{c.set('auth',auth); await n();},gate:async(_c,n)=>n()})); return a;}
async function post(a:Hono,path:string,b:any={}){return a.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});}
const c=new PGlite(); await c.exec(readFileSync(new URL('../migrations/0001_qldn_asset.sql',import.meta.url),'utf8')); (globalThis as any).__citadelOutboxEnabled=false; const db=drizzle(c,{schema:qas}) as any;
const owner={sub:U,orgId:ORG,role:'owner'}, staff={sub:U,orgId:ORG,role:'staff'}, ownerB={sub:U,orgId:ORGB,role:'owner'};
const a=app(db,owner), st=app(db,staff);
const denied=await post(st,'/api/v1/qldn-asset/assets',{assetCode:'X',name:'X'}); assert(denied.status===403,'staff without qldn-asset permission denied');
const asset=(await (await post(a,'/api/v1/qldn-asset/assets',{assetCode:'A-1',name:'Projector'})).json() as any).asset; assert(asset.status==='available','route creates asset');
const asg=(await (await post(a,`/api/v1/qldn-asset/assets/${asset.id}/assignments`,{assignmentNo:'ASG-R1',assignedToRef:U,idempotencyKey:'r1'})).json() as any).assignment; assert(asg.status==='active','route assigns asset');
const badAssign=await post(a,`/api/v1/qldn-asset/assets/${asset.id}/assignments`,{assignmentNo:'ASG-R2',assignedToRef:U}); assert(badAssign.status===409,'invalid route transition blocked');
const ret=(await (await post(a,`/api/v1/qldn-asset/assignments/${asg.id}/return`,{returnCondition:'good'})).json() as any).assignment; assert(ret.status==='returned','route returns asset');
const iso=await app(db,ownerB).request(`/api/v1/qldn-asset/assets/${asset.id}`); assert(iso.status===404,'org B route cannot read org A asset');
const vehicle=(await (await post(a,'/api/v1/qldn-asset/vehicles',{assetCode:'V-1',plateNo:'51A-00001',odometer:10})).json() as any).vehicle; assert(vehicle.plateNo==='51A-00001','route creates vehicle wrapper');
const usage=(await post(a,'/api/v1/qldn-asset/usage-logs',{assetId:vehicle.assetId,vehicleId:vehicle.id,odometerStart:10,odometerEnd:5})); assert(usage.status===400,'route blocks odometer rollback');
const mo=(await (await post(a,'/api/v1/qldn-asset/maintenance-orders',{assetId:asset.id,orderNo:'MO-R1',description:'Clean lens'})).json() as any).maintenanceOrder; assert(mo.status==='open','route opens maintenance');
const done=(await (await post(a,`/api/v1/qldn-asset/maintenance-orders/${mo.id}/complete`,{})).json() as any).maintenanceOrder; assert(done.status==='completed','route completes maintenance');
const ins=(await (await post(a,'/api/v1/qldn-asset/inspections',{assetId:asset.id,inspectionNo:'I-R1',result:'pass'})).json() as any).inspection; assert(ins.result==='pass','route records inspection');
const inc=(await (await post(a,'/api/v1/qldn-asset/incidents',{assetId:asset.id,incidentNo:'INC-R1',description:'Scratch'})).json() as any).incident; assert(inc.status==='open','route reports incident');
await c.close();
