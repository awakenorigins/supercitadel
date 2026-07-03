'use client';
import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { api } from '../lib/api';

type Req = { id:string; companyName:string; status:string; payload:any; createdAt:string };
const modules = ['Kế toán','CRM','Kho','Nhân sự','Chat'];
const terms = [
'Dịch vụ Module Company đang trong giai đoạn beta và được thiết kế theo từng hồ sơ doanh nghiệp.',
'Hồ sơ dùng để đội Citadel phân tích, thiết kế module riêng và chuẩn bị phạm vi triển khai.',
'Dữ liệu thuộc tổ chức của anh/chị, được cô lập theo tenant và không chia sẻ cho tổ chức khác.',
'Citadel có thể liên hệ để hỏi rõ thêm trước khi forge module.',
'Thời gian xây dựng và giá Om sẽ được báo sau khi hồ sơ được review.',
'Tính năng beta có thể thay đổi để phù hợp kiến trúc và bảo mật hệ thống.',
'Không đưa mật khẩu, khóa API, thông tin ngân hàng nhạy cảm vào form mô tả.',
'Chấp nhận điều khoản nghĩa là đồng ý cho xử lý hồ sơ phục vụ thiết kế module.',
'Phần build module thật sẽ được gắn vào pháo đài ở vòng triển khai sau khi hai bên duyệt phạm vi.',
];
const init = { companyName:'', business:'', customers:'', culture:'', employees:'', branches:'', departments:'', permissions:'', workflow:'', painPoints:'', manageNeeds:'', reports:'', sharedModules:[] as string[], aiJobs:'', mustHave:'', taboo:'' };
export function CompanyModuleWizard({ open, onClose, onCreated }:{ open:boolean; onClose:()=>void; onCreated:(r:Req)=>void }){
 const [step,setStep]=useState(0); const [form,setForm]=useState(init); const [agree,setAgree]=useState(false); const [busy,setBusy]=useState(false); const [done,setDone]=useState<Req|null>(null); const [err,setErr]=useState('');
 const total=6; const pct=Math.round(((step+1)/total)*100);
 const valid=useMemo(()=> step===0?!!(form.companyName&&form.business):step===1?!!(form.departments&&form.permissions):step===2?!!(form.workflow&&form.painPoints):step===3?!!(form.manageNeeds&&form.reports):step===4?!!(form.mustHave&&form.taboo):agree,[step,form,agree]);
 const set=(k:string,v:any)=>setForm(f=>({...f,[k]:v}));
 async function submit(){ setBusy(true); setErr(''); try{ const d=await api<any>('/api/v1/company-module/requests',{method:'POST',body:JSON.stringify({company_name:form.companyName,payload:form,termsAccepted:true})}); setDone(d.request); onCreated(d.request); setTimeout(()=>{},2500);}catch(e:any){setErr(e.message)} finally{setBusy(false)} }
 if(!open) return null;
 return <div className="sh-scrim cmw-scrim"><div className="cmw-sheet" onClick={e=>e.stopPropagation()}>
  <div className="cmw-head"><div><div className="k">Module Forge</div><h2>Module Company 🏢</h2><p>Điền như kể chuyện — Tiểu Tâm sẽ gom thành hồ sơ forge riêng.</p></div><button className="sh-x" onClick={onClose}><Icon name="x" size={15}/></button></div>
  {!done && <><div className="cmw-progress"><span style={{width:`${pct}%`}}/></div><div className="cmw-step">Bước {Math.min(step+1,5)}/5 {step===5?'· Điều khoản beta':''}</div></>}
  {done ? <div className="tt-pop"><div className="tt-avatar">🦊</div><div className="tt-bubble"><b>Em đã nhận Mod Module Company của {done.companyName} 🏢✨</b><div className="typing"><i/><i/><i/></div><div className="cmw-progress wait"><span/></div><p>Hồ sơ đã vào hàng chờ — đội Citadel sẽ forge module riêng và gắn vào pháo đài của anh/chị. Em sẽ báo ngay khi sẵn sàng 💪</p><div className="summary"><b>Mã hồ sơ:</b> <code>{done.id.slice(0,8).toUpperCase()}</code><br/><b>Module tick:</b> {form.sharedModules.length||0}<br/><b>Trạng thái:</b> Đã tiếp nhận ⏳</div><button className="btn-p" onClick={onClose}>Xong</button></div></div> : <>
  {step===0&&<section className="cmw-grid"><Field label="Tên công ty*" v={form.companyName} set={v=>set('companyName',v)}/><Field label="Kinh doanh gì*" v={form.business} set={v=>set('business',v)}/><Field label="Bán cho ai / thu tiền kiểu gì" v={form.customers} set={v=>set('customers',v)}/><Field label="Văn hóa / đặc thù" v={form.culture} set={v=>set('culture',v)}/><Field label="Tổng nhân viên" v={form.employees} set={v=>set('employees',v)}/><Field label="Số chi nhánh" v={form.branches} set={v=>set('branches',v)}/></section>}
  {step===1&&<section><Area label="Phòng ban & việc làm*" v={form.departments} set={v=>set('departments',v)} ph="Kinh doanh: tìm khách, chốt đơn…"/><Area label="Ai được thấy gì*" v={form.permissions} set={v=>set('permissions',v)} ph="Sếp thấy hết · trưởng phòng thấy phòng mình…"/></section>}
  {step===2&&<section><Area big label="Một vòng công việc* ⭐" v={form.workflow} set={v=>set('workflow',v)} ph="Kể như dặn nhân viên mới: từ lúc có khách đến lúc thu tiền…"/><Area label="Điểm đau thủ công*" v={form.painPoints} set={v=>set('painPoints',v)} ph="Excel, giấy tờ, hay quên, hay sai…"/></section>}
  {step===3&&<section><Area label="Cần quản gì*" v={form.manageNeeds} set={v=>set('manageNeeds',v)}/><Area label="Báo cáo muốn xem*" v={form.reports} set={v=>set('reports',v)}/><div className="pill-row">{modules.map(m=><button key={m} className={form.sharedModules.includes(m)?'sel':''} onClick={()=>set('sharedModules',form.sharedModules.includes(m)?form.sharedModules.filter(x=>x!==m):[...form.sharedModules,m])}>{m}</button>)}</div><Area label="Việc giao Tiểu Tâm AI" v={form.aiJobs} set={v=>set('aiJobs',v)}/></section>}
  {step===4&&<section><Area label="Tính năng PHẢI CÓ đợt đầu*" v={form.mustHave} set={v=>set('mustHave',v)}/><Area label="Điều CẤM KỴ*" v={form.taboo} set={v=>set('taboo',v)}/><div className="summary"><b>{form.companyName}</b><p>{form.business}</p><small>{form.sharedModules.join(' · ')||'Chưa tick module dùng chung'}</small></div></section>}
  {step===5&&<section className="terms"><h3>Điều khoản beta</h3>{terms.map((t,i)=><p key={i}><b>{i+1}.</b> {t}</p>)}<label><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}/> Tôi đã đọc và đồng ý</label></section>}
  {err&&<div className="err">{err}</div>}<div className="cmw-actions"><button className="chip" disabled={step===0||busy} onClick={()=>setStep(s=>s-1)}>← Quay lại</button>{step<5?<button className="btn-p" disabled={!valid} onClick={()=>setStep(s=>s+1)}>Tiếp tục</button>:<button className="btn-p add-glow" disabled={!valid||busy} onClick={submit}>{busy?'Đang gửi…':'＋ Add Module Company'}</button>}</div>
 </>}
 </div></div>
}
function Field({label,v,set}:{label:string;v:string;set:(v:string)=>void}){return <label className="cmw-field"><span>{label}</span><input value={v} onChange={e=>set(e.target.value)}/></label>}
function Area({label,v,set,ph,big}:{label:string;v:string;set:(v:string)=>void;ph?:string;big?:boolean}){return <label className="cmw-field"><span>{label}</span><textarea style={{minHeight:big?140:92}} value={v} placeholder={ph} onChange={e=>set(e.target.value)}/></label>}
