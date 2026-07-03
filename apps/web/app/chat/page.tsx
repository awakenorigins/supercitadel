'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession, WS_URL } from '../../lib/api';

interface Msg { id: string; body: string; senderId: string; createdAt: string }
interface Room { id: string; name: string | null; isGroup: boolean }
const AVA = ['mint', 'violet', 'amber', 'sky', 'rose'];

export default function ChatPage() {
  const router = useRouter();
  const [me, setMe] = useState<string>('');
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [active, setActive] = useState<Room | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [orgUsers, setOrgUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [roomName, setRoomName] = useState('');
  const activeRef = useRef<Room | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { boxRef.current?.scrollTo({ top: 1e9 }); }, [msgs]);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/'); return; }
    setMe(s.user.id);
    api<{ rooms: Room[] }>('/api/v1/chat/rooms').then((d) => setRooms(d.rooms)).catch(() => setRooms([]));
    const ws = new WebSocket(`${WS_URL}?token=${s.jwt}`);
    ws.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === 'chat:message' && ev.payload.roomId === activeRef.current?.id) {
        setMsgs((p) => p.some((x) => x.id === ev.payload.message.id) ? p : [...p, ev.payload.message]);
      }
    };
    return () => ws.close();
  }, [router]);

  async function openRoom(r: Room) {
    setActive(r);
    const d = await api<{ messages: Msg[] }>(`/api/v1/chat/rooms/${r.id}/messages`);
    setMsgs(d.messages.slice().reverse());
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
    await api(`/api/v1/chat/rooms/${active.id}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
  }
  const avaOf = (id: string) => AVA[(id?.charCodeAt(0) ?? 0) % AVA.length];

  return (
    <Shell>
      <div className="scroll" style={{ display: active ? 'none' : undefined }}>
        <div className="pg-h" style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1 }}><div className="k">Đội ngũ</div><h1>Nhắn tin</h1></div>
          <button onClick={() => { setShowNew(true); api<{ users: { id: string; displayName: string }[] }>('/api/v1/users').then((d) => setOrgUsers(d.users.filter((u) => u.id !== me))).catch(() => {}); }} style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--s1)', border: '1px solid var(--bd2)', color: 'var(--jade)', display: 'grid', placeItems: 'center' }}><Icon name="edit" size={18} /></button>
        </div>
        <div style={{ padding: '14px 14px 0' }}>
          {rooms === null && [1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 64, marginBottom: 8, borderRadius: 14 }} />)}
          {rooms?.length === 0 && <EmptyState icon="people" title="Chưa có phòng chat" sub="Tạo phòng mới để trao đổi với đội ngũ của bạn." />}
          {rooms?.map((r) => (
            <div key={r.id} onClick={() => openRoom(r)} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 14, cursor: 'pointer', alignItems: 'center' }}>
              <div className={`ava ${r.isGroup ? 'violet' : 'mint'}`} style={{ width: 48, height: 48, borderRadius: 15, fontSize: 16 }}>
                {(r.name ?? 'P').slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{r.name ?? 'Phòng chat'}</div>
                <div className="mut" style={{ fontSize: 12.5, marginTop: 3 }}>{r.isGroup ? 'Nhóm' : 'Riêng tư'} · chạm để mở</div>
              </div>
              <Icon name="chevron" size={18} style={{ color: 'var(--faint)' }} />
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--void)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 11, background: 'rgba(13,17,23,.8)', backdropFilter: 'blur(10px)' }}>
            <button onClick={() => setActive(null)} style={{ background: 'none', border: 'none', color: 'var(--jade)' }}><Icon name="back" size={24} /></button>
            <div className="ava violet" style={{ width: 38, height: 38, fontSize: 15 }}>{(active.name ?? 'P').slice(0, 2)}</div>
            <div><div className="fd" style={{ fontWeight: 700, fontSize: 15 }}>{active.name}</div><div style={{ fontSize: 11, color: 'var(--violet)' }}>real-time</div></div>
          </div>
          <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {msgs.map((m) => {
              const mine = m.senderId === me;
              return (
                <div key={m.id} style={{ display: 'flex', gap: 8, maxWidth: '78%', alignSelf: mine ? 'flex-end' : 'flex-start', flexDirection: mine ? 'row-reverse' : 'row' }}>
                  <div className={`ava ${mine ? 'sky' : avaOf(m.senderId)}`} style={{ width: 28, height: 28, borderRadius: 9, fontSize: 11, alignSelf: 'flex-end' }}>{mine ? 'M' : '·'}</div>
                  <div className={`bub ${mine ? 'me' : 'ai'}`}>{m.body}
                    <span className="mono" style={{ display: 'block', fontSize: 9.5, opacity: .5, marginTop: 3 }}>{new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '12px 16px 90px', borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--s1)', border: '1.5px solid var(--bd)', borderRadius: 15, padding: '6px 6px 6px 14px' }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Nhắn tin…" style={{ flex: 1, background: 'none', border: 'none', color: 'var(--txt)', fontSize: 14, outline: 'none' }} />
              <button onClick={send} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: 'var(--jade)', color: '#04231f', display: 'grid', placeItems: 'center' }}><Icon name="send" size={17} /></button>
            </div>
          </div>
        </div>
      )}
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
              {orgUsers.map((u) => {
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
    </Shell>
  );
}
