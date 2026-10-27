'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { EmptyState } from '../../components/EmptyState';
import { ModuleLocked } from '../../components/ModuleGate';
import { api, getSession } from '../../lib/api';

type Def={id:string;code:string;name:string;domain:string;entityType:string;isActive:boolean;version:number};
type Inst={id:string;entityType:string;entityId:string;status:string;amount:string|null;startedAt:string;currentStepOrder:number|null};
type Step={id:string;stepOrder:number;name:string;assigneeRole:string;status:string;slaDeadline:string|null;metadata:any};
const ST:any={pending:'amber',approved:'jade',rejected:'rose',active:'sky',waiting:'mut'};
const VN:any={pending:'Đang chạy',approved:'Đã duyệt',rejected:'Từ chối',active:'Đang chờ duyệt',waiting:'Chờ bước trước'};
export default function WorkflowPage(){
 const router=useRouter(); const B='/api/v1/workflow';
 const [locked,setLocked]=useState(false),[status,setStatus]=useState('pending'),[defs,setDefs]=useState<Def[]>([]),[inst,setInst]=useState<Inst[]>([]),[sel,setSel]=useState<string>(''),[steps,setSteps]=useState<Step[]>([]),[msg,setMsg]=useState('');
 const flash=(s:string)=>{setMsg(s);setTimeout(()=>setMsg(''),5000)};
 const load=useCallback(async()=>{try{await api(`${B}/health`);setLocked(false); const [d,i]=await Promise.all([api<{definitions:Def[]}>(`${B}/definitions`),api<{instances:Inst[]}>(`${B}/instances?status=${status}`)]); setDefs(d.definitions); setInst(i.instances); if(!sel&&i.instances[0]) setSel(i.instances[0].id);}catch(e:any){ if(/kích hoạt|hết hạn thuê/.test(String(e.message))) setLocked(true);}},[status,sel]);
 useEffect(()=>{ if(!getSession()){router.replace('/');return;} load();},[router,load]);
 useEffect(()=>{ if(!sel){setSteps([]);return;} api<any>(`${B}/instances/${sel}`).then(d=>setSteps(d.steps)).catch(()=>setSteps([]));},[sel]);
 async function act(id:string,a:'approve'|'reject'|'return'){ const comment=a==='approve'?'OK':window.prompt('Ghi chú')??''; await api(`${B}/steps/${id}/${a}`,{method:'POST',body:JSON.stringify({comment})}); flash('Đã cập nhật bước duyệt ✓'); await load(); const d:any=await api(`${B}/instances/${sel}`); setSteps(d.steps); }
 if(locked) return <Shell><ModuleLocked name="Quy trình & Phê duyệt" id="workflow"/></Shell>;
 return <Shell wide><div className="biz-main">
  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><h1 style={{margin:0}}>Quy trình & Phê duyệt</h1><span className="chip chip-sky">Core</span><select className="inp" style={{marginLeft:'auto',width:170}} value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">Đang chạy</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option></select></div>
  {msg&&<div className="card" style={{padding:'8px 12px',margin:'8px 0'}}>{msg}</div>}
  <div style={{display:'grid',gridTemplateColumns:'minmax(280px,1fr) minmax(360px,1.4fr)',gap:12,alignItems:'start'}}>
   <div className="card"><h3 style={{marginTop:0}}>Definitions</h3>{!defs.length?<EmptyState icon="flow" title="Chưa có định nghĩa" sub="Seed hoặc tạo qua API để bắt đầu."/>:<table className="tbl"><thead><tr><th>Mã</th><th>Tên</th><th>Domain</th></tr></thead><tbody>{defs.map(d=><tr key={d.id}><td><b>{d.code}</b></td><td>{d.name}<div className="mut" style={{fontSize:12}}>v{d.version} · {d.entityType}</div></td><td><span className="chip chip-mut">{d.domain}</span></td></tr>)}</tbody></table>}</div>
   <div className="card"><h3 style={{marginTop:0}}>Instance</h3>{!inst.length?<EmptyState icon="check" title="Không có hồ sơ" sub="Đổi bộ lọc trạng thái hoặc khởi tạo quy trình mới."/>:<table className="tbl"><thead><tr><th>Entity</th><th>Trạng thái</th><th>Số tiền</th></tr></thead><tbody>{inst.map(i=><tr key={i.id} onClick={()=>setSel(i.id)} style={{cursor:'pointer',outline:sel===i.id?'2px solid var(--primary)':'none'}}><td><b>{i.entityType}</b><div className="mut" style={{fontSize:12}}>{i.entityId.slice(0,8)} · bước {i.currentStepOrder??'—'}</div></td><td><span className={`chip chip-${ST[i.status]??'mut'}`}>{VN[i.status]??i.status}</span></td><td>{i.amount?Number(i.amount).toLocaleString('vi-VN'):'—'}</td></tr>)}</tbody></table>}</div>
  </div>
  <div className="card" style={{marginTop:12}}><h3 style={{marginTop:0}}>Các bước duyệt</h3>{!steps.length?<EmptyState icon="clock" title="Chọn instance" sub="Chi tiết bước, SLA và nút duyệt nằm ở đây."/>:<table className="tbl"><thead><tr><th>#</th><th>Bước</th><th>Người/role</th><th>SLA</th><th></th></tr></thead><tbody>{steps.map(s=><tr key={s.id}><td>{s.stepOrder}</td><td>{s.name}<div><span className={`chip chip-${ST[s.status]??'mut'}`}>{VN[s.status]??s.status}</span>{s.metadata?.slaExpiredNotified&&<span className="chip chip-rose">Quá SLA</span>}</div></td><td>{s.assigneeRole}</td><td className="mut">{s.slaDeadline?new Date(s.slaDeadline).toLocaleString('vi-VN'):'—'}</td><td>{s.status==='active'&&<span style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn-p" onClick={()=>act(s.id,'approve')}>Duyệt</button><button className="btn-s" onClick={()=>act(s.id,'reject')}>Từ chối</button><button className="btn-s" onClick={()=>act(s.id,'return')}>Trả về</button></span>}</td></tr>)}</tbody></table>}</div>
 </div></Shell>;
}
