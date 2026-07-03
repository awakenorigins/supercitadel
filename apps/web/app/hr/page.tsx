'use client';
// R2 redesign: .tabs + .dt data tables + forms → .sheet thống nhất + .bdg-s semantic.
// Data/endpoint GIỮ NGUYÊN (hr v2 — employees/attendance/shifts/leave).
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

interface Shift { id: string; name: string; shiftDate: string; startTime: string; endTime: string; staff: string }
interface Emp { id: string; fullName: string; roleTitle: string; status: string }
interface Att { id: string; employeeId: string; employeeName: string; roleTitle: string; checkIn: string | null; checkOut: string | null; workingHours: string; status: string; lateEntry: boolean }
interface LeaveApp { id: string; employeeName: string; typeName: string; fromDate: string; toDate: string; totalDays: string; reason: string | null; status: string }
interface LeaveType { id: string; name: string; daysPerYear: string; isPaid: boolean }

const AVA = ['mint', 'violet', 'amber', 'sky', 'rose'];
const today = () => new Date().toISOString().slice(0, 10);
const hhmm = (iso: string | null) => iso ? new Date(iso).toTimeString().slice(0, 5) : '—';
const chipBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--jade-soft)', border: '1px solid rgba(52,211,184,.3)', borderRadius: 99, padding: '5px 12px', fontSize: 11.5, color: 'var(--jade)', fontWeight: 600, cursor: 'pointer' } as const;

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
  const [sheet, setSheet] = useState<'' | 'emp' | 'shift' | 'leave'>('');

  const gate = (e: any) => { if (/kích hoạt|hết hạn thuê/.test(String(e.message))) setLocked(true); };
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
    try {
      await api('/api/v1/hr/shifts', { method: 'POST', body: JSON.stringify({ name: nm, shiftDate: dt, startTime: t1, endTime: t2, staff: [] }) });
      setMsg(''); setNm(''); setSheet(''); loadAll();
    } catch (e: any) { setMsg(e.message); }
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
    setEmpNm(''); setEmpRole(''); setSheet(''); loadAll();
  }
  const [flashId, setFlashId] = useState('');
  async function doCheck(empId: string, dir: 'in' | 'out') {
    try {
      await api(`/api/v1/hr/attendance/check-${dir}`, { method: 'POST', body: JSON.stringify({ employeeId: empId }) });
      setMsg('');
      setFlashId(empId);
      setTimeout(() => setFlashId(''), 1300);
    } catch (e: any) { setMsg(e.message); }
    loadAll();
  }
  const attOf = (empId: string) => atts?.find((a) => a.employeeId === empId);

  // ── Nghỉ phép ──
  const [lvEmp, setLvEmp] = useState(''); const [lvType, setLvType] = useState(''); const [lvFrom, setLvFrom] = useState(today()); const [lvTo, setLvTo] = useState(today()); const [lvWhy, setLvWhy] = useState('');
  async function applyLv() {
    if (!lvEmp || !lvType) return;
    try {
      await api('/api/v1/hr/leave/applications', { method: 'POST', body: JSON.stringify({ employeeId: lvEmp, leaveTypeId: lvType, fromDate: lvFrom, toDate: lvTo, reason: lvWhy || undefined }) });
      setMsg(''); setLvWhy(''); setSheet('');
    } catch (e: any) { setMsg(e.message); }
    loadAll();
  }
  async function decide(id: string, ok: boolean) {
    try { await api(`/api/v1/hr/leave/applications/${id}/${ok ? 'approve' : 'reject'}`, { method: 'POST' }); setMsg(''); }
    catch (e: any) { setMsg(e.message); }
    loadAll();
  }

  const STATUS_VN: Record<string, string> = { present: 'Có mặt', checked_out: 'Đã về', on_leave: 'Nghỉ phép', absent: 'Vắng', half_day: 'Nửa ngày', open: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
  const ATT_BDG: Record<string, string> = { present: 'jade', checked_out: 'sky', on_leave: 'violet', absent: 'rose', half_day: 'sky' };
  const LV_BDG: Record<string, string> = { open: 'amber', approved: 'jade', rejected: 'rose' };
  const tabs = [['cong', 'Chấm công'], ['ca', 'Ca làm'], ['phep', 'Nghỉ phép']] as const;
  const presentCount = atts?.filter((a) => a.checkIn).length ?? 0;

  return (
    <Shell wide>
      <div className="scroll">
        <div className="pg-h"><div className="k">Nhân sự v2 · fork hrms</div><h1>Nhân Sự</h1></div>
        {locked ? <ModuleLocked name="Nhân Sự & Ca" id="hr" /> : (
          <div className="biz-cols">
          <div className="biz-main">
            <div className="tabs">
              {tabs.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={`tab ${tab === k ? 'on' : ''}`}>{label}</button>
              ))}
            </div>
            {msg && <div className="card" style={{ margin: '11px 20px 0', padding: '10px 13px', fontSize: 12, color: 'var(--amber)', borderColor: 'rgba(232,179,102,.35)' }}>{msg}</div>}

            {tab === 'cong' && (
              <>
                <div className="stat-row c3">
                  <div className="stat"><div className="sv">{emps?.length ?? '—'}</div><div className="sl">Nhân viên</div></div>
                  <div className="stat"><div className="sv" style={{ color: 'var(--jade)' }}>{atts ? presentCount : '—'}</div><div className="sl">Đã check-in hôm nay</div></div>
                  <div className="stat">
                    <button onClick={() => setSheet('emp')} style={{ ...chipBtn, marginTop: 2 }}><Icon name="plus" size={12} /> Thêm nhân viên</button>
                    <div className="sl">Hồ sơ mới</div>
                  </div>
                </div>
                {emps === null && <div className="skel" style={{ height: 120, margin: '13px 20px 0', borderRadius: 16 }} />}
                {emps?.length === 0 && (
                  <EmptyState icon="people" title="Chưa có nhân viên" sub="Thêm hồ sơ đầu tiên để chấm công, xếp ca và duyệt nghỉ phép." cta="+ Thêm nhân viên" onCta={() => setSheet('emp')} />
                )}
                {emps && emps.length > 0 && (
                  <div className="dt-wrap fade-up">
                    <table className="dt">
                      <thead><tr><th>Nhân viên</th><th>Trạng thái</th><th>Vào</th><th>Ra</th><th className="num">Giờ công</th><th></th></tr></thead>
                      <tbody>
                        {emps.map((e, i) => {
                          const a = attOf(e.id);
                          return (
                            <tr key={e.id} className={flashId === e.id ? 'row-flash' : ''}>
                              <td style={{ fontWeight: 600 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                                  <span className={`ava ${AVA[i % AVA.length]}`} style={{ width: 30, height: 30, borderRadius: 9, fontSize: 10 }}>{e.fullName.slice(0, 2)}</span>
                                  <span>
                                    {e.fullName}
                                    <span className="mono" style={{ display: 'block', fontSize: 9.5, color: a?.lateEntry ? 'var(--amber)' : 'var(--mut)', fontWeight: 400 }}>{e.roleTitle}{a?.lateEntry ? ' · ĐI TRỄ' : ''}</span>
                                  </span>
                                </span>
                              </td>
                              <td>{a ? <span className={`bdg-s ${ATT_BDG[a.status] ?? 'mut'}`}>{STATUS_VN[a.status] ?? a.status}</span> : <span className="bdg-s mut">CHƯA VÀO</span>}</td>
                              <td className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>{hhmm(a?.checkIn ?? null)}</td>
                              <td className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>{hhmm(a?.checkOut ?? null)}</td>
                              <td className="num" style={{ color: 'var(--jade)', fontWeight: 700 }}>{a?.checkOut ? `${Number(a.workingHours).toFixed(1)}h` : '—'}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {!a?.checkIn && a?.status !== 'on_leave' && <button onClick={() => doCheck(e.id, 'in')} style={chipBtn}>Check-in</button>}
                                {a?.checkIn && !a?.checkOut && <button onClick={() => doCheck(e.id, 'out')} style={{ ...chipBtn, background: 'var(--amber-soft)', borderColor: 'rgba(232,179,102,.35)', color: 'var(--amber)' }}>Check-out</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === 'ca' && (
              <>
                <div style={{ margin: '13px 20px 0' }}>
                  <button onClick={() => setSheet('shift')} style={chipBtn}><Icon name="plus" size={12} /> Tạo ca mới</button>
                </div>
                <div style={{ padding: '10px 20px 0' }}>
                  {shifts === null && <div className="skel" style={{ height: 90, borderRadius: 16 }} />}
                  {shifts?.length === 0 && (
                    <EmptyState icon="doc" title="Chưa có ca làm" sub="Tạo ca đầu tiên rồi xếp người vào — lịch ca hiện ngay tại đây." cta="+ Tạo ca mới" onCta={() => setSheet('shift')} />
                  )}
                  {shifts?.map((s) => {
                    const people = s.staff ? s.staff.split(',').map((x) => x.trim()).filter(Boolean) : [];
                    return (
                      <div key={s.id} className="card" style={{ padding: 15, borderRadius: 16, marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <b className="fd" style={{ fontSize: 15 }}>{s.name}</b>
                          <span className="bdg-s jade" style={{ marginLeft: 'auto' }}>{s.startTime}–{s.endTime}</span>
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
                <div style={{ margin: '13px 20px 0' }}>
                  <button onClick={() => setSheet('leave')} style={chipBtn}><Icon name="plus" size={12} /> Nộp đơn xin nghỉ</button>
                </div>
                {apps === null && <div className="skel" style={{ height: 100, margin: '10px 20px 0', borderRadius: 16 }} />}
                {apps?.length === 0 && (
                  <EmptyState icon="doc" title="Chưa có đơn nghỉ phép" sub="Nộp đơn đầu tiên — quản lý duyệt ngay trên bảng này." cta="+ Nộp đơn" onCta={() => setSheet('leave')} />
                )}
                {apps && apps.length > 0 && (
                  <div className="dt-wrap fade-up" style={{ marginTop: 10 }}>
                    <table className="dt">
                      <thead><tr><th>Nhân viên</th><th>Loại phép</th><th>Thời gian</th><th className="num">Ngày</th><th>Trạng thái</th><th></th></tr></thead>
                      <tbody>
                        {apps.map((a) => (
                          <tr key={a.id}>
                            <td style={{ fontWeight: 600 }}>{a.employeeName}<span style={{ display: 'block', fontSize: 10, color: 'var(--mut)', fontWeight: 400 }}>{a.reason ?? ''}</span></td>
                            <td style={{ fontSize: 12 }}>{a.typeName}</td>
                            <td className="mono" style={{ fontSize: 10.5, color: 'var(--dim)' }}>{a.fromDate} → {a.toDate}</td>
                            <td className="num">{Number(a.totalDays)}</td>
                            <td><span className={`bdg-s ${LV_BDG[a.status] ?? 'mut'}`}>{STATUS_VN[a.status] ?? a.status}</span></td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {a.status === 'open' && (
                                <>
                                  <button onClick={() => decide(a.id, true)} style={chipBtn}>Duyệt</button>
                                  <span style={{ display: 'inline-block', width: 6 }} />
                                  <button onClick={() => decide(a.id, false)} style={{ ...chipBtn, background: 'rgba(240,98,116,.1)', borderColor: 'rgba(240,98,116,.3)', color: 'var(--rose)' }}>Từ chối</button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── R4 aside: hôm nay — ai đang làm, ai nghỉ, đơn chờ duyệt ── */}
          <aside className="biz-aside">
            <div className="as-panel">
              <div className="as-h"><Icon name="clock" /> Hôm nay</div>
              <div className="as-kpis">
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="check" size={14} /></div>
                  <div className="v" style={{ color: 'var(--jade)' }}>{atts ? atts.filter((a) => a.checkIn && !a.checkOut).length : '—'}</div>
                  <div className="l">Đang làm việc</div>
                </div>
                <div className="as-kpi">
                  <div className="ii" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}><Icon name="leaf" size={14} /></div>
                  <div className="v" style={{ color: 'var(--violet)' }}>{atts ? atts.filter((a) => a.status === 'on_leave').length : '—'}</div>
                  <div className="l">Nghỉ phép hôm nay</div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                {atts === null && <div className="skel" style={{ height: 60, borderRadius: 12 }} />}
                {atts !== null && atts.filter((a) => a.checkIn && !a.checkOut).length === 0 && (
                  <p className="mut" style={{ fontSize: 12, padding: '4px 0' }}>Chưa ai check-in đang trong ca.</p>
                )}
                {atts?.filter((a) => a.checkIn && !a.checkOut).slice(0, 6).map((a, i) => (
                  <div key={a.id} className="as-it">
                    <span className={`ava ${AVA[i % AVA.length]}`} style={{ width: 30, height: 30, borderRadius: 9, fontSize: 10 }}>{a.employeeName.slice(0, 2)}</span>
                    <div className="ai-t"><b>{a.employeeName}</b><span>{a.roleTitle}{a.lateEntry ? ' · đi trễ' : ''}</span></div>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--jade)' }}>{hhmm(a.checkIn)} →</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="as-panel">
              <div className="as-h"><Icon name="bell" /> Đơn chờ duyệt
                <span className={`bdg-s ${(apps?.filter((a) => a.status === 'open').length ?? 0) > 0 ? 'amber' : 'jade'}`} style={{ marginLeft: 'auto' }}>{apps ? apps.filter((a) => a.status === 'open').length : '—'}</span>
              </div>
              {apps === null && <div className="skel" style={{ height: 60, borderRadius: 12 }} />}
              {apps !== null && apps.filter((a) => a.status === 'open').length === 0 && (
                <p className="mut" style={{ fontSize: 12, padding: '4px 0' }}>Không có đơn nào chờ duyệt.</p>
              )}
              {apps?.filter((a) => a.status === 'open').slice(0, 5).map((a) => (
                <div key={a.id} className="as-it">
                  <div className="ai-ico" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><Icon name="leaf" size={14} /></div>
                  <div className="ai-t"><b>{a.employeeName}</b><span>{a.typeName} · {a.fromDate} → {a.toDate}</span></div>
                  <button onClick={() => decide(a.id, true)} className="bdg-s jade" style={{ border: '1px solid rgba(52,211,184,.3)', cursor: 'pointer', padding: '5px 9px' }}>Duyệt</button>
                </div>
              ))}
            </div>
          </aside>
          </div>
        )}
        <div style={{ height: 14 }} />
      </div>

      {/* Forms — .sheet thống nhất */}
      {sheet && (
        <div className="sh-scrim" onClick={() => setSheet('')}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head">
              <div className="sh-ico" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="users" size={18} /></div>
              <b style={{ fontSize: 15 }}>{sheet === 'emp' ? 'Thêm nhân viên' : sheet === 'shift' ? 'Tạo ca làm' : 'Nộp đơn xin nghỉ'}</b>
              <button className="sh-x" onClick={() => setSheet('')}><Icon name="x" size={15} /></button>
            </div>
            {sheet === 'emp' && (
              <div style={{ display: 'grid', gap: 9 }}>
                <input value={empNm} onChange={(e) => setEmpNm(e.target.value)} placeholder="Họ tên nhân viên…" className="inp" autoFocus />
                <input value={empRole} onChange={(e) => setEmpRole(e.target.value)} placeholder="Chức danh (mặc định: Nhân viên)" className="inp" />
                <button onClick={addEmp} className="btn-p" style={{ opacity: empNm.trim() ? 1 : .5 }}><Icon name="plus" size={15} /> Thêm nhân viên</button>
              </div>
            )}
            {sheet === 'shift' && (
              <div style={{ display: 'grid', gap: 9 }}>
                <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Tên ca (vd: Ca Tối)" className="inp" autoFocus />
                <input type="date" value={dt} onChange={(e) => setDt(e.target.value)} className="inp" />
                <div style={{ display: 'flex', gap: 9 }}>
                  <input type="time" value={t1} onChange={(e) => setT1(e.target.value)} className="inp" style={{ flex: 1 }} />
                  <input type="time" value={t2} onChange={(e) => setT2(e.target.value)} className="inp" style={{ flex: 1 }} />
                </div>
                <button onClick={addShift} className="btn-p" style={{ opacity: nm.trim() ? 1 : .5 }}><Icon name="plus" size={15} /> Tạo ca</button>
              </div>
            )}
            {sheet === 'leave' && (
              <div style={{ display: 'grid', gap: 9 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                  <select value={lvEmp} onChange={(e) => setLvEmp(e.target.value)} className="inp">
                    <option value="">Chọn nhân viên…</option>
                    {emps?.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                  <select value={lvType} onChange={(e) => setLvType(e.target.value)} className="inp">
                    <option value="">Loại phép…</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                  <input type="date" value={lvFrom} onChange={(e) => setLvFrom(e.target.value)} className="inp" />
                  <input type="date" value={lvTo} onChange={(e) => setLvTo(e.target.value)} className="inp" />
                </div>
                <input value={lvWhy} onChange={(e) => setLvWhy(e.target.value)} placeholder="Lý do (tuỳ chọn)" className="inp" />
                <button onClick={applyLv} className="btn-p" style={{ opacity: lvEmp && lvType ? 1 : .5 }}>Nộp đơn xin nghỉ</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
