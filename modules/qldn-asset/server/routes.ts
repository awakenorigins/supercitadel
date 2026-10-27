import { Hono, type Context, type MiddlewareHandler, type Next } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { Errors, hasPermission, type JwtPayload, type Permission, type Role } from '@citadel/core';
import * as s from './schema.js';
import * as svc from './service.js';
declare module 'hono' { interface ContextVariableMap { auth: JwtPayload } }
type AuditFn=(c:Context,e:{action:string;resource?:string;resourceId?:string;detail?:unknown})=>Promise<void>;
const org=(c:Context)=>(c.get('auth') as JwtPayload).orgId; const actor=(c:Context)=>(c.get('auth') as JwtPayload).sub;
function permit(p:Permission){return async(c:Context,next:Next)=>{const a=c.get('auth') as JwtPayload;if(!hasPermission(a.role as Role,p))throw Errors.forbidden(`Bạn không có quyền ${p} (PERMISSION_DENIED)`);await next();};}
async function body(c:Context){return c.req.json().catch(()=>({}));}
async function one(db:any,t:any,orgId:string,id:string){const [r]=await db.select().from(t).where(and(eq(t.orgId,orgId),eq(t.id,id))).limit(1); if(!r) throw Errors.notFound('Không tìm thấy dữ liệu'); return r;}
export function buildQldnAssetRoutes(deps:{db:any;requireAuth:MiddlewareHandler;gate?:MiddlewareHandler;audit?:AuditFn}){const r=new Hono(); r.use('*',deps.requireAuth); if(deps.gate) r.use('*',deps.gate); const db=deps.db;
 r.get('/assets',permit('qldn-asset.asset.read'),async c=>c.json({assets:await db.select().from(s.qasAssets).where(eq(s.qasAssets.orgId,org(c))).orderBy(desc(s.qasAssets.createdAt))}));
 r.post('/assets',permit('qldn-asset.asset.write'),async c=>{const row=await svc.createAsset(db,org(c),await body(c)); await deps.audit?.(c,{action:'qldn-asset.asset.create',resource:'asset',resourceId:row.id}); return c.json({asset:row},201);});
 r.get('/assets/:id',permit('qldn-asset.asset.read'),async c=>{const orgId=org(c), id=String(String(c.req.param('id'))); const asset=await one(db,s.qasAssets,orgId,id); const assignments=await db.select().from(s.qasAssetAssignments).where(and(eq(s.qasAssetAssignments.orgId,orgId),eq(s.qasAssetAssignments.assetId,id))).orderBy(desc(s.qasAssetAssignments.createdAt)); const transfers=await db.select().from(s.qasAssetTransfers).where(and(eq(s.qasAssetTransfers.orgId,orgId),eq(s.qasAssetTransfers.assetId,id))).orderBy(desc(s.qasAssetTransfers.createdAt)); return c.json({asset,assignments,transfers});});
 r.patch('/assets/:id',permit('qldn-asset.asset.write'),async c=>c.json({asset:await svc.updateAsset(db,org(c),String(c.req.param('id')),await body(c))}));
 r.post('/assets/:id/assignments',permit('qldn-asset.assignment.write'),async c=>{const row=await svc.assignAsset(db,org(c),String(c.req.param('id')),{...(await body(c)),assignedBy:actor(c)}); return c.json({assignment:row},201);});
 r.post('/assignments/:id/return',permit('qldn-asset.assignment.write'),async c=>c.json({assignment:await svc.returnAsset(db,org(c),String(c.req.param('id')),{...(await body(c)),returnedBy:actor(c)})}));
 r.post('/assets/:id/transfers',permit('qldn-asset.assignment.write'),async c=>c.json({transfer:await svc.transferAsset(db,org(c),String(c.req.param('id')),{...(await body(c)),requestedBy:actor(c)})},201));
 r.get('/vehicles',permit('qldn-asset.vehicle.read'),async c=>c.json({vehicles:await db.select().from(s.qasVehicles).where(eq(s.qasVehicles.orgId,org(c))).orderBy(desc(s.qasVehicles.createdAt))}));
 r.post('/vehicles',permit('qldn-asset.vehicle.write'),async c=>c.json({vehicle:await svc.createVehicle(db,org(c),await body(c))},201));
 r.post('/usage-logs',permit('qldn-asset.usage.write'),async c=>c.json({usageLog:await svc.logUsage(db,org(c),{...(await body(c)),usedByRef:(await body(c)).usedByRef??actor(c)})},201));
 r.get('/maintenance-orders',permit('qldn-asset.maintenance.read'),async c=>c.json({maintenanceOrders:await db.select().from(s.qasMaintenanceOrders).where(eq(s.qasMaintenanceOrders.orgId,org(c))).orderBy(desc(s.qasMaintenanceOrders.createdAt))}));
 r.post('/maintenance-orders',permit('qldn-asset.maintenance.write'),async c=>c.json({maintenanceOrder:await svc.openMaintenance(db,org(c),{...(await body(c)),reportedBy:actor(c)})},201));
 r.post('/maintenance-orders/:id/complete',permit('qldn-asset.maintenance.write'),async c=>c.json({maintenanceOrder:await svc.completeMaintenance(db,org(c),String(c.req.param('id')),await body(c))}));
 r.get('/inspections',permit('qldn-asset.inspection.read'),async c=>c.json({inspections:await db.select().from(s.qasInspections).where(eq(s.qasInspections.orgId,org(c))).orderBy(desc(s.qasInspections.createdAt))}));
 r.post('/inspections',permit('qldn-asset.inspection.write'),async c=>c.json({inspection:await svc.recordInspection(db,org(c),{...(await body(c)),inspectedBy:actor(c)})},201));
 r.post('/incidents',permit('qldn-asset.incident.write'),async c=>c.json({incident:await svc.reportIncident(db,org(c),{...(await body(c)),reportedBy:actor(c)})},201));
 return r;}
