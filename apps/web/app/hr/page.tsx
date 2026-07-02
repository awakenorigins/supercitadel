'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { api, getSession } from '../../lib/api';

interface Shift { id: string; name: string; shiftDate: string; startTime: string; endTime: string; staff: string }
interface Emp { id: string; fullName: string; roleTitle: string; status: string }
interface Att { id: string; employeeId: string; employeeName: string; roleTitle: string; checkIn: string | null; checkOut: string | null; workingHours: string; status: string; lateEntry: boolean }
interface LeaveApp { id: string; employeeName: string; typeName: string; fromDate: string; toDate: string; totalDays: string; reason: string | null; status: string }
interface LeaveType { id: string; name: string; daysPerYear: string; isPaid: boolean }

const AVA = ['mint', 'violet', 'amber', 'sky', 'rose'];
const today = () => new Date().toISOString().slice(0, 10);
const hhmm = (iso: string | null) => iso ? new Date(iso).toTimeString().slice(0, 5) : '—';
const inputSt = { padding: '11px 12px', borderRadius: 12, border: '1.5px solid var(--bd)', background: 'var(--s1)', color: 'var(--txt)', fontSize: 13, outline: 'none' } as const;
const chipBtn = { display: 'flex', alignItems: 'center', gap: 5, background: 'var(--jade-soft)', border: '1px solid rgba(52,211,184,.3)', borderRadius: 99, padding: '5px 12px', fontSize: 11.5, color: 'var(--jade)', fontWeight: 600, cursor: 'pointer' } as const;

export default function HrPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'ca' | 'cong' | 'phep'>('cong');
  const [locked, setLocked] = useState(false);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [emps, setEmps] = useState<Emp[] | null>(null);
  const [atts, setAtts] = useState<Att[] | null>(null);
  const [apps, setApps] = useState<LeaveApp[] | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [msg, setMsg] = useState('');

  const gate = (e: any) => { if (String(e.message).includes('kích hoạt')) setLocked(true); };
  const loadAll = useCallback(() => {
    api<{ shifts: Shift[] }>('/api/v1/hr/shifts').then((d) => { setShifts(d.shifts); setLocked(false); }).catch(gate);
    api<{ employees: Emp[] }>('/api/v1/hr/employees?status=active').then((d) => setEmps(d.employees)).catch(gate);
    api<{ attendance: Att[] }>(`/api/v1/hr/attendance?date=${today()}`).then((d) => setAtts(d.attendance)).catch(gate);
    api<{ applications: LeaveApp[] }>('/api/v1/hr/leave/applications').then((d) => setApps(d.applications)).catch(gate);
    api<{ types: LeaveType[] }>('/api/v1/hr/leave/types').then((d) => setTypes(d.types)).catch(() => {});
  }, []);
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } loadAll(); }, [router, loadAll]);

  // ── Ca làm ──
  const [nm, setNm] = useState(''); const [dt, setDt] = useState(today()); const [t1, setT1] = useState('08:00'); const [t2, setT2] = useState('17:00');
  async function addShift() {
    if (!nm.trim()) return;
    await api('/api/v1/hr/shifts', { method: 'POST', body: JSON.stringify({ name: nm, shiftDate: dt, startTime: t1, endTime: t2, staff: [] }) }).catch(() => {});
    setNm(''); loadAll();
  }
  async function addPerson(s: Shift) {
    const name = window.prompt('Tên người vào ' + s.name + ':'); if (!name?.trim()) return;
    const cur = s.staff ? s.staff.split(',').map((x) => x.trim()).filter(Boolean) : [];
    await api(`/api/v1/hr/shifts/${s.id}/staff`, { method: 'PUT', body: JSON.stringify({ staff: [...cur, name.trim()] }) }).catch(() => {});
    loadAll();
  }

  // ── Chấm công ──
  const [empNm, setEmpNm] = useState(''); const [empRole, setEmpRole] = useState('');
  async function addEmp() {
    if (!empNm.trim()) return;
    await api('/api/v1/hr/employees', { method: 'POST', body: JSON.stringify({ fullName: empNm, roleTitle: empRole || undefined }) }).catch(() => {});
    setEmpNm(''); setEmpRole(''); loadAll();
  }
  async function doCheck(empId: string, dir: 'in' | 'out') {
    try { await api(`/api/v1/hr/attendance/check-${dir}`, { method: 'POST', body: JSON.stringify({ employeeId: empId }) }); setMsg(''); }
    catch (e: any) { setMsg(e.message); }
    loadAll();
  }
  const attOf = (empId: string) => atts?.find((a) => a.employeeId === empId);

  // ── Nghỉ phép ──
  const [lvEmp, setLvEmp] = useState(''); const [lvType, setLvType] = useState(''); const [lvFrom, setLvFrom] = useState(today()); const [lvTo, setLvTo] = useState(today()); const [lvWhy, setLvWhy] = useState('');
  async function applyLv() {
    if (!lvEmp || !lvType) return;
    try {
      await api('/api/v1/hr/leave/applications', { method: 'POST', body: JSON.stringify({ employeeId: lvEmp, leaveTypeId: lvType, fromDate: lvFrom, toDate: lvTo, reason: lvWhy || undefined }) });
      setMsg(''); setLvWhy('');
    } catch (e: any) { setMsg(e.message); }
    loadAll();
  }
  async function decide(id: string, ok: boolean) {
    try { await api(`/api/v1/hr/leave/applications/${id}/${ok ? 'approve' : 'reject'}`, { method: 'POST' }); setMsg(''); }
    catch (e: any) { setMsg(e.message); }
    loadAll();
  }

  const STATUS_VN: Record<string, string> = { present: 'Có mặt', on_leave: 'Nghỉ phép', absent: 'Vắng', half_day: 'Nửa ngày', open: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
  const tabs = [['cong', 'Chấm công'], ['ca', 'Ca làm'], ['phep', 'Nghỉ phép']] as const;

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Nhân sự v2 · fork hrms</div><h1>Nhân Sự</h1></div>
        {locked ? <ModuleLocked name="Nhân Sự & Ca" /> : (
          <>
            <div style={{ display: 'flex', gap: 7, padding: '13px 20px 0' }}>
              {tabs.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '9px 0', borderRadius: 12, fontSize: 12.5, fontWeight: 700, border: '1px solid', borderColor: tab === k ? 'rgba(52,211,184,.4)' : 'var(--bd)', background: tab === k ? 'var(--jade-soft)' : 'var(--s1)', color: tab === k ? 'var(--jade)' : 'var(--dim)' }}>{label}</button>
              ))}
            </div>
            {msg && <div className="card" style={{ margin: '11px 20px 0', padding: '10px 13px', fontSize: 12, color: 'var(--amber)', borderColor: 'rgba(232,179,102,.35)' }}>{msg}</div>}

            {tab === 'cong' && (
              <>
                <div style={{ margin: '13px 20px 0', display: 'grid', gridTemplateColumns: '1fr 110px 42px', gap: 7 }}>
                  <input value={empNm} onChange={(e) => setEmpNm(e.target.value)} placeholder="Thêm nhân viên…" style={inputSt} />
                  <input value={empRole} onChange={(e) => setEmpRole(e.target.value)} placeholder="Chức danh" style={inputSt} />
                  <button onClick={addEmp} style={{ borderRadius: 12, border: 'none', background: 'var(--jade)', color: '#04231f', display: 'grid', placeItems: 'center' }}><Icon name="plus" size={18} /></button>
                </div>
                <div style={{ padding: '13px 20px 0' }}>
                  {emps === null && <div className="skel" style={{ height: 70, marginBottom: 9 }} />}
                  {emps?.length === 0 && <p className="mut" style={{ padding: 10, fontSize: 13 }}>Chưa có nhân viên — thêm ở trên.</p>}
                  {emps?.map((e, i) => {
                    const a = attOf(e.id);
                    return (
                      <div key={e.id} className="card" style={{ padding: 13, borderRadius: 15, marginBottom: 9 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span className={`ava ${AVA[i % AVA.length]}`} style={{ width: 36, height: 36, borderRadius: 11, fontSize: 12 }}>{e.fullName.slice(0, 2)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{e.fullName}</div>
                            <div className="mono" style={{ fontSize: 10.5, color: a?.lateEntry ? 'var(--amber)' : 'var(--mut)' }}>{e.roleTitle}{a?.lateEntry ? ' · ĐI TRỄ' : ''}</div>
                          </div>
                          {!a?.checkIn && a?.status !== 'on_leave' && <button onClick={() => doCheck(e.id, 'in')} style={chipBtn}>Check-in</button>}
                          {a?.checkIn && !a?.checkOut && <button onClick={() => doCheck(e.id, 'out')} style={{ ...chipBtn, background: 'var(--amber-soft)', borderColor: 'rgba(232,179,102,.35)', color: 'var(--amber)' }}>Check-out</button>}
                          {a?.checkOut && <span className="mono" style={{ fontSize: 11, color: 'var(--jade)' }}>{Number(a.workingHours).toFixed(1)}h</span>}
                        </div>
                        {a && <div className="mono" style={{ fontSize: 10.5, color: a.status === 'on_leave' ? 'var(--violet)' : 'var(--mut)', marginTop: 8, paddingLeft: 47 }}>
                          {STATUS_VN[a.status] ?? a.status} · vào {hhmm(a.checkIn)} · ra {hhmm(a.checkOut)}
                        </div>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {tab === 'ca' && (
              <>
                <div style={{ margin: '13px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Tên ca (vd: Ca Tối)" style={{ ...inputSt, gridColumn: '1 / -1' }} />
                  <input type="date" value={dt} onChange={(e) => setDt(e.target.value)} style={inputSt} />
                  <div style={{ display: 'flex', gap: 7 }}>
                    <input type="time" value={t1} onChange={(e) => setT1(e.target.value)} style={{ ...inputSt, flex: 1 }} />
                    <input type="time" value={t2} onChange={(e) => setT2(e.target.value)} style={{ ...inputSt, flex: 1 }} />
                  </div>
                  <button onClick={addShift} className="btn-p" style={{ gridColumn: '1 / -1', opacity: nm.trim() ? 1 : .5 }}><Icon name="plus" size={15} /> Tạo ca</button>
                </div>
                <div style={{ padding: '14px 20px 0' }}>
                  {shifts?.length === 0 && <p className="mut" style={{ padding: 10, fontSize: 13 }}>Chưa có ca.</p>}
                  {shifts?.map((s) => {
                    const people = s.staff ? s.staff.split(',').map((x) => x.trim()).filter(Boolean) : [];
                    return (
                      <div key={s.id} className="card" style={{ padding: 15, borderRadius: 16, marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <b className="fd" style={{ fontSize: 15 }}>{s.name}</b>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--jade)', marginLeft: 'auto' }}>{s.startTime}–{s.endTime}</span>
                        </div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 3 }}>{new Date(s.shiftDate + 'T00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' })}</div>
                        <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
                          {people.map((p, i) => (
                            <span key={p + i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 99, padding: '4px 10px 4px 4px', fontSize: 12 }}>
                              <span className={`ava ${AVA[i % AVA.length]}`} style={{ width: 22, height: 22, borderRadius: 7, fontSize: 9 }}>{p.slice(0, 2)}</span>{p}
                            </span>
                          ))}
                          <button onClick={() => addPerson(s)} style={chipBtn}><Icon name="plus" size={12} /> Xếp người</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {tab === 'phep' && (
              <>
                <div style={{ margin: '13px 20px 0', display: 'grid', gap: 7 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                    <select value={lvEmp} onChange={(e) => setLvEmp(e.target.value)} style={inputSt as any}>
                      <option value="">Chọn nhân viên…</option>
                      {emps?.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </select>
                    <select value={lvType} onChange={(e) => setLvType(e.target.value)} style={inputSt as any}>
                      <option value="">Loại phép…</option>
                      {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                    <input type="date" value={lvFrom} onChange={(e) => setLvFrom(e.target.value)} style={inputSt} />
                    <input type="date" value={lvTo} onChange={(e) => setLvTo(e.target.value)} style={inputSt} />
                  </div>
                  <input value={lvWhy} onChange={(e) => setLvWhy(e.target.value)} placeholder="Lý do (tuỳ chọn)" style={inputSt} />
                  <button onClick={applyLv} className="btn-p" style={{ opacity: lvEmp && lvType ? 1 : .5 }}>Nộp đơn xin nghỉ</button>
                </div>
                <div style={{ padding: '14px 20px 0' }}>
                  {apps?.length === 0 && <p className="mut" style={{ padding: 10, fontSize: 13 }}>Chưa có đơn nghỉ phép nào.</p>}
                  {apps?.map((a) => (
                    <div key={a.id} className="card" style={{ padding: 14, borderRadius: 15, marginBottom: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <b style={{ fontSize: 13.5 }}>{a.employeeName}</b>
                        <span className="mono" style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 6, background: a.status === 'approved' ? 'var(--jade-soft)' : a.status === 'rejected' ? 'rgba(240,98,116,.12)' : 'var(--amber-soft)', color: a.status === 'approved' ? 'var(--jade)' : a.status === 'rejected' ? 'var(--rose)' : 'var(--amber)', marginLeft: 'auto' }}>{STATUS_VN[a.status]}</span>
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--mut)', marginTop: 4 }}>{a.typeName} · {a.fromDate} → {a.toDate} · {Number(a.totalDays)} ngày{a.reason ? ` · ${a.reason}` : ''}</div>
                      {a.status === 'open' && (
                        <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                          <button onClick={() => decide(a.id, true)} style={{ ...chipBtn, flex: 1, justifyContent: 'center' }}>Duyệt</button>
                          <button onClick={() => decide(a.id, false)} style={{ ...chipBtn, flex: 1, justifyContent: 'center', background: 'rgba(240,98,116,.1)', borderColor: 'rgba(240,98,116,.3)', color: 'var(--rose)' }}>Từ chối</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
