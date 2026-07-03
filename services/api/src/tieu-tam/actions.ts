import { eq, and, ilike, desc } from 'drizzle-orm';
import { Errors } from '@citadel/core';
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

type DB = any;
export type TieuTamActionCtx = { db: DB; orgId: string; userId: string; audit?: (e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void> };
export type ActionResult = { ok: boolean; action: string; module: string; message: string; data?: any };
export type TieuTamAction = { name: string; description: string; requiredModule: string; parameters: any; execute(ctx: TieuTamActionCtx, params: any): Promise<ActionResult> };
const today = () => new Date().toISOString().slice(0, 10);
const num = (v:any,d=0)=> Number.isFinite(Number(v)) ? Number(v) : d;

async function gate(ctx: TieuTamActionCtx, moduleId: string) {
  if (!(await isModuleActive(ctx.db, ctx.orgId, moduleId))) throw Errors.forbidden(`Module "${moduleId}" chưa kích hoạt — vào Cửa hàng Module để bật`);
}
async function audit(ctx: TieuTamActionCtx, action: string, params: any, resourceId?: string) {
  await ctx.audit?.({ action: 'tieu_tam.action', resource: 'tieu_tam', resourceId, detail: { action, params } });
}
function result(action:string,module:string,message:string,data?:any): ActionResult { return { ok:true, action, module, message, data }; }
async function employeeByName(db:DB, orgId:string, name:string) {
  const [e] = await db.select().from(hrEmployees).where(and(eq(hrEmployees.orgId, orgId), ilike(hrEmployees.fullName, `%${name}%`))).limit(1);
  return e ?? await createEmployee(db, orgId, { fullName: name });
}

const defs: TieuTamAction[] = [
  { name:'acc.create_receipt', description:'Tạo phiếu thu tiền từ khách/đối tác', requiredModule:'accounting', parameters:{type:'object',properties:{partyName:{type:'string'},amount:{type:'number'},note:{type:'string'}},required:['partyName','amount']}, async execute(ctx,p){ await gate(ctx,'accounting'); await seedChart(ctx.db,ctx.orgId); const row=await createPayment(ctx.db,ctx.orgId,{paymentType:'receive',partyName:String(p.partyName),amount:num(p.amount),postingDate:today(),remarks:p.note}); await audit(ctx,this.name,p,row.id); return result(this.name,'accounting',`Đã tạo phiếu thu ${Number(row.amount).toLocaleString('vi-VN')}đ cho ${row.partyName}`,row); } },
  { name:'acc.create_payment', description:'Tạo phiếu chi tiền cho nhà cung cấp/đối tác', requiredModule:'accounting', parameters:{type:'object',properties:{partyName:{type:'string'},amount:{type:'number'},note:{type:'string'}},required:['partyName','amount']}, async execute(ctx,p){ await gate(ctx,'accounting'); await seedChart(ctx.db,ctx.orgId); const row=await createPayment(ctx.db,ctx.orgId,{paymentType:'pay',partyName:String(p.partyName),amount:num(p.amount),postingDate:today(),remarks:p.note}); await audit(ctx,this.name,p,row.id); return result(this.name,'accounting',`Đã tạo phiếu chi ${Number(row.amount).toLocaleString('vi-VN')}đ cho ${row.partyName}`,row); } },
  { name:'acc.create_invoice', description:'Tạo hóa đơn bán/mua', requiredModule:'accounting', parameters:{type:'object',properties:{invoiceType:{type:'string',enum:['sales','purchase']},partyName:{type:'string'},qty:{type:'number'},rate:{type:'number'},description:{type:'string'}},required:['partyName','qty','rate']}, async execute(ctx,p){ await gate(ctx,'accounting'); await seedChart(ctx.db,ctx.orgId); const row=await createInvoice(ctx.db,ctx.orgId,{invoiceType:p.invoiceType==='purchase'?'purchase':'sales',partyName:String(p.partyName),postingDate:today(),lines:[{description:p.description||'Hàng hóa/dịch vụ',qty:num(p.qty,1),rate:num(p.rate)}]}); await audit(ctx,this.name,p,row.id); return result(this.name,'accounting',`Đã tạo hóa đơn ${row.invoiceType} ${Number(row.grandTotal).toLocaleString('vi-VN')}đ cho ${row.partyName}`,row); } },
  { name:'crm.add_contact', description:'Thêm khách hàng/liên hệ CRM', requiredModule:'crm', parameters:{type:'object',properties:{name:{type:'string'},phone:{type:'string'}},required:['name']}, async execute(ctx,p){ await gate(ctx,'crm'); const row=await createContact(ctx.db,ctx.orgId,{name:String(p.name),phone:p.phone}); await audit(ctx,this.name,p,row.id); return result(this.name,'crm',`Đã thêm khách hàng ${row.name}${row.phone?' · '+row.phone:''}`,row); } },
  { name:'crm.add_deal', description:'Thêm deal CRM', requiredModule:'crm', parameters:{type:'object',properties:{title:{type:'string'},value:{type:'number'},contactName:{type:'string'}},required:['title']}, async execute(ctx,p){ await gate(ctx,'crm'); let contactId; if(p.contactName){ const [c]=await ctx.db.select().from(crmContacts).where(and(eq(crmContacts.orgId,ctx.orgId),ilike(crmContacts.name,`%${p.contactName}%`))).limit(1); contactId=c?.id; } const row=await createDeal(ctx.db,ctx.orgId,{title:String(p.title),valueVnd:num(p.value),contactId,ownerId:ctx.userId}); await audit(ctx,this.name,p,row.id); return result(this.name,'crm',`Đã thêm deal ${row.title}`,row); } },
  { name:'crm.move_deal', description:'Chuyển giai đoạn deal CRM', requiredModule:'crm', parameters:{type:'object',properties:{dealTitle:{type:'string'},stage:{type:'string'}},required:['dealTitle','stage']}, async execute(ctx,p){ await gate(ctx,'crm'); const [d]=await ctx.db.select().from(crmDeals).where(and(eq(crmDeals.orgId,ctx.orgId),ilike(crmDeals.title,`%${p.dealTitle}%`))).limit(1); if(!d) throw Errors.notFound('Không tìm thấy deal'); const row=await moveDealStage(ctx.db,ctx.orgId,d.id,String(p.stage)); await audit(ctx,this.name,p,row.id); return result(this.name,'crm',`Đã chuyển deal ${row.title} sang ${row.stage}`,row); } },
  { name:'inv.add_item', description:'Thêm mặt hàng/tồn kho', requiredModule:'inventory', parameters:{type:'object',properties:{name:{type:'string'},qty:{type:'number'},unit:{type:'string'},threshold:{type:'number'}},required:['name']}, async execute(ctx,p){ await gate(ctx,'inventory'); const row=await createItem(ctx.db,ctx.orgId,{name:String(p.name),qty:num(p.qty),unit:p.unit,lowThreshold:num(p.threshold,5)}); await audit(ctx,this.name,p,row.id); return result(this.name,'inventory',`Đã thêm ${row.qty} ${row.unit} ${row.name} vào kho`,row); } },
  { name:'inv.adjust_qty', description:'Điều chỉnh số lượng tồn kho', requiredModule:'inventory', parameters:{type:'object',properties:{itemName:{type:'string'},delta:{type:'number'}},required:['itemName','delta']}, async execute(ctx,p){ await gate(ctx,'inventory'); const [it]=await ctx.db.select().from(inventoryItems).where(and(eq(inventoryItems.orgId,ctx.orgId),ilike(inventoryItems.name,`%${p.itemName}%`))).limit(1); if(!it) throw Errors.notFound('Không tìm thấy mặt hàng'); const row=await adjustQty(ctx.db,ctx.orgId,it.id,num(p.delta)); await audit(ctx,this.name,p,row.id); return result(this.name,'inventory',`Đã điều chỉnh ${row.name}: ${row.qty} ${row.unit}`,row); } },
  { name:'hr.check_in', description:'Check-in chấm công cho nhân viên', requiredModule:'hr', parameters:{type:'object',properties:{employeeName:{type:'string'}},required:['employeeName']}, async execute(ctx,p){ await gate(ctx,'hr'); const e=await employeeByName(ctx.db,ctx.orgId,String(p.employeeName)); const row=await checkIn(ctx.db,ctx.orgId,{employeeId:e.id}); await audit(ctx,this.name,p,row.id); return result(this.name,'hr',`Đã check-in cho ${e.fullName}`,row); } },
  { name:'hr.check_out', description:'Check-out chấm công cho nhân viên', requiredModule:'hr', parameters:{type:'object',properties:{employeeName:{type:'string'}},required:['employeeName']}, async execute(ctx,p){ await gate(ctx,'hr'); const e=await employeeByName(ctx.db,ctx.orgId,String(p.employeeName)); const row=await checkOut(ctx.db,ctx.orgId,{employeeId:e.id}); await audit(ctx,this.name,p,row.id); return result(this.name,'hr',`Đã check-out cho ${e.fullName}`,row); } },
  { name:'hr.create_shift', description:'Tạo ca làm việc', requiredModule:'hr', parameters:{type:'object',properties:{name:{type:'string'},date:{type:'string'},start:{type:'string'},end:{type:'string'}},required:['name','date','start','end']}, async execute(ctx,p){ await gate(ctx,'hr'); const row=await createShift(ctx.db,ctx.orgId,{name:String(p.name),shiftDate:String(p.date),startTime:String(p.start),endTime:String(p.end)}); await audit(ctx,this.name,p,row.id); return result(this.name,'hr',`Đã tạo ca ${row.name} ngày ${row.shiftDate}`,row); } },
  { name:'om.balance', description:'Xem số dư ví Om', requiredModule:'om', parameters:{type:'object',properties:{}}, async execute(ctx,p){ const balance=await getBalance(ctx.db,ctx.orgId); await audit(ctx,this.name,p); return result(this.name,'om',`Số dư ví Om hiện tại là ${balance.toLocaleString('vi-VN')} Om`,{balance}); } },
  { name:'report.summary', description:'Tóm tắt nhanh dữ liệu dashboard', requiredModule:'core', parameters:{type:'object',properties:{}}, async execute(ctx,p){ const [contacts,items,emps,balance]=await Promise.all([listContacts(ctx.db,ctx.orgId).catch(()=>[]),listItems(ctx.db,ctx.orgId).catch(()=>[]),listEmployees(ctx.db,ctx.orgId).catch(()=>[]),getBalance(ctx.db,ctx.orgId).catch(()=>0)]); await audit(ctx,this.name,p); return result(this.name,'report',`Tóm tắt: ${contacts.length} khách, ${items.length} mặt hàng, ${emps.length} nhân viên, ${balance} Om`,{contacts:contacts.length,items:items.length,employees:emps.length,balance}); } },
];
export const ACTION_REGISTRY = new Map(defs.map(d=>[d.name,d]));
export const ACTION_TOOLS = defs.map(a=>({ type:'function', function:{ name:a.name, description:a.description, parameters:a.parameters } }));
export async function executeAction(ctx:TieuTamActionCtx, name:string, params:any){ const a=ACTION_REGISTRY.get(name); if(!a) throw Errors.validation(`Action không hợp lệ: ${name}`); return a.execute(ctx, params ?? {}); }
export function detectAction(message:string): {name:string; params:any} | null {
  const m=message.trim(); let x;
  if((x=/tạo\s+phiếu\s+thu\s+([\d.,]+)\s+(?:cho|từ)\s+(.+)/i.exec(m))) return {name:'acc.create_receipt',params:{amount:x[1].replace(/\D/g,''),partyName:x[2].trim()}};
  if((x=/tạo\s+phiếu\s+chi\s+([\d.,]+)\s+(?:cho|tới|đến)\s+(.+)/i.exec(m))) return {name:'acc.create_payment',params:{amount:x[1].replace(/\D/g,''),partyName:x[2].trim()}};
  if((x=/thêm\s+khách(?:\s+hàng)?\s+(.+?)(?:\s+số\s+điện\s+thoại|\s+sđt|\s+phone)\s+([0-9+]+)/i.exec(m))) return {name:'crm.add_contact',params:{name:x[1].trim(),phone:x[2].trim()}};
  if((x=/thêm\s+khách(?:\s+hàng)?\s+(.+)/i.exec(m))) return {name:'crm.add_contact',params:{name:x[1].trim()}};
  if((x=/thêm\s+([\d.,]+)\s*([^\s]+)?\s+(.+?)\s+(?:vào\s+)?kho/i.exec(m))) return {name:'inv.add_item',params:{qty:x[1].replace(/,/g,'.'),unit:x[2]||'cái',name:x[3].trim()}};
  if((x=/(?:cho\s+)?(.+?)\s+check-?in/i.exec(m))) return {name:'hr.check_in',params:{employeeName:x[1].trim()}};
  if((x=/(?:cho\s+)?(.+?)\s+check-?out/i.exec(m))) return {name:'hr.check_out',params:{employeeName:x[1].trim()}};
  if(/số\s+dư.*om|om.*số\s+dư/i.test(m)) return {name:'om.balance',params:{}};
  return null;
}
