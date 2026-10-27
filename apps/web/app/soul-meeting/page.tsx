'use client';
// Soul-Meeting 1A — Cuộc Họp. CSS token thuần + Shell/ModuleLocked có sẵn (khuôn trang soul-wallet).
// Copy vào: apps/web/app/soul-meeting/page.tsx · Sau khi copy chạy: pnpm --filter @citadel/web typecheck
import { useState, useEffect, useCallback } from 'react';
import { Shell } from '../../components/Shell';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

const B = '/api/v1/soul-meeting';
const vnd = (n: number | string) => Math.round(Number(n)).toLocaleString('vi-VN');
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const dmy = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const todayIso = () => new Date().toISOString().slice(0, 10);

// ── Types (mirror payload API) ──────────────────────────────────────────────
interface Mtg { id: string; title: string; status: string; startAt: string; endAt: string; location: string | null; onlineLink: string | null; agendaPublished: boolean; chairUserId: string | null; secretaryUserId: string | null; typeId: string | null }
interface WeekDay { date: string; meetings: Array<{ id: string; title: string; status: string; start_at: string; end_at: string; location: string | null; agenda_published: boolean }> }
interface Part { id: string; userId: string | null; externalName: string | null; role: string; rsvp: string; attendance: string; voteWeight: string; required: boolean }
interface Ag { id: string; title: string; status: string; sortOrder: number; timeboxMinutes: number | null; source: string; detail: string | null }
interface Doc { id: string; name: string; kind: string; requiresRead: boolean; fileRef: string }
interface Chk { id: string; title: string; doneAt: string | null; doneBy: string | null }
interface Note { id: string; content: string; authorUserId: string; agendaItemId: string | null }
interface Detail { meeting: Mtg; participants: Part[]; agenda: Ag[]; documents: Doc[]; checklist: Chk[] }
interface ReadSt { document_id: string; name: string; read_count: number; unread_user_ids: string[] }
interface Act { id: string; title: string; status: string; ownerUserId: string | null; externalOwner: string | null; dueDate: string | null; priority: string; meetingId: string | null }
interface Vote { id: string; question: string; status: string; quorumMode: string; result: null | { quorum_met: boolean; pass_metric: number; passed: boolean; present_weight: number; invalid_count: number } }
interface Dec { id: string; content: string; method: string; voteId: string | null; decidedAt: string }
interface Minu { id: string; version: number; status: string; contentMd: string; rejectedReason: string | null; approvedAt: string | null }
interface Kpi { meetings: { total: number; completed: number; cancelled: number; total_minutes: number; on_time_start_pct: number; attendance_rate_pct: number; minutes_published_pct: number; avg_feedback: number | null }; actions: { created: number; done: number; completion_pct: number; overdue_open_now: number }; cost: { total_vnd: number } }
interface Digest { upcoming_meetings: Array<{ id: string; title: string; start_at: string; agenda_published: boolean }>; my_open_actions: Array<{ id: string; title: string; due_date: string | null; overdue: boolean; priority: string }>; overdue_count: number }
interface Settings { hourlyCost: string; costEnabled: boolean; hygieneRequireAgenda: boolean; remindHours1: number; remindHours2: number; audioRetentionDays: number; asrEngine: string }
interface MType { id: string; name: string; description: string | null; template: { agenda?: unknown[]; checklist?: unknown[]; quorum_mode?: string } }

const ST_VN: Record<string, string> = { draft: 'Nháp', scheduled: 'Đã lên lịch', in_progress: 'Đang họp', completed: 'Đã xong', cancelled: 'Đã hủy' };
const ST_CLR: Record<string, string> = { draft: 'var(--muted)', scheduled: 'var(--sky)', in_progress: 'var(--amber)', completed: 'var(--jade)', cancelled: '#f472b6' };
const ATT_VN: Record<string, string> = { none: '—', present: 'Có mặt', late: 'Muộn', absent: 'Vắng', absent_excused: 'Vắng phép' };
const AST_VN: Record<string, string> = { open: 'Đang mở', in_progress: 'Đang làm', done: 'Xong', cancelled: 'Hủy', carried_over: 'Chuyển kỳ' };

function Chip({ text, color }: { text: string; color: string }) {
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, border: `1px solid ${color}`, color }}>{text}</span>;
}
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, ...style }}>{children}</div>;
}
function Btn({ onClick, children, tone = 'default', small, href }: { onClick?: () => void; children: React.ReactNode; tone?: 'default' | 'primary' | 'danger'; small?: boolean; href?: string }) {
  const st: React.CSSProperties = {
    padding: small ? '4px 10px' : '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: small ? 12 : 13,
    border: '1px solid var(--line)', background: tone === 'primary' ? 'var(--jade)' : tone === 'danger' ? 'transparent' : 'var(--panel2)',
    color: tone === 'primary' ? '#06281e' : tone === 'danger' ? '#f472b6' : 'var(--ink)',
    borderColor: tone === 'danger' ? '#f472b6' : 'var(--line)', textDecoration: 'none', display: 'inline-block',
  };
  if (href) return <a href={href} style={st} target="_blank" rel="noreferrer">{children}</a>;
  return <button onClick={onClick} style={st}>{children}</button>;
}
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel2)', color: 'var(--ink)', fontSize: 13 };
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 };

export default function SoulMeetingPage() {
  const me = getSession()?.user?.id ?? '';
  const [tab, setTab] = useState<'tuan' | 'chuanbi' | 'viec' | 'bienban' | 'kpi' | 'cauhinh'>('tuan');
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState('');
  const [week, setWeek] = useState<{ week_start: string; days: WeekDay[] } | null>(null);
  const [weekOf, setWeekOf] = useState(todayIso());
  const [mid, setMid] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [readSt, setReadSt] = useState<ReadSt[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [acts, setActs] = useState<Act[]>([]);
  const [fOverdue, setFOverdue] = useState(false);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [decs, setDecs] = useState<Dec[]>([]);
  const [minus, setMinus] = useState<Minu[]>([]);
  const [mnEdit, setMnEdit] = useState<{ id: string; md: string } | null>(null);
  const [kpi, setKpi] = useState<Kpi | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [kFrom, setKFrom] = useState(todayIso().slice(0, 8) + '01');
  const [kTo, setKTo] = useState(todayIso());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [types, setTypes] = useState<MType[]>([]);
  const [fNew, setFNew] = useState({ title: '', type_id: '', date: todayIso(), from: '08:00', to: '09:00', chair: me, secretary: '', location: '' });
  const [fPart, setFPart] = useState({ user_id: '', external_name: '', role: 'attendee', weight: '0' });
  const [fAg, setFAg] = useState({ title: '', timebox: '' });
  const [fDoc, setFDoc] = useState({ name: '', file_ref: '', requires_read: true });
  const [fNote, setFNote] = useState('');
  const [fAct, setFAct] = useState({ title: '', owner: me, due: '', priority: 'normal' });
  const [fVote, setFVote] = useState({ question: '', mode: 'headcount', quorum: '50', pass: '50' });
  const [fDec, setFDec] = useState({ content: '', method: 'consensus', vote_id: '' });

  const guard = useCallback((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('MODULE_NOT_ENABLED') || msg.includes('403')) setLocked(true);
    else setErr(msg.slice(0, 300));
  }, []);

  const loadWeek = useCallback(async () => {
    try { setWeek((await api<{ data: { week_start: string; days: WeekDay[] } }>(`${B}/reports/week?week_of=${weekOf}`)).data); }
    catch (e) { guard(e); }
  }, [weekOf, guard]);
  const loadDetail = useCallback(async () => {
    if (!mid) return;
    try {
      setDetail((await api<{ data: Detail }>(`${B}/meetings/${mid}`)).data);
      setReadSt((await api<{ data: ReadSt[] }>(`${B}/meetings/${mid}/read-status`)).data);
      setNotes((await api<{ data: Note[] }>(`${B}/meetings/${mid}/notes`)).data);
      setVotes((await api<{ data: Vote[] }>(`${B}/meetings/${mid}/votes`)).data);
      setDecs((await api<{ data: Dec[] }>(`${B}/meetings/${mid}/decisions`)).data);
      setMinus((await api<{ data: Minu[] }>(`${B}/meetings/${mid}/minutes`)).data);
    } catch (e) { guard(e); }
  }, [mid, guard]);
  const loadActs = useCallback(async () => {
    try { setActs((await api<{ data: Act[] }>(`${B}/actions?limit=100${fOverdue ? '&overdue_only=true' : ''}`)).data); }
    catch (e) { guard(e); }
  }, [fOverdue, guard]);
  const loadKpi = useCallback(async () => {
    try {
      setKpi((await api<{ data: Kpi }>(`${B}/reports/kpi?from=${kFrom}&to=${kTo}`)).data);
      setDigest((await api<{ data: Digest }>(`${B}/reports/digest`)).data);
    } catch (e) { guard(e); }
  }, [kFrom, kTo, guard]);
  const loadCfg = useCallback(async () => {
    try {
      setSettings((await api<{ data: Settings }>(`${B}/settings`)).data);
      const t = await api<{ data: MType[] }>(`${B}/types`);
      if (t.data.length === 0) { await api(`${B}/types/seed`, { method: 'POST' }); setTypes((await api<{ data: MType[] }>(`${B}/types`)).data); }
      else setTypes(t.data);
    } catch (e) { guard(e); }
  }, [guard]);

  useEffect(() => { loadWeek(); loadCfg(); }, [loadWeek, loadCfg]);
  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { if (tab === 'viec') loadActs(); if (tab === 'kpi') loadKpi(); }, [tab, loadActs, loadKpi]);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setErr('');
    try { await fn(); (after ?? loadDetail)(); } catch (e) { guard(e); }
  };

  if (locked) return <Shell><ModuleLocked name="Soul-Meeting — Cuộc Họp" id="soul-meeting" /></Shell>;

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)} style={{
      padding: '8px 14px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
      border: '1px solid var(--line)', background: tab === id ? 'var(--jade)' : 'var(--panel)',
      color: tab === id ? '#06281e' : 'var(--ink)', fontWeight: tab === id ? 700 : 400,
    }}>{label}</button>
  );

  const m = detail?.meeting;
  const closedVotes = votes.filter((v) => v.status === 'closed');

  return (
    <Shell wide>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>🗓️ Soul-Meeting — Cuộc Họp</h1>
        {m && <Chip text={`Đang chọn: ${m.title}`} color="var(--sky)" />}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <TabBtn id="tuan" label="Tuần này" />
        <TabBtn id="chuanbi" label="Chuẩn bị & Điều hành" />
        <TabBtn id="viec" label="Việc cần làm" />
        <TabBtn id="bienban" label="Biên bản & Quyết định" />
        <TabBtn id="kpi" label="KPI" />
        <TabBtn id="cauhinh" label="Cấu hình" />
      </div>
      {err && <Card style={{ borderColor: '#f472b6', marginBottom: 12 }}><span style={{ color: '#f472b6', fontSize: 13 }}>⚠ {err}</span></Card>}

      {/* ══ TAB TUẦN ══ */}
      {tab === 'tuan' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <div><span style={lbl}>Tuần chứa ngày</span><input type="date" style={inp} value={weekOf} onChange={(e) => setWeekOf(e.target.value)} /></div>
              <Btn onClick={loadWeek}>Xem tuần</Btn>
            </div>
          </Card>
          <Card>
            <b style={{ fontSize: 14 }}>＋ Đặt lịch họp</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'end' }}>
              <div style={{ flex: '2 1 220px' }}><span style={lbl}>Tiêu đề</span><input style={{ ...inp, width: '100%' }} value={fNew.title} onChange={(e) => setFNew({ ...fNew, title: e.target.value })} /></div>
              <div><span style={lbl}>Loại họp</span><select style={inp} value={fNew.type_id} onChange={(e) => setFNew({ ...fNew, type_id: e.target.value })}><option value="">— tự do —</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div><span style={lbl}>Ngày</span><input type="date" style={inp} value={fNew.date} onChange={(e) => setFNew({ ...fNew, date: e.target.value })} /></div>
              <div><span style={lbl}>Từ</span><input type="time" style={inp} value={fNew.from} onChange={(e) => setFNew({ ...fNew, from: e.target.value })} /></div>
              <div><span style={lbl}>Đến</span><input type="time" style={inp} value={fNew.to} onChange={(e) => setFNew({ ...fNew, to: e.target.value })} /></div>
              <div><span style={lbl}>Chủ trì</span><input style={inp} value={fNew.chair} onChange={(e) => setFNew({ ...fNew, chair: e.target.value })} /></div>
              <div><span style={lbl}>Thư ký</span><input style={inp} value={fNew.secretary} onChange={(e) => setFNew({ ...fNew, secretary: e.target.value })} /></div>
              <div><span style={lbl}>Địa điểm/Link</span><input style={inp} value={fNew.location} onChange={(e) => setFNew({ ...fNew, location: e.target.value })} /></div>
              <Btn tone="primary" onClick={() => act(async () => {
                await api(`${B}/meetings`, { method: 'POST', body: JSON.stringify({
                  title: fNew.title, type_id: fNew.type_id || undefined, apply_template: !!fNew.type_id, status: 'scheduled',
                  start_at: `${fNew.date}T${fNew.from}:00+07:00`, end_at: `${fNew.date}T${fNew.to}:00+07:00`,
                  chair_user_id: fNew.chair || undefined, secretary_user_id: fNew.secretary || undefined, location: fNew.location || undefined,
                }) });
                setFNew({ ...fNew, title: '' });
              }, loadWeek)}>Đặt lịch</Btn>
            </div>
          </Card>
          {!week ? <EmptyState icon="calendar" title="Đang tải tuần…" sub="" /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {week.days.map((d, i) => (
                <Card key={d.date} style={{ minHeight: 120 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]} · {d.date.slice(5)}</div>
                  {d.meetings.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>—</div>}
                  {d.meetings.map((mt) => (
                    <div key={mt.id} onClick={() => { setMid(mt.id); setTab('chuanbi'); }} style={{ cursor: 'pointer', padding: 8, borderRadius: 8, background: 'var(--panel2)', marginBottom: 6, borderLeft: `3px solid ${ST_CLR[mt.status]}` }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{hhmm(mt.start_at)} {mt.title}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        <Chip text={ST_VN[mt.status] ?? mt.status} color={ST_CLR[mt.status] ?? 'var(--muted)'} />
                        {!mt.agenda_published && mt.status === 'scheduled' && <Chip text="chưa có agenda" color="#f472b6" />}
                      </div>
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB CHUẨN BỊ & ĐIỀU HÀNH ══ */}
      {tab === 'chuanbi' && (!m ? <EmptyState icon="calendar" title="Chưa chọn cuộc họp" sub="Sang tab Tuần này, bấm vào 1 cuộc họp." /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 15 }}>{m.title}</b>
              <Chip text={ST_VN[m.status] ?? m.status} color={ST_CLR[m.status] ?? 'var(--muted)'} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{dmy(m.startAt)} {hhmm(m.startAt)}–{hhmm(m.endAt)} · {m.location ?? m.onlineLink ?? '—'}</span>
              <span style={{ flex: 1 }} />
              {m.status === 'scheduled' && !m.agendaPublished && <Btn small onClick={() => act(() => api(`${B}/meetings/${m.id}/agenda/publish`, { method: 'POST' }))}>Publish agenda</Btn>}
              {(m.status === 'scheduled' || m.status === 'draft') && <Btn small tone="primary" onClick={() => act(() => api(`${B}/meetings/${m.id}/start`, { method: 'POST' }))}>▶ Bắt đầu</Btn>}
              {m.status === 'in_progress' && <Btn small tone="primary" onClick={() => act(() => api(`${B}/meetings/${m.id}/finish`, { method: 'POST' }))}>⏹ Kết thúc</Btn>}
              <Btn small href={`${B}/meetings/${m.id}/ics`}>📅 .ics</Btn>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            <Card>
              <b style={{ fontSize: 13 }}>👥 Người tham dự ({detail!.participants.length})</b>
              {detail!.participants.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
                  <span style={{ flex: 1 }}>{p.userId ?? p.externalName} <span style={{ color: 'var(--muted)' }}>({p.role}{Number(p.voteWeight) > 0 ? ` · ${Number(p.voteWeight)}% vốn` : ''})</span></span>
                  <Chip text={ATT_VN[p.attendance] ?? p.attendance} color={p.attendance === 'present' ? 'var(--jade)' : p.attendance === 'late' ? 'var(--amber)' : 'var(--muted)'} />
                  {(m.status === 'in_progress' || m.status === 'scheduled') && p.attendance === 'none' && (
                    <Btn small onClick={() => act(() => api(`${B}/participants/checkin`, { method: 'POST', body: JSON.stringify({ participant_id: p.id, late_grace_minutes: 5 }) }))}>Điểm danh</Btn>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                <div><span style={lbl}>User nội bộ</span><input style={{ ...inp, width: 110 }} value={fPart.user_id} onChange={(e) => setFPart({ ...fPart, user_id: e.target.value })} /></div>
                <div><span style={lbl}>hoặc Khách ngoài</span><input style={{ ...inp, width: 120 }} value={fPart.external_name} onChange={(e) => setFPart({ ...fPart, external_name: e.target.value })} /></div>
                <div><span style={lbl}>% vốn</span><input style={{ ...inp, width: 60 }} value={fPart.weight} onChange={(e) => setFPart({ ...fPart, weight: e.target.value })} /></div>
                <Btn small onClick={() => act(async () => {
                  await api(`${B}/participants`, { method: 'POST', body: JSON.stringify({
                    meeting_id: m.id, user_id: fPart.user_id || undefined, external_name: fPart.external_name || undefined,
                    role: 'attendee', required: true, vote_weight: Number(fPart.weight) || 0,
                  }) });
                  setFPart({ user_id: '', external_name: '', role: 'attendee', weight: '0' });
                })}>＋ Mời</Btn>
              </div>
            </Card>

            <Card>
              <b style={{ fontSize: 13 }}>📋 Agenda {m.agendaPublished ? '(đã publish)' : '(nháp)'}</b>
              {detail!.agenda.map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
                  <span>{a.status === 'done' ? '✅' : a.status === 'in_progress' ? '▶️' : a.status === 'skipped' ? '⏭' : '⬜'}</span>
                  <span style={{ flex: 1 }}>{a.title} {a.timeboxMinutes ? <span style={{ color: 'var(--muted)' }}>({a.timeboxMinutes}p)</span> : null}{a.source === 'carryover' && <Chip text="kỳ trước" color="var(--amber)" />}</span>
                  {m.status === 'in_progress' && a.status === 'pending' && <>
                    <Btn small onClick={() => act(() => api(`${B}/agenda/run`, { method: 'POST', body: JSON.stringify({ id: a.id, op: 'start' }) }))}>▶</Btn>
                    <Btn small onClick={() => act(() => api(`${B}/agenda/run`, { method: 'POST', body: JSON.stringify({ id: a.id, op: 'skip' }) }))}>⏭</Btn>
                  </>}
                  {m.status === 'in_progress' && a.status === 'in_progress' && <Btn small onClick={() => act(() => api(`${B}/agenda/run`, { method: 'POST', body: JSON.stringify({ id: a.id, op: 'stop' }) }))}>⏹</Btn>}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}><span style={lbl}>Mục mới{m.status === 'in_progress' ? ' (parking lot)' : ''}</span><input style={{ ...inp, width: '100%' }} value={fAg.title} onChange={(e) => setFAg({ ...fAg, title: e.target.value })} /></div>
                <div><span style={lbl}>Phút</span><input style={{ ...inp, width: 55 }} value={fAg.timebox} onChange={(e) => setFAg({ ...fAg, timebox: e.target.value })} /></div>
                <Btn small onClick={() => act(async () => {
                  await api(`${B}/agenda`, { method: 'POST', body: JSON.stringify({ meeting_id: m.id, title: fAg.title, timebox_minutes: fAg.timebox ? Number(fAg.timebox) : undefined, source: m.status === 'in_progress' ? 'parking_lot' : 'manual' }) });
                  setFAg({ title: '', timebox: '' });
                })}>＋</Btn>
              </div>
            </Card>

            <Card>
              <b style={{ fontSize: 13 }}>📎 Tài liệu & Ai chưa đọc</b>
              {detail!.documents.map((d) => {
                const rs = readSt.find((r) => r.document_id === d.id);
                return (
                  <div key={d.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ flex: 1 }}>{d.name} {d.requiresRead && <Chip text="bắt buộc đọc" color="var(--amber)" />}</span>
                      <Btn small onClick={() => act(() => api(`${B}/documents/read`, { method: 'POST', body: JSON.stringify({ document_id: d.id }) }))}>Tôi đã đọc</Btn>
                    </div>
                    {rs && rs.unread_user_ids.length > 0 && <div style={{ color: '#f472b6', marginTop: 3 }}>Chưa đọc: {rs.unread_user_ids.join(', ')}</div>}
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}><span style={lbl}>Tên tài liệu</span><input style={{ ...inp, width: '100%' }} value={fDoc.name} onChange={(e) => setFDoc({ ...fDoc, name: e.target.value })} /></div>
                <div style={{ flex: 1 }}><span style={lbl}>file_ref</span><input style={{ ...inp, width: '100%' }} value={fDoc.file_ref} onChange={(e) => setFDoc({ ...fDoc, file_ref: e.target.value })} /></div>
                <label style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={fDoc.requires_read} onChange={(e) => setFDoc({ ...fDoc, requires_read: e.target.checked })} />bắt buộc</label>
                <Btn small onClick={() => act(async () => {
                  await api(`${B}/documents`, { method: 'POST', body: JSON.stringify({ meeting_id: m.id, kind: 'pre_read', name: fDoc.name, file_ref: fDoc.file_ref || `files://${fDoc.name}`, requires_read: fDoc.requires_read }) });
                  setFDoc({ name: '', file_ref: '', requires_read: true });
                })}>＋</Btn>
              </div>
            </Card>

            <Card>
              <b style={{ fontSize: 13 }}>✅ Checklist & 📝 Ghi chú</b>
              {detail!.checklist.map((c) => (
                <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!c.doneAt} onChange={(e) => act(() => api(`${B}/checklist/toggle`, { method: 'POST', body: JSON.stringify({ id: c.id, done: e.target.checked }) }))} />
                  <span style={{ textDecoration: c.doneAt ? 'line-through' : 'none', color: c.doneAt ? 'var(--muted)' : 'var(--ink)' }}>{c.title}</span>
                </label>
              ))}
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8 }}>
                {notes.map((n) => <div key={n.id} style={{ fontSize: 12, padding: '4px 0' }}>• {n.content} <span style={{ color: 'var(--muted)' }}>— {n.authorUserId}</span></div>)}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input style={{ ...inp, flex: 1 }} placeholder="Ghi chú trong họp…" value={fNote} onChange={(e) => setFNote(e.target.value)} />
                  <Btn small onClick={() => act(async () => { await api(`${B}/notes`, { method: 'POST', body: JSON.stringify({ meeting_id: m.id, content: fNote }) }); setFNote(''); })}>＋</Btn>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ))}

      {/* ══ TAB VIỆC ══ */}
      {tab === 'viec' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={fOverdue} onChange={(e) => setFOverdue(e.target.checked)} />Chỉ việc QUÁ HẠN</label>
              <span style={{ flex: 1 }} />
              <Btn href={`${B}/actions/export.xlsx?limit=200${fOverdue ? '&overdue_only=true' : ''}`}>⬇ Xuất Excel</Btn>
            </div>
          </Card>
          <Card>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 200px' }}><span style={lbl}>Việc mới</span><input style={{ ...inp, width: '100%' }} value={fAct.title} onChange={(e) => setFAct({ ...fAct, title: e.target.value })} /></div>
              <div><span style={lbl}>Phụ trách</span><input style={{ ...inp, width: 110 }} value={fAct.owner} onChange={(e) => setFAct({ ...fAct, owner: e.target.value })} /></div>
              <div><span style={lbl}>Hạn</span><input type="date" style={inp} value={fAct.due} onChange={(e) => setFAct({ ...fAct, due: e.target.value })} /></div>
              <div><span style={lbl}>Ưu tiên</span><select style={inp} value={fAct.priority} onChange={(e) => setFAct({ ...fAct, priority: e.target.value })}><option value="low">Thấp</option><option value="normal">Thường</option><option value="high">Cao</option><option value="urgent">Gấp</option></select></div>
              <Btn tone="primary" onClick={() => act(async () => {
                await api(`${B}/actions`, { method: 'POST', body: JSON.stringify({ title: fAct.title, owner_user_id: fAct.owner || undefined, due_date: fAct.due || undefined, priority: fAct.priority, meeting_id: mid || undefined }) });
                setFAct({ ...fAct, title: '' });
              }, loadActs)}>＋ Giao việc</Btn>
            </div>
          </Card>
          {acts.length === 0 ? <EmptyState icon="check" title="Không có việc" sub={fOverdue ? 'Không có việc quá hạn — ngon.' : 'Giao việc đầu tiên đi.'} /> : acts.map((a) => {
            const overdue = a.dueDate && a.dueDate < todayIso() && (a.status === 'open' || a.status === 'in_progress');
            return (
              <Card key={a.id} style={{ borderLeft: `3px solid ${overdue ? '#f472b6' : a.status === 'done' ? 'var(--jade)' : 'var(--line)'}` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                  <span style={{ flex: 1, textDecoration: a.status === 'done' ? 'line-through' : 'none' }}>{a.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>@{a.ownerUserId ?? a.externalOwner ?? '—'}</span>
                  {a.dueDate && <Chip text={`hạn ${a.dueDate}${overdue ? ' · QUÁ HẠN' : ''}`} color={overdue ? '#f472b6' : 'var(--muted)'} />}
                  <Chip text={AST_VN[a.status] ?? a.status} color={a.status === 'done' ? 'var(--jade)' : 'var(--sky)'} />
                  {(a.status === 'open' || a.status === 'in_progress') && <Btn small tone="primary" onClick={() => act(() => api(`${B}/actions/${a.id}/complete`, { method: 'POST', body: '{}' }), loadActs)}>✓ Xong</Btn>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ══ TAB BIÊN BẢN & QUYẾT ĐỊNH ══ */}
      {tab === 'bienban' && (!m ? <EmptyState icon="doc" title="Chưa chọn cuộc họp" sub="Sang tab Tuần này, bấm vào 1 cuộc họp." /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <b style={{ fontSize: 13 }}>🗳 Biểu quyết</b>
            {votes.map((v) => (
              <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 12, flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>{v.question} <span style={{ color: 'var(--muted)' }}>({v.quorumMode})</span></span>
                {v.status === 'open' ? <>
                  <Chip text="đang mở" color="var(--amber)" />
                  <Btn small onClick={() => act(() => api(`${B}/votes/close`, { method: 'POST', body: JSON.stringify({ vote_id: v.id }) }))}>Đóng & chốt</Btn>
                </> : v.result ? <Chip text={`${v.result.passed ? 'THÔNG QUA' : 'KHÔNG THÔNG QUA'} · ${v.result.pass_metric}%`} color={v.result.passed ? 'var(--jade)' : '#f472b6'} /> : null}
              </div>
            ))}
            {m.status === 'in_progress' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'end', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 200px' }}><span style={lbl}>Câu hỏi biểu quyết</span><input style={{ ...inp, width: '100%' }} value={fVote.question} onChange={(e) => setFVote({ ...fVote, question: e.target.value })} /></div>
                <div><span style={lbl}>Chế độ</span><select style={inp} value={fVote.mode} onChange={(e) => setFVote({ ...fVote, mode: e.target.value })}><option value="headcount">Đầu người</option><option value="capital_pct">% vốn (HĐTV)</option><option value="none">Không quorum</option></select></div>
                <div><span style={lbl}>Quorum %</span><input style={{ ...inp, width: 60 }} value={fVote.quorum} onChange={(e) => setFVote({ ...fVote, quorum: e.target.value })} /></div>
                <div><span style={lbl}>Pass %</span><input style={{ ...inp, width: 60 }} value={fVote.pass} onChange={(e) => setFVote({ ...fVote, pass: e.target.value })} /></div>
                <Btn small onClick={() => act(async () => {
                  await api(`${B}/votes`, { method: 'POST', body: JSON.stringify({ meeting_id: m.id, question: fVote.question, quorum_mode: fVote.mode, quorum_threshold: Number(fVote.quorum), pass_threshold: Number(fVote.pass), pass_basis: 'attending' }) });
                  setFVote({ ...fVote, question: '' });
                })}>Mở biểu quyết</Btn>
              </div>
            )}
          </Card>

          <Card>
            <b style={{ fontSize: 13 }}>⚖️ Quyết định</b>
            {decs.map((d, i) => <div key={d.id} style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>{i + 1}. {d.content} <span style={{ color: 'var(--muted)' }}>— {d.method}{d.voteId ? ' (theo biểu quyết)' : ''}</span></div>)}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'end', flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 200px' }}><span style={lbl}>Nội dung quyết định</span><input style={{ ...inp, width: '100%' }} value={fDec.content} onChange={(e) => setFDec({ ...fDec, content: e.target.value })} /></div>
              <div><span style={lbl}>Cách chốt</span><select style={inp} value={fDec.method} onChange={(e) => setFDec({ ...fDec, method: e.target.value })}><option value="consensus">Đồng thuận</option><option value="chair">Chủ tọa</option><option value="vote">Theo biểu quyết</option></select></div>
              {fDec.method === 'vote' && <div><span style={lbl}>Biểu quyết</span><select style={inp} value={fDec.vote_id} onChange={(e) => setFDec({ ...fDec, vote_id: e.target.value })}><option value="">— chọn —</option>{closedVotes.map((v) => <option key={v.id} value={v.id}>{v.question.slice(0, 40)}</option>)}</select></div>}
              <Btn small onClick={() => act(async () => {
                await api(`${B}/decisions`, { method: 'POST', body: JSON.stringify({ meeting_id: m.id, content: fDec.content, method: fDec.method, vote_id: fDec.method === 'vote' ? fDec.vote_id : undefined }) });
                setFDec({ content: '', method: 'consensus', vote_id: '' });
              })}>Ghi quyết định</Btn>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <b style={{ fontSize: 13, flex: 1 }}>📄 Biên bản (versioned · phát hành = bất biến)</b>
              {(m.status === 'in_progress' || m.status === 'completed') && <Btn small tone="primary" onClick={() => act(() => api(`${B}/minutes/generate`, { method: 'POST', body: JSON.stringify({ meeting_id: m.id }) }))}>＋ Sinh bản nháp</Btn>}
            </div>
            {minus.map((mn) => (
              <div key={mn.id} style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'var(--panel2)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 12 }}>v{mn.version}</b>
                  <Chip text={mn.status} color={mn.status === 'published' ? 'var(--jade)' : mn.status === 'rejected' ? '#f472b6' : 'var(--sky)'} />
                  {mn.rejectedReason && <span style={{ fontSize: 11, color: '#f472b6' }}>lý do: {mn.rejectedReason}</span>}
                  <span style={{ flex: 1 }} />
                  {(mn.status === 'draft' || mn.status === 'rejected') && <>
                    <Btn small onClick={() => setMnEdit(mnEdit?.id === mn.id ? null : { id: mn.id, md: mn.contentMd })}>{mnEdit?.id === mn.id ? 'Đóng sửa' : '✎ Sửa'}</Btn>
                    <Btn small onClick={() => act(() => api(`${B}/minutes/submit`, { method: 'POST', body: JSON.stringify({ id: mn.id }) }))}>Nộp duyệt</Btn>
                    <Btn small tone="primary" onClick={() => act(() => api(`${B}/minutes/publish`, { method: 'POST', body: JSON.stringify({ id: mn.id }) }))}>Phát hành</Btn>
                  </>}
                  {mn.status === 'pending_approval' && <>
                    <Btn small tone="primary" onClick={() => act(() => api(`${B}/minutes/approve`, { method: 'POST', body: JSON.stringify({ id: mn.id }) }))}>✓ Duyệt (chủ tọa)</Btn>
                    <Btn small tone="danger" onClick={() => act(() => api(`${B}/minutes/reject`, { method: 'POST', body: JSON.stringify({ id: mn.id, reason: 'Cần bổ sung' }) }))}>✗ Từ chối</Btn>
                    {mn.approvedAt && <Btn small tone="primary" onClick={() => act(() => api(`${B}/minutes/publish`, { method: 'POST', body: JSON.stringify({ id: mn.id }) }))}>Phát hành</Btn>}
                  </>}
                </div>
                {mnEdit?.id === mn.id ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea style={{ ...inp, width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 12 }} value={mnEdit.md} onChange={(e) => setMnEdit({ id: mn.id, md: e.target.value })} />
                    <Btn small tone="primary" onClick={() => act(async () => { await api(`${B}/minutes/update`, { method: 'POST', body: JSON.stringify({ id: mn.id, content_md: mnEdit.md }) }); setMnEdit(null); })}>Lưu</Btn>
                  </div>
                ) : (
                  <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 11, color: 'var(--muted)', maxHeight: 260, overflow: 'auto' }}>{mn.contentMd}</pre>
                )}
              </div>
            ))}
          </Card>
        </div>
      ))}

      {/* ══ TAB KPI ══ */}
      {tab === 'kpi' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <div><span style={lbl}>Từ</span><input type="date" style={inp} value={kFrom} onChange={(e) => setKFrom(e.target.value)} /></div>
              <div><span style={lbl}>Đến</span><input type="date" style={inp} value={kTo} onChange={(e) => setKTo(e.target.value)} /></div>
              <Btn onClick={loadKpi}>Xem KPI</Btn>
            </div>
          </Card>
          {kpi && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {[
                ['Họp hoàn tất', `${kpi.meetings.completed}/${kpi.meetings.total}`],
                ['Bắt đầu đúng giờ', `${kpi.meetings.on_time_start_pct}%`],
                ['Tỷ lệ điểm danh', `${kpi.meetings.attendance_rate_pct}%`],
                ['Biên bản phát hành', `${kpi.meetings.minutes_published_pct}%`],
                ['Đánh giá TB', kpi.meetings.avg_feedback !== null ? `${kpi.meetings.avg_feedback}/5` : '—'],
                ['Việc hoàn thành', `${kpi.actions.done}/${kpi.actions.created} (${kpi.actions.completion_pct}%)`],
                ['Việc quá hạn hiện tại', String(kpi.actions.overdue_open_now)],
                ['💸 Chi phí họp', `${vnd(kpi.cost.total_vnd)}đ`],
              ].map(([k, v]) => (
                <Card key={k as string}><div style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{v}</div></Card>
              ))}
            </div>
          )}
          {digest && (
            <Card>
              <b style={{ fontSize: 13 }}>🔔 Của tôi</b>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                {digest.upcoming_meetings.map((u) => <div key={u.id} style={{ padding: '3px 0' }}>📅 {dmy(u.start_at)} {hhmm(u.start_at)} — {u.title}{!u.agenda_published && <span style={{ color: '#f472b6' }}> · chưa có agenda</span>}</div>)}
                {digest.my_open_actions.map((a) => <div key={a.id} style={{ padding: '3px 0' }}>{a.overdue ? '🔴' : '⬜'} {a.title}{a.due_date ? ` — hạn ${a.due_date}` : ''}</div>)}
                {digest.upcoming_meetings.length === 0 && digest.my_open_actions.length === 0 && <span style={{ color: 'var(--muted)' }}>Trống lịch, trống việc — nghỉ đi.</span>}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ══ TAB CẤU HÌNH ══ */}
      {tab === 'cauhinh' && settings && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <b style={{ fontSize: 13 }}>⚙️ Cài đặt</b>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, alignItems: 'end' }}>
              <div><span style={lbl}>Đơn giá giờ họp (đ/người/giờ)</span><input style={inp} defaultValue={settings.hourlyCost} onBlur={(e) => act(() => api(`${B}/settings`, { method: 'POST', body: JSON.stringify({ hourly_cost: Number(e.target.value) }) }), loadCfg)} /></div>
              <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
                <input type="checkbox" defaultChecked={settings.hygieneRequireAgenda} onChange={(e) => act(() => api(`${B}/settings`, { method: 'POST', body: JSON.stringify({ hygiene_require_agenda: e.target.checked }) }), loadCfg)} />
                Bắt buộc publish agenda mới được bắt đầu họp
              </label>
              <div><span style={lbl}>Nhắc mốc 1 (giờ trước họp)</span><input style={{ ...inp, width: 70 }} defaultValue={settings.remindHours1} onBlur={(e) => act(() => api(`${B}/settings`, { method: 'POST', body: JSON.stringify({ remind_hours_1: Number(e.target.value) }) }), loadCfg)} /></div>
              <div><span style={lbl}>Nhắc mốc 2</span><input style={{ ...inp, width: 70 }} defaultValue={settings.remindHours2} onBlur={(e) => act(() => api(`${B}/settings`, { method: 'POST', body: JSON.stringify({ remind_hours_2: Number(e.target.value) }) }), loadCfg)} /></div>
              <div><span style={lbl}>Giữ file ghi âm (ngày)</span><input style={{ ...inp, width: 80 }} defaultValue={settings.audioRetentionDays} onBlur={(e) => act(() => api(`${B}/settings`, { method: 'POST', body: JSON.stringify({ audio_retention_days: Number(e.target.value) }) }), loadCfg)} /></div>
              <div><span style={lbl}>ASR engine</span><input style={{ ...inp, width: 150 }} defaultValue={settings.asrEngine} onBlur={(e) => act(() => api(`${B}/settings`, { method: 'POST', body: JSON.stringify({ asr_engine: e.target.value }) }), loadCfg)} /></div>
            </div>
          </Card>
          <Card>
            <b style={{ fontSize: 13 }}>📚 Loại họp ({types.length})</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 8 }}>
              {types.map((t) => (
                <div key={t.id} style={{ padding: 10, borderRadius: 10, background: 'var(--panel2)', fontSize: 12 }}>
                  <b>{t.name}</b>
                  {t.template?.quorum_mode === 'capital_pct' && <Chip text="biểu quyết % vốn" color="var(--amber)" />}
                  <div style={{ color: 'var(--muted)', marginTop: 4 }}>{t.description}</div>
                  <div style={{ color: 'var(--muted)', marginTop: 4 }}>{(t.template?.agenda as unknown[] | undefined)?.length ?? 0} mục agenda · {(t.template?.checklist as unknown[] | undefined)?.length ?? 0} checklist</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </Shell>
  );
}
