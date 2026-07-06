'use client';
// Chat enterprise (R11.5) — unread badge, reaction, reply, pin, file, sửa/thu hồi,
// quản lý thành viên, typing, channel phòng ban, search. Nối /api/v1/chat/*.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession, WS_URL } from '../../lib/api';

interface Room { id: string; name: string | null; isGroup: boolean; kind?: string; lastMessageAt?: string }
interface Msg { id: string; senderId: string; body: string; createdAt: string; kind?: string; replyToId?: string | null; deletedAt?: string | null; editedAt?: string | null; attachment?: Att }
interface Att { id: string; fileName: string; mime: string; sizeBytes: number }
interface Member { userId: string; role: string }

const AVA = ['mint', 'violet', 'amber', 'rose', 'sky'];
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const fmtSize = (b: number) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB';
const kindLabel: Record<string, string> = { direct: 'Riêng tư', group: 'Nhóm', department: 'Phòng ban', announcement: 'Thông báo' };

export default function ChatPage() {
  const router = useRouter();
  const [me, setMe] = useState<string>('');
  const [myRole, setMyRole] = useState<string>('staff');
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Room | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reactions, setReactions] = useState<Record<string, Array<{ emoji: string; userId: string }>>>({});
  const [atts, setAtts] = useState<Record<string, Att>>({});
  const [pins, setPins] = useState<Array<{ messageId: string; message: Msg | null }>>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [orgUsers, setOrgUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [actionMsg, setActionMsg] = useState<Msg | null>(null); // long-press menu
  const [showNew, setShowNew] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<Msg[] | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [roomName, setRoomName] = useState('');
  const [toast, setToast] = useState('');
  const activeRef = useRef<Room | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTs = useRef(0);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { boxRef.current?.scrollTo({ top: 1e9 }); }, [msgs]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); } }, [toast]);

  const loadRooms = useCallback(() => {
    api<{ rooms: Room[] }>('/api/v1/chat/rooms').then((d) => setRooms(d.rooms)).catch(() => setRooms([]));
    api<{ unread: Record<string, number> }>('/api/v1/chat/unread').then((d) => setUnread(d.unread)).catch(() => {});
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/'); return; }
    setMe(s.user.id); setMyRole((s.user as any).role ?? 'staff');
    loadRooms();
    const ws = new WebSocket(`${WS_URL}?token=${s.jwt}`);
    ws.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      const cur = activeRef.current;
      if (ev.type === 'chat:message') {
        if (cur && ev.payload.roomId === cur.id) {
          setMsgs((p) => p.some((x) => x.id === ev.payload.message.id) ? p : [...p, ev.payload.message]);
          if (ev.payload.message.attachment) setAtts((p) => ({ ...p, [ev.payload.message.id]: ev.payload.message.attachment }));
          api(`/api/v1/chat/rooms/${cur.id}/read`, { method: 'PUT' }).catch(() => {});
        } else {
          setUnread((p) => ({ ...p, [ev.payload.roomId]: (p[ev.payload.roomId] ?? 0) + 1 }));
        }
      }
      if (ev.type === 'presence:update' && ev.payload.what === 'typing' && ev.payload.roomId === cur?.id && ev.payload.userId !== s.user.id) {
        setTypingUsers((p) => ({ ...p, [ev.payload.userId]: Date.now() }));
      }
      if (ev.type === 'data:changed' && ev.payload.roomId === cur?.id) {
        const w = ev.payload.what;
        if (w === 'reaction') {
          setReactions((p) => {
            const list = [...(p[ev.payload.messageId] ?? [])];
            const i = list.findIndex((r) => r.userId === ev.payload.userId && r.emoji === ev.payload.emoji);
            if (ev.payload.toggled === 'on' && i < 0) list.push({ emoji: ev.payload.emoji, userId: ev.payload.userId });
            if (ev.payload.toggled === 'off' && i >= 0) list.splice(i, 1);
            return { ...p, [ev.payload.messageId]: list };
          });
        }
        if (w === 'edited') setMsgs((p) => p.map((m) => m.id === ev.payload.message.id ? ev.payload.message : m));
        if (w === 'recalled') setMsgs((p) => p.map((m) => m.id === ev.payload.messageId ? { ...m, body: '', deletedAt: new Date().toISOString() } : m));
        if (w === 'pin' || w === 'unpin') loadPins(cur!.id);
      }
    };
    const gc = setInterval(() => setTypingUsers((p) => Object.fromEntries(Object.entries(p).filter(([, t]) => Date.now() - t < 4000))), 2000);
    return () => { ws.close(); clearInterval(gc); };
  }, [router, loadRooms]);

  async function loadPins(roomId: string) {
    api<{ pins: any[] }>(`/api/v1/chat/rooms/${roomId}/pins`).then((d) => setPins(d.pins)).catch(() => {});
  }
  async function openRoom(r: Room) {
    setActive(r); setReplyTo(null); setEditing(null); setSearchRes(null);
    const d = await api<{ messages: Msg[] }>(`/api/v1/chat/rooms/${r.id}/messages`);
    const list = d.messages.slice().reverse();
    setMsgs(list);
    const ids = list.map((m) => m.id).join(',');
    if (ids) api<{ reactions: any; attachments: any }>(`/api/v1/chat/rooms/${r.id}/messages/enrich?ids=${ids}`)
      .then((e) => { setReactions(e.reactions); setAtts(e.attachments); }).catch(() => {});
    loadPins(r.id);
    api<{ members: Member[] }>(`/api/v1/chat/rooms/${r.id}/members`).then((d2) => setMembers(d2.members)).catch(() => {});
    api(`/api/v1/chat/rooms/${r.id}/read`, { method: 'PUT' }).catch(() => {});
    setUnread((p) => ({ ...p, [r.id]: 0 }));
  }
  async function createRoom() {
    if (!picked.length) return;
    const d = await api<{ room: Room }>('/api/v1/chat/rooms', { method: 'POST', body: JSON.stringify({ name: roomName.trim() || 'Phòng mới', isGroup: picked.length > 1, memberIds: picked }) }).catch(() => null);
    setShowNew(false); setPicked([]); setRoomName('');
    if (d?.room) { setRooms((p) => [d.room, ...(p ?? [])]); openRoom(d.room); }
  }
  async function send() {
    if (!draft.trim() || !active) return;
    const body = draft; setDraft('');
    if (editing) {
      await api(`/api/v1/chat/rooms/${active.id}/messages/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ body }) }).catch((e) => setToast(e.message));
      setEditing(null); return;
    }
    const payload: any = { body };
    if (replyTo) payload.replyToId = replyTo.id;
    setReplyTo(null);
    await api(`/api/v1/chat/rooms/${active.id}/messages`, { method: 'POST', body: JSON.stringify(payload) }).catch((e) => setToast(e.message));
  }
  function onType(v: string) {
    setDraft(v);
    if (active && Date.now() - typingTs.current > 2500) {
      typingTs.current = Date.now();
      api(`/api/v1/chat/rooms/${active.id}/typing`, { method: 'POST' }).catch(() => {});
    }
  }
  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !active) return;
    if (f.size > 5 * 1024 * 1024) { setToast('File vượt 5MB'); return; }
    const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.readAsDataURL(f); });
    await api(`/api/v1/chat/rooms/${active.id}/files`, { method: 'POST', body: JSON.stringify({ fileName: f.name, mime: f.type || 'application/octet-stream', dataB64: b64 }) })
      .then(() => setToast('Đã gửi file')).catch((err) => setToast(err.message));
  }
  async function react(m: Msg, emoji: string) {
    setActionMsg(null);
    await api(`/api/v1/chat/rooms/${active!.id}/messages/${m.id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }).catch(() => {});
  }
  async function togglePin(m: Msg) {
    setActionMsg(null);
    const pinned = pins.some((p) => p.messageId === m.id);
    await api(`/api/v1/chat/rooms/${active!.id}/pins/${m.id}`, { method: pinned ? 'DELETE' : 'POST' })
      .then(() => { setToast(pinned ? 'Đã bỏ ghim' : 'Đã ghim'); loadPins(active!.id); }).catch((e) => setToast(e.message));
  }
  async function recall(m: Msg) {
    setActionMsg(null);
    await api(`/api/v1/chat/rooms/${active!.id}/messages/${m.id}`, { method: 'DELETE' }).catch((e) => setToast(e.message));
  }
  async function doSearch() {
    if (!searchQ.trim()) { setSearchRes(null); return; }
    const d = await api<{ messages: Msg[] }>(`/api/v1/chat/search?q=${encodeURIComponent(searchQ)}`).catch(() => ({ messages: [] }));
    setSearchRes(d.messages);
  }
  async function syncDepartments() {
    const r = await api<any>('/api/v1/chat/departments/sync', { method: 'POST' }).catch((e) => { setToast(e.message); return null; });
    if (r) { setToast(`Đã sync: ${r.channelsCreated} channel mới, +${r.membersAdded} thành viên`); loadRooms(); }
  }
  async function addMember(uid: string) {
    await api(`/api/v1/chat/rooms/${active!.id}/members`, { method: 'POST', body: JSON.stringify({ memberIds: [uid] }) })
      .then(() => { setToast('Đã thêm'); api<{ members: Member[] }>(`/api/v1/chat/rooms/${active!.id}/members`).then((d) => setMembers(d.members)); })
      .catch((e) => setToast(e.message));
  }
  async function kickMember(uid: string) {
    await api(`/api/v1/chat/rooms/${active!.id}/members/${uid}`, { method: 'DELETE' })
      .then(() => { setToast(uid === me ? 'Đã rời phòng' : 'Đã xóa khỏi phòng'); if (uid === me) { setActive(null); setShowInfo(false); loadRooms(); } else api<{ members: Member[] }>(`/api/v1/chat/rooms/${active!.id}/members`).then((d) => setMembers(d.members)); })
      .catch((e) => setToast(e.message));
  }

  const avaOf = (id: string) => AVA[(id?.charCodeAt(0) ?? 0) % AVA.length];
  const nameOf = (id: string) => orgUsers.find((u) => u.id === id)?.displayName ?? (id === me ? 'Mình' : '·');
  const msgById = (id?: string | null) => msgs.find((m) => m.id === id);
  const loadUsers = () => api<{ users: { id: string; displayName: string }[] }>('/api/v1/users').then((d) => setOrgUsers(d.users)).catch(() => {});
  useEffect(() => { if (me) loadUsers(); }, [me]);

  return (
    <Shell>
      {/* ── LIST ROOMS ── */}
      <div className="scroll" style={{ display: active ? 'none' : undefined }}>
        <div className="pg-h" style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1 }}><div className="k">Đội ngũ</div><h1>Nhắn tin</h1></div>
          {['owner', 'super_admin', 'manager'].includes(myRole) && (
            <button title="Tạo channel phòng ban từ Soul-Manager" onClick={syncDepartments} style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--s1)', border: '1px solid var(--bd2)', color: 'var(--violet)', display: 'grid', placeItems: 'center' }}><Icon name="bank" size={17} /></button>
          )}
          <button onClick={() => { setShowNew(true); loadUsers(); }} style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--s1)', border: '1px solid var(--bd2)', color: 'var(--jade)', display: 'grid', placeItems: 'center' }}><Icon name="edit" size={18} /></button>
        </div>
        <div style={{ padding: '10px 14px 0', display: 'flex', gap: 8 }}>
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="Tìm tin nhắn…"
            style={{ flex: 1, padding: '9px 13px', borderRadius: 12, border: '1.5px solid var(--bd)', background: 'var(--s1)', color: 'var(--txt)', fontSize: 13, outline: 'none' }} />
          <button onClick={doSearch} style={{ width: 38, borderRadius: 12, background: 'var(--s1)', border: '1px solid var(--bd2)', color: 'var(--jade)' }}><Icon name="search" size={16} /></button>
        </div>
        {searchRes && (
          <div style={{ padding: '10px 14px 0' }}>
            <div className="mut" style={{ fontSize: 12, marginBottom: 6 }}>{searchRes.length} kết quả · <span style={{ color: 'var(--jade)', cursor: 'pointer' }} onClick={() => setSearchRes(null)}>đóng</span></div>
            {searchRes.map((m) => (
              <div key={m.id} className="card" style={{ borderRadius: 12, padding: '9px 12px', marginBottom: 6, fontSize: 13 }}>{m.body}<span className="mut" style={{ display: 'block', fontSize: 10.5 }}>{new Date(m.createdAt).toLocaleString('vi-VN')}</span></div>
            ))}
          </div>
        )}
        <div style={{ padding: '14px 14px 0' }}>
          {rooms === null && [1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 64, marginBottom: 8, borderRadius: 14 }} />)}
          {rooms?.length === 0 && <EmptyState icon="chat" title="Chưa có phòng chat" sub="Tạo phòng mới để trao đổi với đội ngũ của bạn." />}
          {rooms?.map((r) => (
            <div key={r.id} onClick={() => openRoom(r)} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 14, cursor: 'pointer', alignItems: 'center' }}>
              <div className={`ava ${r.kind === 'department' ? 'amber' : r.isGroup ? 'violet' : 'mint'}`} style={{ width: 48, height: 48, borderRadius: 15, fontSize: 16 }}>
                {(r.name ?? 'P').replace('# ', '').slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{r.name ?? 'Phòng chat'}</div>
                <div className="mut" style={{ fontSize: 12.5, marginTop: 3 }}>{kindLabel[r.kind ?? (r.isGroup ? 'group' : 'direct')] ?? 'Nhóm'} · chạm để mở</div>
              </div>
              {(unread[r.id] ?? 0) > 0 && <span style={{ minWidth: 22, height: 22, borderRadius: 11, background: 'var(--rose)', color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{unread[r.id] > 99 ? '99+' : unread[r.id]}</span>}
              <Icon name="chevron" size={18} style={{ color: 'var(--faint)' }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── ROOM VIEW ── */}
      {active && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--void)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 11, background: 'rgba(13,17,23,.8)', backdropFilter: 'blur(10px)' }}>
            <button onClick={() => { setActive(null); loadRooms(); }} style={{ background: 'none', border: 'none', color: 'var(--jade)' }}><Icon name="back" size={24} /></button>
            <div className="ava violet" style={{ width: 38, height: 38, fontSize: 15 }}>{(active.name ?? 'P').replace('# ', '').slice(0, 2)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="fd" style={{ fontWeight: 700, fontSize: 15 }}>{active.name}</div>
              <div style={{ fontSize: 11, color: 'var(--violet)' }}>
                {Object.keys(typingUsers).length > 0 ? `${nameOf(Object.keys(typingUsers)[0])} đang gõ…` : `${members.length} thành viên · real-time`}
              </div>
            </div>
            {pins.length > 0 && <button onClick={() => setShowPins(true)} style={{ background: 'none', border: 'none', color: 'var(--amber)', position: 'relative' }} title="Tin ghim"><Icon name="target" size={20} /><span style={{ position: 'absolute', top: -4, right: -6, fontSize: 9.5, fontWeight: 700 }}>{pins.length}</span></button>}
            <button onClick={() => { setShowInfo(true); loadUsers(); }} style={{ background: 'none', border: 'none', color: 'var(--mut)' }}><Icon name="cog" size={20} /></button>
          </div>

          <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {msgs.map((m) => {
              const mine = m.senderId === me;
              const reacts = reactions[m.id] ?? [];
              const att = atts[m.id] ?? m.attachment;
              const replied = msgById(m.replyToId);
              const emojiCounts = reacts.reduce<Record<string, number>>((a, r) => ((a[r.emoji] = (a[r.emoji] ?? 0) + 1), a), {});
              return (
                <div key={m.id} style={{ display: 'flex', gap: 8, maxWidth: '78%', alignSelf: mine ? 'flex-end' : 'flex-start', flexDirection: mine ? 'row-reverse' : 'row' }}>
                  <div className={`ava ${mine ? 'sky' : avaOf(m.senderId)}`} style={{ width: 28, height: 28, borderRadius: 9, fontSize: 11, alignSelf: 'flex-end' }}>{mine ? 'M' : nameOf(m.senderId).slice(0, 1)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className={`bub ${mine ? 'me' : 'ai'}`} onContextMenu={(e) => { e.preventDefault(); if (!m.deletedAt) setActionMsg(m); }} onDoubleClick={() => { if (!m.deletedAt) setActionMsg(m); }} style={{ cursor: 'pointer' }}>
                      {replied && <div style={{ borderLeft: '3px solid var(--jade)', paddingLeft: 8, marginBottom: 5, fontSize: 11.5, opacity: .7 }}>{replied.deletedAt ? 'Tin đã thu hồi' : replied.body.slice(0, 80)}</div>}
                      {m.deletedAt ? <i style={{ opacity: .5, fontSize: 12.5 }}>Tin đã thu hồi</i> : (
                        <>
                          {att && (
                            <a href={`/api/v1/chat/attachments/${att.id}`} onClick={async (e) => {
                              e.preventDefault();
                              const s = getSession(); if (!s) return;
                              const res = await fetch(`/api/v1/chat/attachments/${att.id}`, { headers: { Authorization: `Bearer ${s.jwt}` } });
                              const blob = await res.blob(); const url = URL.createObjectURL(blob);
                              const a = document.createElement('a'); a.href = url; a.download = att.fileName; a.click(); URL.revokeObjectURL(url);
                            }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,.06)', marginBottom: m.kind === 'file' && m.body !== att.fileName ? 5 : 0, textDecoration: 'none', color: 'inherit' }}>
                              <Icon name="book" size={18} /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{att.fileName}</span><span className="mut" style={{ fontSize: 10.5 }}>{fmtSize(att.sizeBytes)}</span>
                            </a>
                          )}
                          {(!att || m.body !== att.fileName) && m.body}
                        </>
                      )}
                      <span className="mono" style={{ display: 'block', fontSize: 9.5, opacity: .5, marginTop: 3 }}>
                        {new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}{m.editedAt && !m.deletedAt ? ' · đã sửa' : ''}
                      </span>
                    </div>
                    {Object.keys(emojiCounts).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 3, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                        {Object.entries(emojiCounts).map(([e, n]) => (
                          <span key={e} onClick={() => react(m, e)} style={{ fontSize: 11.5, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 9, padding: '1px 7px', cursor: 'pointer' }}>{e}{n > 1 ? ` ${n}` : ''}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {(replyTo || editing) && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--s1)' }}>
              <Icon name={editing ? 'edit' : 'quote'} size={15} style={{ color: 'var(--jade)' }} />
              <span style={{ flex: 1, fontSize: 12, opacity: .8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editing ? `Sửa: ${editing.body.slice(0, 60)}` : `Trả lời: ${replyTo!.body.slice(0, 60)}`}</span>
              <button onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setDraft(''); } }} style={{ background: 'none', border: 'none', color: 'var(--mut)' }}><Icon name="x" size={14} /></button>
            </div>
          )}

          <div style={{ padding: '12px 16px 90px', borderTop: replyTo || editing ? 'none' : '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--s1)', border: '1.5px solid var(--bd)', borderRadius: 15, padding: '6px 6px 6px 8px' }}>
              <button onClick={() => fileRef.current?.click()} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--mut)', display: 'grid', placeItems: 'center' }} title="Gửi file (≤5MB)"><Icon name="plus" size={19} /></button>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={pickFile} />
              <input value={draft} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={editing ? 'Sửa tin nhắn…' : 'Nhắn tin…'} style={{ flex: 1, background: 'none', border: 'none', color: 'var(--txt)', fontSize: 14, outline: 'none' }} />
              <button onClick={send} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: 'var(--jade)', color: '#04231f', display: 'grid', placeItems: 'center' }}><Icon name="send" size={17} /></button>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTION SHEET (reaction / reply / pin / edit / recall) ── */}
      {actionMsg && active && (
        <div className="sh-scrim" style={{ zIndex: 80 }} onClick={() => setActionMsg(null)}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
              {EMOJIS.map((e) => <button key={e} onClick={() => react(actionMsg, e)} style={{ fontSize: 22, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 12, width: 44, height: 44 }}>{e}</button>)}
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              <button className="chip" style={{ padding: '11px 0', fontSize: 13.5 }} onClick={() => { setReplyTo(actionMsg); setEditing(null); setActionMsg(null); }}><Icon name="quote" size={14} /> Trả lời</button>
              <button className="chip" style={{ padding: '11px 0', fontSize: 13.5 }} onClick={() => togglePin(actionMsg)}><Icon name="target" size={14} /> {pins.some((p) => p.messageId === actionMsg.id) ? 'Bỏ ghim' : 'Ghim tin này'}</button>
              {actionMsg.senderId === me && !actionMsg.deletedAt && (
                <button className="chip" style={{ padding: '11px 0', fontSize: 13.5 }} onClick={() => { setEditing(actionMsg); setDraft(actionMsg.body); setReplyTo(null); setActionMsg(null); }}><Icon name="edit" size={14} /> Sửa (trong 15 phút)</button>
              )}
              {(actionMsg.senderId === me || ['owner', 'super_admin'].includes(myRole)) && (
                <button className="chip" style={{ padding: '11px 0', fontSize: 13.5, color: 'var(--rose)' }} onClick={() => recall(actionMsg)}><Icon name="x" size={14} /> Thu hồi</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PINS SHEET ── */}
      {showPins && active && (
        <div className="sh-scrim" style={{ zIndex: 80 }} onClick={() => setShowPins(false)}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head"><div className="sh-ico" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><Icon name="target" size={18} /></div><b style={{ fontSize: 15 }}>Tin đã ghim ({pins.length})</b><button className="sh-x" onClick={() => setShowPins(false)}><Icon name="x" size={15} /></button></div>
            <div style={{ display: 'grid', gap: 8, maxHeight: '52dvh', overflowY: 'auto' }}>
              {pins.map((p) => (
                <div key={p.messageId} className="card" style={{ borderRadius: 12, padding: '10px 12px', fontSize: 13 }}>
                  {p.message?.deletedAt ? <i style={{ opacity: .5 }}>Tin đã thu hồi</i> : p.message?.body ?? '—'}
                  <span className="mut" style={{ display: 'block', fontSize: 10.5, marginTop: 3 }}>{p.message ? new Date(p.message.createdAt).toLocaleString('vi-VN') : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ROOM INFO / MEMBERS SHEET ── */}
      {showInfo && active && (
        <div className="sh-scrim" style={{ zIndex: 80 }} onClick={() => setShowInfo(false)}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head"><div className="sh-ico" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="users" size={18} /></div><b style={{ fontSize: 15 }}>Thành viên ({members.length})</b><button className="sh-x" onClick={() => setShowInfo(false)}><Icon name="x" size={15} /></button></div>
            <div style={{ display: 'grid', gap: 6, maxHeight: '40dvh', overflowY: 'auto' }}>
              {members.map((mb) => (
                <div key={mb.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
                  <div className={`ava ${avaOf(mb.userId)}`} style={{ width: 32, height: 32, borderRadius: 10, fontSize: 12 }}>{nameOf(mb.userId).slice(0, 1)}</div>
                  <span style={{ flex: 1, fontSize: 13.5 }}>{nameOf(mb.userId)}{mb.userId === me ? ' (mình)' : ''}</span>
                  {mb.role === 'admin' && <span className="chip" style={{ fontSize: 10, padding: '2px 8px' }}>admin</span>}
                  <button onClick={() => kickMember(mb.userId)} style={{ background: 'none', border: 'none', color: 'var(--rose)', fontSize: 11.5 }}>{mb.userId === me ? 'Rời' : 'Xóa'}</button>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--mut)', margin: '12px 0 6px' }}>THÊM THÀNH VIÊN</div>
            <div style={{ display: 'grid', gap: 4, maxHeight: '24dvh', overflowY: 'auto' }}>
              {orgUsers.filter((u) => !members.some((mb) => mb.userId === u.id)).map((u) => (
                <div key={u.id} onClick={() => addMember(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', cursor: 'pointer' }}>
                  <div className="ava mint" style={{ width: 30, height: 30, borderRadius: 9, fontSize: 11 }}>{u.displayName.slice(0, 1)}</div>
                  <span style={{ flex: 1, fontSize: 13 }}>{u.displayName}</span>
                  <Icon name="plus" size={15} style={{ color: 'var(--jade)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── NEW ROOM SHEET ── */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(6,8,12,.66)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'end center' }} onClick={() => setShowNew(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--base)', borderRadius: '24px 24px 0 0', border: '1px solid var(--bd2)', borderBottom: 'none', padding: '14px 18px 26px' }}>
            <div style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--bd2)', margin: '0 auto 14px' }} />
            <b className="fd" style={{ fontSize: 17 }}>Tạo cuộc trò chuyện</b>
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Tên phòng (tuỳ chọn)"
              style={{ width: '100%', marginTop: 13, padding: '11px 14px', borderRadius: 12, border: '1.5px solid var(--bd)', background: 'var(--s1)', color: 'var(--txt)', fontSize: 13.5, outline: 'none' }} />
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--mut)', margin: '14px 0 8px' }}>CHỌN THÀNH VIÊN</div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {orgUsers.length === 0 && <div className="skel" style={{ height: 46, borderRadius: 12 }} />}
              {orgUsers.filter((u) => u.id !== me).map((u) => {
                const on = picked.includes(u.id);
                return (
                  <div key={u.id} onClick={() => setPicked((p) => on ? p.filter((x) => x !== u.id) : [...p, u.id])}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 6px', borderRadius: 12, cursor: 'pointer', background: on ? 'var(--jade-soft)' : 'transparent' }}>
                    <div className="ava mint" style={{ width: 34, height: 34, fontSize: 12, borderRadius: 10 }}>{u.displayName.slice(0, 2)}</div>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{u.displayName}</span>
                    <div style={{ width: 20, height: 20, borderRadius: 7, border: `1.5px solid ${on ? 'var(--jade)' : 'var(--bd2)'}`, background: on ? 'var(--jade)' : 'transparent', display: 'grid', placeItems: 'center', color: '#04231f' }}>{on && <Icon name="check" size={13} />}</div>
                  </div>
                );
              })}
            </div>
            <button className="btn-p" onClick={createRoom} disabled={!picked.length} style={{ marginTop: 14, opacity: picked.length ? 1 : .5 }}>
              Tạo phòng{picked.length ? ` (${picked.length} người)` : ''}
            </button>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 90, background: 'var(--s1)', border: '1px solid var(--bd2)', borderRadius: 12, padding: '9px 16px', fontSize: 12.5, color: 'var(--txt)' }}>{toast}</div>}
    </Shell>
  );
}
