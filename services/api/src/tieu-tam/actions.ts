import { eq, and, ilike, desc } from 'drizzle-orm';
import { Errors, hasPermission, requiredSecurityLevel, type Permission, type Role } from '@citadel/core';
import { isModuleActive } from '../modules/routes.js';
import { createPayment, createInvoice, seedChart } from '@citadel/module-accounting/server/service.js';
import { createContact, createDeal, listContacts, listDeals, moveDealStage } from '@citadel/module-crm/server/service.js';
import { createItem, listItems, adjustQty } from '@citadel/module-inventory/server/service.js';
import { createShift } from '@citadel/module-hr/server/service.js';
import { createEmployee, listEmployees, checkIn, checkOut, attendanceByDate } from '@citadel/module-hr/server/service-v2.js';
import { getBalance } from '@citadel/module-om/server/service.js';
import { crmContacts, crmDeals } from '@citadel/module-crm/server/schema.js';
import { inventoryItems } from '@citadel/module-inventory/server/schema.js';
import { hrEmployees } from '@citadel/module-hr/server/schema.js';
import { keToan10aTieuTamActions, detectK10aAction } from '@citadel/module-ke-toan-10a/server/tieu-tam-actions.js';
import { soulManagerTieuTamActions } from '@citadel/module-soul-manager/server/tieu-tam-actions.js';

type DB = any;
export type TieuTamActionCtx = { db: DB; orgId: string; userId: string; role: Role; securityLevel: number; audit?: (e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void> };
export type ActionResult = { ok: boolean; action: string; module: string; message: string; data?: any; dryRun?: boolean; preview?: any; pendingAction?: any };
export type TieuTamAction = { name: string; description: string; requiredModule: string; permission: Permission; securityLevel: 1|2; sensitive: boolean; parameters: any; execute(ctx: TieuTamActionCtx, params: any): Promise<ActionResult> };
export type ExecuteOptions = { dryRun?: boolean; confirm?: boolean };
const today = () => new Date().toISOString().slice(0, 10);
const num = (v:any,d=0)=> Number.isFinite(Number(v)) ? Number(v) : d;

async function gate(ctx: TieuTamActionCtx, moduleId: string) {
  if (!(await isModuleActive(ctx.db, ctx.orgId, moduleId))) throw Errors.forbidden(`Module "${moduleId}" chưa kích hoạt — vào Cửa hàng Module để bật`);
}
async function audit(ctx: TieuTamActionCtx, action: string, params: any, resourceId?: string, kind = 'tieu_tam.action') {
  await ctx.audit?.({ action: kind, resource: 'tieu_tam', resourceId, detail: { action, params } });
}
function result(action:string,module:string,message:string,data?:any): ActionResult { return { ok:true, action, module, message, data }; }
function deny(a:TieuTamAction, message:string): ActionResult { return { ok:false, action:a.name, module:a.requiredModule, message }; }
function dry(a:TieuTamAction, params:any): ActionResult { return { ok:true, dryRun:true, action:a.name, module:a.requiredModule, message:`Xem trước hành động: ${a.description}. Nếu xác nhận, em sẽ thực hiện thật.`, preview:{ description:a.description, params, sensitive:a.sensitive, warning:a.sensitive?'Hành động nhạy cảm — cần xác nhận trước khi chạy thật.':undefined }, pendingAction:{ name:a.name, params } }; }
async function employeeByName(db:DB, orgId:string, name:string) {
  const [e] = await db.select().from(hrEmployees).where(and(eq(hrEmployees.orgId, orgId), ilike(hrEmployees.fullName, `%${name}%`))).limit(1);
  return e ?? await createEmployee(db, orgId, { fullName: name });
}

const defs: TieuTamAction[] = [
  { name:'acc.create_receipt', permission:'accounting.receipt.create', securityLevel:2, sensitive:true, description:'Tạo phiếu thu tiền từ khách/đối tác', requiredModule:'accounting', parameters:{type:'object',properties:{partyName:{type:'string'},amount:{type:'number'},note:{type:'string'}},required:['partyName','amount']}, async execute(ctx,p){ await gate(ctx,'accounting'); await seedChart(ctx.db,ctx.orgId); const row=await createPayment(ctx.db,ctx.orgId,{paymentType:'receive',partyName:String(p.partyName),amount:num(p.amount),postingDate:today(),remarks:p.note}); await audit(ctx,this.name,p,row.id); return result(this.name,'accounting',`Đã tạo phiếu thu ${Number(row.amount).toLocaleString('vi-VN')}đ cho ${row.partyName}`,row); } },
  { name:'acc.create_payment', permission:'accounting.payment.create', securityLevel:2, sensitive:true, description:'Tạo phiếu chi tiền cho nhà cung cấp/đối tác', requiredModule:'accounting', parameters:{type:'object',properties:{partyName:{type:'string'},amount:{type:'number'},note:{type:'string'}},required:['partyName','amount']}, async execute(ctx,p){ await gate(ctx,'accounting'); await seedChart(ctx.db,ctx.orgId); const row=await createPayment(ctx.db,ctx.orgId,{paymentType:'pay',partyName:String(p.partyName),amount:num(p.amount),postingDate:today(),remarks:p.note}); await audit(ctx,this.name,p,row.id); return result(this.name,'accounting',`Đã tạo phiếu chi ${Number(row.amount).toLocaleString('vi-VN')}đ cho ${row.partyName}`,row); } },
  { name:'acc.create_invoice', permission:'accounting.invoice.create', securityLevel:2, sensitive:true, description:'Tạo hóa đơn bán/mua', requiredModule:'accounting', parameters:{type:'object',properties:{invoiceType:{type:'string',enum:['sales','purchase']},partyName:{type:'string'},qty:{type:'number'},rate:{type:'number'},description:{type:'string'}},required:['partyName','qty','rate']}, async execute(ctx,p){ await gate(ctx,'accounting'); await seedChart(ctx.db,ctx.orgId); const row=await createInvoice(ctx.db,ctx.orgId,{invoiceType:p.invoiceType==='purchase'?'purchase':'sales',partyName:String(p.partyName),postingDate:today(),lines:[{description:p.description||'Hàng hóa/dịch vụ',qty:num(p.qty,1),rate:num(p.rate)}]}); await audit(ctx,this.name,p,row.id); return result(this.name,'accounting',`Đã tạo hóa đơn ${row.invoiceType} ${Number(row.grandTotal).toLocaleString('vi-VN')}đ cho ${row.partyName}`,row); } },
  { name:'crm.add_contact', permission:'crm.contact.create', securityLevel:1, sensitive:false, description:'Thêm khách hàng/liên hệ CRM', requiredModule:'crm', parameters:{type:'object',properties:{name:{type:'string'},phone:{type:'string'}},required:['name']}, async execute(ctx,p){ await gate(ctx,'crm'); const row=await createContact(ctx.db,ctx.orgId,{name:String(p.name),phone:p.phone}); await audit(ctx,this.name,p,row.id); return result(this.name,'crm',`Đã thêm khách hàng ${row.name}${row.phone?' · '+row.phone:''}`,row); } },
  { name:'crm.add_deal', permission:'crm.deal.create', securityLevel:1, sensitive:false, description:'Thêm deal CRM', requiredModule:'crm', parameters:{type:'object',properties:{title:{type:'string'},value:{type:'number'},contactName:{type:'string'}},required:['title']}, async execute(ctx,p){ await gate(ctx,'crm'); let contactId; if(p.contactName){ const [c]=await ctx.db.select().from(crmContacts).where(and(eq(crmContacts.orgId,ctx.orgId),ilike(crmContacts.name,`%${p.contactName}%`))).limit(1); contactId=c?.id; } const row=await createDeal(ctx.db,ctx.orgId,{title:String(p.title),valueVnd:num(p.value),contactId,ownerId:ctx.userId}); await audit(ctx,this.name,p,row.id); return result(this.name,'crm',`Đã thêm deal ${row.title}`,row); } },
  { name:'crm.move_deal', permission:'crm.deal.move', securityLevel:1, sensitive:false, description:'Chuyển giai đoạn deal CRM', requiredModule:'crm', parameters:{type:'object',properties:{dealTitle:{type:'string'},stage:{type:'string'}},required:['dealTitle','stage']}, async execute(ctx,p){ await gate(ctx,'crm'); const [d]=await ctx.db.select().from(crmDeals).where(and(eq(crmDeals.orgId,ctx.orgId),ilike(crmDeals.title,`%${p.dealTitle}%`))).limit(1); if(!d) throw Errors.notFound('Không tìm thấy deal'); const row=await moveDealStage(ctx.db,ctx.orgId,d.id,String(p.stage)); await audit(ctx,this.name,p,row.id); return result(this.name,'crm',`Đã chuyển deal ${row.title} sang ${row.stage}`,row); } },
  { name:'inv.add_item', permission:'inventory.item.create', securityLevel:1, sensitive:false, description:'Thêm mặt hàng/tồn kho', requiredModule:'inventory', parameters:{type:'object',properties:{name:{type:'string'},qty:{type:'number'},unit:{type:'string'},threshold:{type:'number'}},required:['name']}, async execute(ctx,p){ await gate(ctx,'inventory'); const row=await createItem(ctx.db,ctx.orgId,{name:String(p.name),qty:num(p.qty),unit:p.unit,lowThreshold:num(p.threshold,5)}); await audit(ctx,this.name,p,row.id); return result(this.name,'inventory',`Đã thêm ${row.qty} ${row.unit} ${row.name} vào kho`,row); } },
  { name:'inv.adjust_qty', permission:'inventory.qty.adjust', securityLevel:2, sensitive:true, description:'Điều chỉnh số lượng tồn kho', requiredModule:'inventory', parameters:{type:'object',properties:{itemName:{type:'string'},delta:{type:'number'}},required:['itemName','delta']}, async execute(ctx,p){ await gate(ctx,'inventory'); const [it]=await ctx.db.select().from(inventoryItems).where(and(eq(inventoryItems.orgId,ctx.orgId),ilike(inventoryItems.name,`%${p.itemName}%`))).limit(1); if(!it) throw Errors.notFound('Không tìm thấy mặt hàng'); const row=await adjustQty(ctx.db,ctx.orgId,it.id,num(p.delta)); await audit(ctx,this.name,p,row.id); return result(this.name,'inventory',`Đã điều chỉnh ${row.name}: ${row.qty} ${row.unit}`,row); } },
  { name:'hr.add_employee', permission:'hr.employee.create', securityLevel:1, sensitive:false, description:'Thêm nhân viên mới vào tổ chức (tên + vị trí/phòng ban + sđt nếu có)', requiredModule:'hr', parameters:{type:'object',properties:{fullName:{type:'string',description:'Tên đầy đủ nhân viên'},roleTitle:{type:'string',description:'Vị trí / phòng ban, vd Phòng Không, Thu ngân'},phone:{type:'string'}},required:['fullName']}, async execute(ctx,p){ await gate(ctx,'hr'); const row=await createEmployee(ctx.db,ctx.orgId,{fullName:String(p.fullName),roleTitle:p.roleTitle?String(p.roleTitle):undefined,phone:p.phone?String(p.phone):undefined,joinedDate:today()}); await audit(ctx,this.name,p,row.id); return result(this.name,'hr',`Đã thêm nhân viên ${row.fullName} · ${row.roleTitle}`,row); } },
  { name:'hr.check_in', permission:'hr.attendance.checkin', securityLevel:1, sensitive:false, description:'Check-in chấm công cho nhân viên', requiredModule:'hr', parameters:{type:'object',properties:{employeeName:{type:'string'}},required:['employeeName']}, async execute(ctx,p){ await gate(ctx,'hr'); const e=await employeeByName(ctx.db,ctx.orgId,String(p.employeeName)); const row=await checkIn(ctx.db,ctx.orgId,{employeeId:e.id}); await audit(ctx,this.name,p,row.id); return result(this.name,'hr',`Đã check-in cho ${e.fullName}`,row); } },
  { name:'hr.check_out', permission:'hr.attendance.checkout', securityLevel:1, sensitive:false, description:'Check-out chấm công cho nhân viên', requiredModule:'hr', parameters:{type:'object',properties:{employeeName:{type:'string'}},required:['employeeName']}, async execute(ctx,p){ await gate(ctx,'hr'); const e=await employeeByName(ctx.db,ctx.orgId,String(p.employeeName)); const row=await checkOut(ctx.db,ctx.orgId,{employeeId:e.id}); await audit(ctx,this.name,p,row.id); return result(this.name,'hr',`Đã check-out cho ${e.fullName}`,row); } },
  { name:'hr.create_shift', permission:'hr.shift.create', securityLevel:1, sensitive:false, description:'Tạo ca làm việc', requiredModule:'hr', parameters:{type:'object',properties:{name:{type:'string'},date:{type:'string'},start:{type:'string'},end:{type:'string'}},required:['name','date','start','end']}, async execute(ctx,p){ await gate(ctx,'hr'); const row=await createShift(ctx.db,ctx.orgId,{name:String(p.name),shiftDate:String(p.date),startTime:String(p.start),endTime:String(p.end)}); await audit(ctx,this.name,p,row.id); return result(this.name,'hr',`Đã tạo ca ${row.name} ngày ${row.shiftDate}`,row); } },
  { name:'om.balance', permission:'om.wallet.read', securityLevel:1, sensitive:false, description:'Xem số dư ví Om', requiredModule:'om', parameters:{type:'object',properties:{}}, async execute(ctx,p){ const balance=await getBalance(ctx.db,ctx.orgId); await audit(ctx,this.name,p); return result(this.name,'om',`Số dư ví Om hiện tại là ${balance.toLocaleString('vi-VN')} Om`,{balance}); } },
  { name:'report.summary', permission:'report.summary.read', securityLevel:1, sensitive:false, description:'Tóm tắt nhanh dữ liệu dashboard', requiredModule:'core', parameters:{type:'object',properties:{}}, async execute(ctx,p){ const [contacts,items,emps,balance]=await Promise.all([listContacts(ctx.db,ctx.orgId).catch(()=>[]),listItems(ctx.db,ctx.orgId).catch(()=>[]),listEmployees(ctx.db,ctx.orgId).catch(()=>[]),getBalance(ctx.db,ctx.orgId).catch(()=>0)]); await audit(ctx,this.name,p); return result(this.name,'report',`Tóm tắt: ${contacts.length} khách, ${items.length} mặt hàng, ${emps.length} nhân viên, ${balance} Om`,{contacts:contacts.length,items:items.length,employees:emps.length,balance}); } },
];
defs.push(...(keToan10aTieuTamActions as unknown as (db: DB) => TieuTamAction[])(undefined as unknown as DB));
defs.push(...(soulManagerTieuTamActions() as unknown as TieuTamAction[]));
export const ACTION_REGISTRY = new Map(defs.map(d=>[d.name,d]));
export function toolSafeName(name:string){ return name.replace(/[^a-zA-Z0-9_-]/g, '_'); }
const SAFE_TO_ACTION = new Map(defs.map(d=>[toolSafeName(d.name), d.name]));
export const ACTION_TOOLS = defs.map(a=>({ type:'function', function:{ name:toolSafeName(a.name), description:a.description, parameters:a.parameters } }));
export async function executeAction(ctx:TieuTamActionCtx, name:string, params:any, opts:ExecuteOptions = {}){
  const realName = SAFE_TO_ACTION.get(name) ?? name; const a=ACTION_REGISTRY.get(realName); if(!a) throw Errors.validation(`Action không hợp lệ: ${name}`);
  await gate(ctx, a.requiredModule);
  if(!hasPermission(ctx.role, a.permission)) return deny(a, `Bạn chưa có quyền ${a.permission} để thực hiện hành động này.`);
  const need = Math.max(a.securityLevel, requiredSecurityLevel(a.permission));
  if(ctx.securityLevel < need) return deny(a, `Hành động này cần bảo mật lớp ${need}. Vào Cài đặt → Bảo mật để gắn email hoặc số điện thoại.`);
  if(opts.dryRun || (a.sensitive && !opts.confirm)) { const r=dry(a, params ?? {}); await audit(ctx,a.name,params,undefined,'tieu_tam.action_dryrun'); return r; }
  return a.execute(ctx, params ?? {});
}
export function detectAction(message:string): {name:string; params:any} | null {
  const k10a = detectK10aAction(message); if (k10a) return k10a;
  const m=message.trim(); let x;
  if((x=/tạo\s+phiếu\s+thu\s+([\d.,]+)\s+(?:cho|từ)\s+(.+)/i.exec(m))) return {name:'acc.create_receipt',params:{amount:x[1].replace(/\D/g,''),partyName:x[2].trim()}};
  if((x=/tạo\s+phiếu\s+chi\s+([\d.,]+)\s+(?:cho|tới|đến)\s+(.+)/i.exec(m))) return {name:'acc.create_payment',params:{amount:x[1].replace(/\D/g,''),partyName:x[2].trim()}};
  if((x=/thêm\s+khách(?:\s+hàng)?\s+(.+?)(?:\s+số\s+điện\s+thoại|\s+sđt|\s+phone)\s+([0-9+]+)/i.exec(m))) return {name:'crm.add_contact',params:{name:x[1].trim(),phone:x[2].trim()}};
  if((x=/thêm\s+khách(?:\s+hàng)?\s+(.+)/i.exec(m))) return {name:'crm.add_contact',params:{name:x[1].trim()}};
  if((x=/thêm\s+([\d.,]+)\s*([^\s]+)?\s+(.+?)\s+(?:vào\s+)?kho/i.exec(m))) return {name:'inv.add_item',params:{qty:x[1].replace(/,/g,'.'),unit:x[2]||'cái',name:x[3].trim()}};
  if((x=/(?:thêm|add)\s+nhân\s+viên(?:\s+mới)?(?:\s+tên)?\s+(.+?)\s+(?:vào\s+)?(?:vị\s+trí|phòng|chức\s+vụ|làm)\s+(.+)/i.exec(m))) return {name:'hr.add_employee',params:{fullName:x[1].trim(),roleTitle:x[2].trim()}};
  if((x=/(?:thêm|add)\s+nhân\s+viên(?:\s+mới)?(?:\s+tên)?\s+(.+)/i.exec(m))) return {name:'hr.add_employee',params:{fullName:x[1].trim()}};
  if((x=/(?:cho\s+)?(.+?)\s+check-?in/i.exec(m))) return {name:'hr.check_in',params:{employeeName:x[1].trim()}};
  if((x=/(?:cho\s+)?(.+?)\s+check-?out/i.exec(m))) return {name:'hr.check_out',params:{employeeName:x[1].trim()}};
  if(/số\s+dư.*om|om.*số\s+dư/i.test(m)) return {name:'om.balance',params:{}};
  return null;
}
