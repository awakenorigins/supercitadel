'use client';
// Soul-Manager (Nhân sự) — FE page. Nối API /api/v1/soul-manager/* (đã có backend R11.3).
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

interface Emp { code: string; full_name: string; status: string; hire_date: string; base_salary: string; department: string | null; position: string | null }
interface Dept { id: string; code: string; name: string; headcount: number; children?: Dept[] }
interface OrgChart { total_headcount: number; unassigned: number; departments: Dept[] }
interface LeaveBal { leave_type: string; name: string; entitled: string; used: string; remaining: string }
interface LeaveResp { employee_code: string; full_name: string; year: number; balances: LeaveBal[] }
interface Headcount { active_headcount: number; by_status: Array<{ status: string; count: number }>; by_department: Array<{ department: string; count: number }> }

const today = () => new Date().toISOString().slice(0, 10);
const vnd = (s: string | number) => Number(s).toLocaleString('vi-VN');
const statusLabel: Record<string, string> = { probation: 'Thử việc', active: 'Chính thức', on_leave: 'Nghỉ phép', terminated: 'Đã nghỉ' };

const inputSt: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 12, padding: '11px 13px', color: 'var(--txt)', fontSize: 14, width: '100%', outline: 'none' };

export default function SoulManagerPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'nv' | 'org' | 'phep' | 'luong'>('nv');
  const [locked, setLocked] = useState(false);
  const [emps, setEmps] = useState<Emp[] | null>(null);
  const [org, setOrg] = useState<OrgChart | null>(null);
  const [head, setHead] = useState<Headcount | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [sheet, setSheet] = useState<'' | 'emp'>('');
  const [busy, setBusy] = useState('');

  const gate = (e: any) => { if (/kích hoạt|hết hạn thuê|INACTIVE|RENT_EXPIRED/i.test(String(e.message))) setLocked(true); };
  const P = '/api/v1/soul-manager';

  const loadAll = useCallback(() => {
    api<{ employees: Emp[] }>(`${P}/employees`).then((d) => { setEmps(d.employees); setLocked(false); }).catch(gate);
    api<OrgChart>(`${P}/org/chart`).then(setOrg).catch(gate);
    api<Headcount>(`${P}/report/headcount`).then(setHead).catch(() => {});
  }, []);
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } loadAll(); }, [router, loadAll]);

  // ── Thêm nhân viên ──
  const [fn, setFn] = useState(''); const [dep, setDep] = useState(''); const [pos, setPos] = useState('');
  const [hd, setHd] = useState(today()); const [sal, setSal] = useState('');
  async function addEmp() {
    if (!fn.trim()) { setMsg({ t: 'Nhập tên nhân viên trước đã', ok: false }); return; }
    setBusy('emp'); setMsg(null);
    try {
      await api(`${P}/employees`, { method: 'POST', body: JSON.stringify({ full_name: fn, department: dep || undefined, position: pos || undefined, hire_date: hd, base_salary: sal || '0' }) });
      setFn(''); setDep(''); setPos(''); setSal(''); setSheet(''); setMsg({ t: 'Đã thêm nhân viên', ok: true }); loadAll();
    } catch (e: any) { setMsg({ t: e.message ?? 'Không thêm được', ok: false }); } finally { setBusy(''); }
  }

  // ── Số dư phép theo NV ──
  const [leaveCode, setLeaveCode] = useState('');
  const [leave, setLeave] = useState<LeaveResp | null>(null);
  async function loadLeave(code: string) {
    if (!code) return;
    setBusy('leave'); setMsg(null);
    try { setLeave(await api<LeaveResp>(`${P}/leave/balance?employee_code=${encodeURIComponent(code)}`)); }
    catch (e: any) { setMsg({ t: e.message ?? 'Không xem được số dư phép', ok: false }); setLeave(null); } finally { setBusy(''); }
  }

  // ── Chạy lương ──
  const [py, setPy] = useState(new Date().getFullYear()); const [pm, setPm] = useState(new Date().getMonth() + 1);
  const [payroll, setPayroll] = useState<any>(null);
  async function runPayroll() {
    setBusy('pay'); setMsg(null);
    try {
      const d = await api<any>(`${P}/payroll/run`, { method: 'POST', body: JSON.stringify({ year: py, month: pm }) });
      setPayroll(d); setMsg({ t: `Đã chạy lương kỳ ${pm}/${py}`, ok: true });
    } catch (e: any) { setMsg({ t: e.message ?? 'Không chạy được lương', ok: false }); } finally { setBusy(''); }
  }

  if (locked) return <Shell><ModuleLocked name="Soul-Manager — Nhân sự" id="soul-manager" /></Shell>;

  const tabs: Array<{ k: typeof tab; label: string; icon: string }> = [
    { k: 'nv', label: 'Nhân viên', icon: 'users' },
    { k: 'org', label: 'Tổ chức', icon: 'bank' },
    { k: 'phep', label: 'Nghỉ phép', icon: 'clock' },
    { k: 'luong', label: 'Bảng lương', icon: 'coin' },
  ];

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Nhân sự</div><h1>Soul-Manager</h1></div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 20px 0', flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={tab === t.k ? 'btn-p' : 'chip'} style={{ width: 'auto', padding: '8px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name={t.icon} size={15} />{t.label}
            </button>
          ))}
        </div>

        {msg && <div style={{ margin: '12px 20px 0', padding: '9px 12px', borderRadius: 11, fontSize: 12.5, background: msg.ok ? 'var(--jade-soft)' : 'rgba(236,106,133,.14)', color: msg.ok ? 'var(--jade)' : 'var(--rose)' }}>{msg.t}</div>}

        {/* ── NHÂN VIÊN ── */}
        {tab === 'nv' && (
          <div style={{ margin: '16px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div className="mut" style={{ fontSize: 12.5, flex: 1 }}>{emps ? `${emps.length} nhân viên` : 'Đang tải…'}</div>
              <button className="btn-p" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={() => setSheet('emp')}>+ Thêm nhân viên</button>
            </div>
            {!emps ? <div className="mut" style={{ fontSize: 13 }}>Đang tải…</div> : emps.length === 0 ? <EmptyState icon="users" title="Chưa có nhân viên" sub="Bấm + Thêm nhân viên để bắt đầu" /> : (
              <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
                {emps.map((e, i) => (
                  <div key={e.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < emps.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div className="ava mint" style={{ width: 38, height: 38, borderRadius: 12 }}>{e.full_name.slice(0, 1)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{e.full_name}</div>
                      <div className="mut" style={{ fontSize: 11.5 }}>{e.code} · {e.position ?? '—'}{e.department ? ' · ' + e.department : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontSize: 12.5 }}>{vnd(e.base_salary)}đ</div>
                      <span className="chip" style={{ fontSize: 10.5, padding: '2px 8px' }}>{statusLabel[e.status] ?? e.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TỔ CHỨC ── */}
        {tab === 'org' && (
          <div style={{ margin: '16px 20px 0' }}>
            {!org ? <div className="mut" style={{ fontSize: 13 }}>Đang tải…</div> : (
              <>
                <div className="card" style={{ borderRadius: 16, padding: 16, display: 'flex', gap: 20, marginBottom: 12 }}>
                  <div><div className="mut" style={{ fontSize: 11.5 }}>Tổng nhân sự</div><div style={{ fontSize: 24, fontWeight: 700 }}>{org.total_headcount}</div></div>
                  <div><div className="mut" style={{ fontSize: 11.5 }}>Chưa phân bổ</div><div style={{ fontSize: 24, fontWeight: 700 }}>{org.unassigned}</div></div>
                  <div><div className="mut" style={{ fontSize: 11.5 }}>Phòng ban</div><div style={{ fontSize: 24, fontWeight: 700 }}>{org.departments.length}</div></div>
                </div>
                {org.departments.length === 0 ? <EmptyState icon="bank" title="Chưa có phòng ban" sub="Thêm nhân viên kèm phòng ban để tạo tự động" /> : (
                  <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
                    {org.departments.map((d, i) => (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < org.departments.length - 1 ? '1px solid var(--line)' : 'none' }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--amber-soft)', color: 'var(--amber)', display: 'grid', placeItems: 'center' }}><Icon name="bank" size={16} /></div>
                        <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div><div className="mut" style={{ fontSize: 11.5 }}>{d.code}</div></div>
                        <span className="mono" style={{ fontSize: 13, color: 'var(--jade)' }}>{d.headcount} người</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── NGHỈ PHÉP ── */}
        {tab === 'phep' && (
          <div style={{ margin: '16px 20px 0' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input style={inputSt} placeholder="Mã NV (vd NV0001)" value={leaveCode} onChange={(e) => setLeaveCode(e.target.value)} />
              <button className="btn-p" style={{ width: 'auto', padding: '0 18px', fontSize: 13 }} disabled={busy === 'leave'} onClick={() => loadLeave(leaveCode.trim())}>Xem</button>
            </div>
            {leave && (
              <div className="card" style={{ borderRadius: 16, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>{leave.full_name} · {leave.year}</div>
                {leave.balances.map((b) => (
                  <div key={b.leave_type} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1 }}>{b.name}</div>
                    <span className="mono" style={{ fontSize: 13 }}>Còn <b style={{ color: 'var(--jade)' }}>{b.remaining}</b> / {b.entitled} ngày</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── BẢNG LƯƠNG ── */}
        {tab === 'luong' && (
          <div style={{ margin: '16px 20px 0' }}>
            <div className="card" style={{ borderRadius: 16, padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inputSt} type="number" value={pm} onChange={(e) => setPm(Number(e.target.value))} placeholder="Tháng" />
                <input style={inputSt} type="number" value={py} onChange={(e) => setPy(Number(e.target.value))} placeholder="Năm" />
                <button className="btn-p" style={{ width: 'auto', padding: '0 18px', fontSize: 13 }} disabled={busy === 'pay'} onClick={runPayroll}>{busy === 'pay' ? 'Đang chạy…' : 'Chạy lương'}</button>
              </div>
              <div className="mut" style={{ fontSize: 11.5 }}>Tính lương cả kỳ: ngày công, OT, BHXH/BHYT/BHTN, thuế TNCN lũy tiến, thực nhận. Cần bảo mật lớp 2.</div>
            </div>
            {payroll && (
              <div className="card" style={{ borderRadius: 16, padding: 16, marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Kết quả kỳ {payroll.month}/{payroll.year}</div>
                <div className="mut" style={{ fontSize: 13 }}>Số NV: {payroll.employees ?? '—'} · Tổng gross: {payroll.total_gross ? vnd(payroll.total_gross) + 'đ' : '—'} · Tổng net: {payroll.total_net ? vnd(payroll.total_net) + 'đ' : '—'}</div>
              </div>
            )}
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>

      {/* ── Sheet thêm nhân viên ── */}
      {sheet === 'emp' && (
        <div className="sheet-bg" onClick={() => setSheet('')} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'end center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', padding: 18, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}><b style={{ flex: 1, fontSize: 16 }}>Thêm nhân viên</b><button className="chip" onClick={() => setSheet('')}>Đóng</button></div>
            <input style={inputSt} placeholder="Họ tên *" value={fn} onChange={(e) => setFn(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={inputSt} placeholder="Phòng ban" value={dep} onChange={(e) => setDep(e.target.value)} />
              <input style={inputSt} placeholder="Chức danh" value={pos} onChange={(e) => setPos(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={inputSt} type="date" value={hd} onChange={(e) => setHd(e.target.value)} />
              <input style={inputSt} type="number" placeholder="Lương cơ bản" value={sal} onChange={(e) => setSal(e.target.value)} />
            </div>
            <button className="btn-p" disabled={busy === 'emp'} onClick={addEmp}>{busy === 'emp' ? 'Đang lưu…' : 'Lưu nhân viên'}</button>
          </div>
        </div>
      )}
    </Shell>
  );
}
