'use client';
// QLDN V1A — Quản Lý Doanh Nghiệp (lương 2 hệ + chấm công + chi lương + dự báo dòng tiền).
// Khuôn trang ke-toan-10a: Shell + ModuleLocked + CSS token thuần, không UI lib.
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

interface Emp { id: string; codeOfficial: string | null; codeInternal: string | null; fullName: string; contractType: string; position: string | null; department: string | null; bankAccount: string | null; bankName: string | null; status: string }
interface Run { id: string; scheme: string; status: string; standardDays: string; createdAt: string }
interface Line { id: string; employeeId: string; gross: string; pit: string; insuranceEmployee: string; netPay: string }
interface Ts { id: string; employeeId: string; workDays: string; paidLeaveDays: string; ot150Hours: string; ot170Hours: string; ot200Hours: string; source: string }
interface FcLine { id: string; docNo: string | null; docType: string; dueDate: string; description: string | null; inflow: number; outflow: number; runningBalance: number }
interface Fc { openingBalance: number; closingBalance: number; totals: { inflow: number; outflow: number }; lines: FcLine[] }

const vnd = (n: number | string) => Math.round(Number(n)).toLocaleString('vi-VN');
const nowPeriod = () => new Date().toISOString().slice(0, 7);
const RUN_VN: Record<string, string> = { draft: 'Nháp', calculated: 'Đã tính — chờ duyệt', approved: 'Đã duyệt', paid: 'Đã chi' };
const RUN_BDG: Record<string, string> = { draft: 'mut', calculated: 'amber', approved: 'jade', paid: 'sky' };
const CT_VN: Record<string, string> = { HDLD: 'HĐLĐ', HDTV: 'HĐTV', CTV: 'CTV' };

export default function QldnPage() {
  const router = useRouter();
  const B = '/api/v1/qldn';
  const [tab, setTab] = useState<'tq' | 'nv' | 'cc' | 'bl' | 'db'>('tq');
  const [locked, setLocked] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 6000); };

  const [period, setPeriod] = useState(nowPeriod());
  const [emps, setEmps] = useState<Emp[] | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [tsRows, setTsRows] = useState<Ts[] | null>(null);
  const [fc, setFc] = useState<Fc | null>(null);

  const load = useCallback(async () => {
    try {
      await api(`${B}/health`);
      setLocked(false);
      api<{ employees: Emp[] }>(`${B}/employees`).then((d) => setEmps(d.employees)).catch(() => {});
      api<{ runs: Run[] }>(`${B}/payroll/runs?period=${period}`).then(async (d) => {
        setRuns(d.runs);
        const m: Record<string, Line[]> = {};
        for (const r of d.runs) {
          try { m[r.id] = (await api<{ lines: Line[] }>(`${B}/payroll/runs/${r.id}/lines`)).lines; } catch { /* skip */ }
        }
        setLines(m);
      }).catch(() => {});
      api<{ timesheets: Ts[] }>(`${B}/timesheets?period=${period}`).then((d) => setTsRows(d.timesheets)).catch(() => setTsRows([]));
      api<Fc>(`${B}/forecast`).then(setFc).catch(() => {});
    } catch (e: any) { if (/kích hoạt|hết hạn thuê/.test(String(e.message))) setLocked(true); }
  }, [period]);
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router, load]);

  const empOf = (id: string) => emps?.find((e) => e.id === id);
  const runNet = (r: Run) => (lines[r.id] ?? []).reduce((s, l) => s + Number(l.netPay), 0);
  const fundTotal = (runs ?? []).reduce((s, r) => s + runNet(r), 0);

  /* ── Actions ── */
  async function upload(url: string, fields: Record<string, string>, file: File, extra?: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, file, v || file.name);
    for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
    return api(url, { method: 'POST', body: fd });
  }
  async function importEmployees(kind: 'official' | 'internal', file: File | null) {
    if (!file) return;
    try {
      const r: any = await upload(`${B}/employees/import`, { [kind]: file.name }, file);
      flash(`Import NV: +${r.result.created} mới · ${r.result.updated} cập nhật · ${r.result.profilesCreated} hồ sơ lương`);
      load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function importBcc(source: 'official' | 'internal', file: File | null) {
    if (!file) return;
    try {
      const r: any = await upload(`${B}/timesheets/import`, { file: file.name }, file, { source });
      flash(`Import BCC ${r.result.periodCode}: ${r.result.created + r.result.updated} NV, ${r.result.dayRows} dòng ngày${r.result.unmatched.length ? ` · ${r.result.unmatched.length} chưa khớp` : ''}`);
      load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function runPayroll(scheme: 'OFFICIAL' | 'INTERNAL') {
    try {
      const r: any = await api(`${B}/payroll/runs`, { method: 'POST', body: JSON.stringify({ period, scheme }) });
      const c: any = await api(`${B}/payroll/runs/${r.run.id}/calculate`, { method: 'POST' });
      flash(`Đã tính bảng lương ${scheme} ${period}: ${c.result.lines} NV · thực lĩnh ${vnd(c.result.totals.netPay)}₫ — chờ duyệt`);
      load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function approve(runId: string) {
    if (!window.confirm('Duyệt bảng lương này? Sau duyệt sẽ phát bút toán sang Kế Toán 10A.')) return;
    try { await api(`${B}/payroll/runs/${runId}/approve`, { method: 'POST' }); flash('Đã duyệt bảng lương ✓'); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function payout(runId: string) {
    try {
      const r: any = await api(`${B}/payouts`, { method: 'POST', body: JSON.stringify({ runId }) });
      await api(`${B}/payroll/runs/${runId}/payslips`, { method: 'POST' }).catch(() => {});
      flash(`Batch chi lương: ${r.summary.lines} NV · ${vnd(r.summary.totalAmount)}₫${r.summary.missingBank ? ` · ${r.summary.missingBank} NV chưa có STK` : ''} + đã phát phiếu lương`);
      load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function importForecast(file: File | null) {
    if (!file) return;
    try {
      const r: any = await upload(`${B}/forecast/import`, { file: file.name }, file);
      flash(`Import dự báo: ${r.result.created} dòng · tồn đầu ${vnd(r.result.openingBalance)}₫`);
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  if (locked) return <Shell><ModuleLocked name="Quản Lý Doanh Nghiệp V1A" id="qldn" /></Shell>;

  const FilePick = ({ label, onPick }: { label: string; onPick: (f: File | null) => void }) => (
    <label className="btn-s" style={{ cursor: 'pointer' }}>
      {label}
      <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </label>
  );

  return (
    <Shell wide>
      <div className="biz-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>Quản Lý Doanh Nghiệp</h1>
          <span className="chip chip-sky">V1A</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="mut" style={{ fontSize: 13 }}>Kỳ</span>
            <input className="inp" style={{ width: 110 }} value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="YYYY-MM" />
          </span>
        </div>
        {msg && <div className={`card ${msg.ok ? '' : 'card-danger'}`} style={{ padding: '8px 12px', margin: '8px 0' }}>{msg.t}</div>}

        <div className="tabbar" style={{ margin: '10px 0' }}>
          {([['tq', 'Tổng quan'], ['nv', 'Nhân viên'], ['cc', 'Chấm công'], ['bl', 'Bảng lương'], ['db', 'Dự báo']] as const).map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? 'tab-on' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'tq' && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <div className="card"><div className="mut">Quỹ lương kỳ {period}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{vnd(fundTotal)}₫</div><div className="mut" style={{ fontSize: 12 }}>{(runs ?? []).length} bảng lương</div></div>
            <div className="card"><div className="mut">Nhân viên active</div><div style={{ fontSize: 24, fontWeight: 800 }}>{emps ? emps.filter((e) => e.status === 'active').length : '—'}</div><div className="mut" style={{ fontSize: 12 }}>{emps?.length ?? 0} tổng hồ sơ</div></div>
            <div className="card"><div className="mut">Đã chấm công kỳ này</div><div style={{ fontSize: 24, fontWeight: 800 }}>{tsRows?.length ?? '—'}</div><div className="mut" style={{ fontSize: 12 }}>timesheet</div></div>
            <div className="card"><div className="mut">Tồn quỹ dự báo</div><div style={{ fontSize: 24, fontWeight: 800 }}>{fc ? `${vnd(fc.closingBalance)}₫` : '—'}</div><div className="mut" style={{ fontSize: 12 }}>{fc ? `${fc.lines.length} dòng · thu ${vnd(fc.totals.inflow)} / chi ${vnd(fc.totals.outflow)}` : 'chưa import'}</div></div>
          </div>
        )}

        {tab === 'nv' && (
          <div className="card">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <FilePick label="⬆ Import file lương chính thức (Bảng thông tin)" onPick={(f) => importEmployees('official', f)} />
              <FilePick label="⬆ Import file LUONGNB (NHÂN SỰ)" onPick={(f) => importEmployees('internal', f)} />
            </div>
            {!emps?.length ? <EmptyState icon="user" title="Chưa có nhân viên" sub="Import 2 file Excel lương để nạp hồ sơ mã kép." /> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>Mã CT</th><th>Mã NB</th><th>Họ tên</th><th>HĐ</th><th>Chức vụ</th><th>Phòng ban</th><th>Ngân hàng</th></tr></thead>
                  <tbody>{emps.map((e) => (
                    <tr key={e.id}>
                      <td>{e.codeOfficial ?? '—'}</td><td>{e.codeInternal ?? '—'}</td>
                      <td>{e.fullName}</td><td><span className="chip chip-mut">{CT_VN[e.contractType] ?? e.contractType}</span></td>
                      <td>{e.position ?? ''}</td><td>{e.department ?? ''}</td>
                      <td className="mut" style={{ fontSize: 12 }}>{e.bankAccount ? `${e.bankAccount} · ${e.bankName ?? ''}` : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'cc' && (
          <div className="card">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <FilePick label="⬆ Import BCC chính thức (ký hiệu ngày)" onPick={(f) => importBcc('official', f)} />
              <FilePick label="⬆ Import BCC nội bộ (giờ máy)" onPick={(f) => importBcc('internal', f)} />
            </div>
            {!tsRows?.length ? <EmptyState icon="clock" title={`Kỳ ${period} chưa có chấm công`} sub="Upload file BCC Excel để nạp." /> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>Nhân viên</th><th>Công</th><th>Phép</th><th>OT 150%</th><th>OT 170%</th><th>OT 200%</th><th>Nguồn</th></tr></thead>
                  <tbody>{tsRows.map((t) => {
                    const e = empOf(t.employeeId);
                    return (
                      <tr key={t.id}>
                        <td>{e ? `${e.codeOfficial ?? e.codeInternal ?? ''} ${e.fullName}` : t.employeeId.slice(0, 8)}</td>
                        <td>{Number(t.workDays)}</td><td>{Number(t.paidLeaveDays)}</td>
                        <td>{Number(t.ot150Hours)}h</td><td>{Number(t.ot170Hours)}h</td><td>{Number(t.ot200Hours)}h</td>
                        <td><span className="chip chip-mut">{t.source}</span></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'bl' && (
          <div className="card">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <button className="btn-p" onClick={() => runPayroll('OFFICIAL')}>▶ Chạy lương CHÍNH THỨC {period}</button>
              <button className="btn-s" onClick={() => runPayroll('INTERNAL')}>▶ Chạy lương NỘI BỘ {period}</button>
            </div>
            {!runs?.length ? <EmptyState icon="coin" title={`Kỳ ${period} chưa có bảng lương`} sub="Cần chấm công + hồ sơ lương trước khi chạy." /> : runs.map((r) => (
              <div key={r.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b>{r.scheme === 'OFFICIAL' ? 'Hệ chính thức (BHXH/thuế)' : 'Hệ nội bộ (doanh số)'}</b>
                  <span className={`chip chip-${RUN_BDG[r.status] ?? 'mut'}`}>{RUN_VN[r.status] ?? r.status}</span>
                  <span className="mut">· {(lines[r.id] ?? []).length} NV · thực lĩnh <b>{vnd(runNet(r))}₫</b></span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {r.status === 'calculated' && <button className="btn-p" onClick={() => approve(r.id)}>✔ Duyệt</button>}
                    {(r.status === 'approved' || r.status === 'paid') && <button className="btn-s" onClick={() => payout(r.id)}>🏦 Batch chi lương + phiếu lương</button>}
                  </span>
                </div>
                {!!(lines[r.id] ?? []).length && (
                  <div style={{ overflowX: 'auto', marginTop: 8 }}>
                    <table className="tbl">
                      <thead><tr><th>Nhân viên</th><th>Gross</th><th>BH NLĐ</th><th>Thuế TNCN</th><th>Thực lĩnh</th></tr></thead>
                      <tbody>{(lines[r.id] ?? []).map((l) => {
                        const e = empOf(l.employeeId);
                        return (
                          <tr key={l.id}>
                            <td>{e ? `${e.codeOfficial ?? e.codeInternal ?? ''} ${e.fullName}` : l.employeeId.slice(0, 8)}</td>
                            <td>{vnd(l.gross)}</td><td>{vnd(l.insuranceEmployee)}</td><td>{vnd(l.pit)}</td>
                            <td><b>{vnd(l.netPay)}₫</b></td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'db' && (
          <div className="card">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              <FilePick label="⬆ Import file dự báo thu-chi công nợ" onPick={(f) => importForecast(f)} />
              {fc && <span className="mut" style={{ marginLeft: 'auto' }}>Tồn đầu {vnd(fc.openingBalance)}₫ → <b>Tồn cuối {vnd(fc.closingBalance)}₫</b></span>}
            </div>
            {!fc?.lines.length ? <EmptyState icon="coin" title="Chưa có dự báo dòng tiền" sub="Upload file DU_BAO Excel hoặc thêm dòng qua API." /> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>Hạn TT</th><th>Số CT</th><th>Loại</th><th>Diễn giải</th><th>Thu</th><th>Chi</th><th>Tồn</th></tr></thead>
                  <tbody>{fc.lines.slice(-60).map((l) => (
                    <tr key={l.id}>
                      <td>{l.dueDate}</td><td>{l.docNo ?? ''}</td>
                      <td><span className={`chip chip-${l.docType === 'AR' ? 'jade' : l.docType === 'AP' ? 'amber' : 'mut'}`}>{l.docType}</span></td>
                      <td className="mut" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description ?? ''}</td>
                      <td>{l.inflow ? vnd(l.inflow) : ''}</td><td>{l.outflow ? vnd(l.outflow) : ''}</td>
                      <td><b>{vnd(l.runningBalance)}</b></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
