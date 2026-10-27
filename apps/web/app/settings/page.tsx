'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { getSession, clearSession, api } from '../../lib/api';
import { loadTut, saveTut } from '../../components/Tutorial';

interface Me {
  id: string; role: string;
  securityLevel: number; email: string | null; phone: string | null;
  needsUpgrade: boolean; upgradeHint?: string;
}
interface PermissionMeta { key: string; module: string; resource: string; action: string; description: string; securityLevel: 1 | 2; sensitive: boolean }
interface PermissionsResp { registry: PermissionMeta[]; permissions: string[]; role: string; securityLevel: number }
type PersonaMode = 'friendly' | 'professional' | 'concise' | 'playful';
interface TieuTamSettings { personaMode: PersonaMode; proactive: boolean; proactiveNote?: string }
interface OrgResp { org: { id: string; name: string; slug: string; logoEmoji: string | null; createdAt: string; memberCount?: number } }
interface Member { id: string; displayName: string | null; role: string; avatarColor?: string | null; email?: string | null; phone?: string | null; securityLevel?: number; createdAt?: string }

const inputSt: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 12,
  padding: '11px 13px', color: 'var(--txt)', fontSize: 14, width: '100%', outline: 'none',
};

export default function SettingsPage() {
  const router = useRouter();
  const [name, setName] = useState(''); const [role, setRole] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [perms, setPerms] = useState<PermissionsResp | null>(null);
  const [tt, setTt] = useState<TieuTamSettings | null>(null);
  const [org, setOrg] = useState<OrgResp['org'] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [panel, setPanel] = useState<'' | 'persona' | 'proactive' | 'org' | 'members'>('');
  const [orgName, setOrgName] = useState(''); const [orgEmoji, setOrgEmoji] = useState('');
  // R5 Phase D: tutorial toggle
  const [tutOff, setTutOff] = useState(false);
  const [tutMsg, setTutMsg] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) { router.replace('/'); return; }
    setName(s.user.displayName ?? 'Người dùng'); setRole(s.user.role);
    api<Me>('/api/v1/me').then(setMe).catch(() => {});
    api<PermissionsResp>('/api/v1/permissions').then(setPerms).catch(() => null);
    loadLiveSettings();
    setTutOff(loadTut().off);
  }, [router]);

  async function loadLiveSettings() {
    api<TieuTamSettings>('/api/v1/tieu-tam/settings').then(setTt).catch((e) => setMsg({ t: e.message ?? 'Không tải được cài đặt Tiểu Tâm', ok: false }));
    api<OrgResp>('/api/v1/org').then((d) => { setOrg(d.org); setOrgName(d.org.name); setOrgEmoji(d.org.logoEmoji ?? ''); }).catch(() => null);
    api<{ members: Member[] }>('/api/v1/org/members').then((d) => setMembers(d.members)).catch(() => setMembers([]));
  }

  async function saveTt(patch: Partial<TieuTamSettings>) {
    setBusy('tt'); setMsg(null);
    try {
      const d = await api<TieuTamSettings & { message?: string }>('/api/v1/tieu-tam/settings', { method: 'PATCH', body: JSON.stringify(patch) });
      setTt({ personaMode: d.personaMode, proactive: d.proactive, proactiveNote: d.proactiveNote });
      setMsg({ t: d.message ?? 'Đã lưu cài đặt Tiểu Tâm', ok: true });
    } catch (e: any) { setMsg({ t: e.message ?? 'Không lưu được cài đặt', ok: false }); }
    finally { setBusy(''); }
  }

  async function saveOrg() {
    setBusy('org'); setMsg(null);
    try {
      const d = await api<OrgResp & { ok: boolean }>('/api/v1/org', { method: 'PATCH', body: JSON.stringify({ name: orgName, logoEmoji: orgEmoji }) });
      setOrg(d.org); setMsg({ t: 'Đã lưu thông tin tổ chức', ok: true });
    } catch (e: any) { setMsg({ t: e.message ?? 'Không lưu được tổ chức', ok: false }); }
    finally { setBusy(''); }
  }

  async function changeRole(id: string, nextRole: string) {
    setBusy(`role:${id}`); setMsg(null);
    try {
      await api(`/api/v1/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) });
      setMembers((xs) => xs.map((m) => m.id === id ? { ...m, role: nextRole } : m));
      setMsg({ t: 'Đã đổi quyền thành viên', ok: true });
    } catch (e: any) { setMsg({ t: e.message ?? 'Không đổi được quyền', ok: false }); }
    finally { setBusy(''); }
  }

  // R5: bật/tắt toàn bộ tutorial
  function toggleTut() {
    const st = loadTut();
    st.off = !st.off;
    saveTut(st);
    setTutOff(st.off);
    setTutMsg(st.off ? 'Đã tắt toàn bộ hướng dẫn.' : 'Đã bật lại hướng dẫn — tour sẽ hiện ở trang chưa xem.');
  }
  // R5: xem lại từ đầu — xóa trạng thái done của mọi tour
  function resetTut() {
    saveTut({ done: {}, off: false });
    setTutOff(false);
    setTutMsg('Đã đặt lại — vào Trang chủ để xem tour chào mừng, hoặc bấm nút "?" trên đầu trang bất kỳ.');
  }

  async function bind(kind: 'email' | 'phone') {
    const value = kind === 'email' ? email.trim() : phone.trim();
    if (!value) { setMsg({ t: kind === 'email' ? 'Nhập email trước đã' : 'Nhập số điện thoại trước đã', ok: false }); return; }
    setBusy(kind); setMsg(null);
    try {
      const d = await api<{ message: string; securityLevel: number }>(`/api/v1/me/bind-${kind}`, {
        method: 'POST', body: JSON.stringify(kind === 'email' ? { email: value } : { phone: value }),
      });
      setMsg({ t: d.message ?? 'Đã lưu', ok: true });
      const fresh = await api<Me>('/api/v1/me').catch(() => null);
      if (fresh) setMe(fresh);
      if (kind === 'email') setEmail(''); else setPhone('');
    } catch (e: any) {
      setMsg({ t: e.message ?? 'Có lỗi xảy ra — thử lại nhé', ok: false });
    } finally { setBusy(''); }
  }

  const roleLabel: Record<string, string> = { super_admin: 'Quản trị hệ thống', owner: 'Chủ quán', manager: 'Quản lý', staff: 'Nhân viên' };
  const personaLabel: Record<PersonaMode, string> = { friendly: 'Thân thiện', professional: 'Chuyên nghiệp', concise: 'Ngắn gọn', playful: 'Vui vẻ' };
  const level = me?.securityLevel ?? 1;
  const myPerms = perms?.registry.filter((p) => perms.permissions.includes(p.key)) ?? [];
  const permsByModule = myPerms.reduce<Record<string, PermissionMeta[]>>((acc, p) => { (acc[p.module] ??= []).push(p); return acc; }, {});

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Tài khoản</div><h1>Cài Đặt</h1></div>
        <div className="card" style={{ margin: '16px 20px 0', display: 'flex', alignItems: 'center', gap: 14, borderRadius: 20, padding: 18 }}>
          <div className="ava mint" style={{ width: 64, height: 64, borderRadius: 20, fontSize: 26 }}>{name.slice(0, 1)}</div>
          <div>
            <div className="fd" style={{ fontWeight: 700, fontSize: 18 }}>{name}</div>
            <div className="mut" style={{ fontSize: 12.5, marginTop: 2 }}>{roleLabel[role] ?? role} · Cà Phê Nhà Mình</div>
          </div>
        </div>

        {/* ── Bảo mật (V7A P1 — progressive security lớp 2) ── */}
        <div style={{ margin: '20px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', padding: '0 4px 8px' }}>Bảo mật</div>
          <div className="card" style={{ borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: level >= 2 ? 'var(--jade-soft)' : 'rgba(236,106,133,.14)', color: level >= 2 ? 'var(--jade)' : 'var(--rose)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="shield" size={16} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Bảo mật lớp {level}</div>
                <div className="mut" style={{ fontSize: 11.5, marginTop: 1 }}>{level >= 2 ? 'Tài khoản đã được bảo vệ bằng email/SĐT' : 'Gắn email hoặc SĐT để lên lớp 2'}</div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: level >= 2 ? 'var(--jade)' : 'var(--rose)' }}>{level}/4</span>
            </div>
            {me?.needsUpgrade && me.upgradeHint && (
              <div style={{ padding: '9px 12px', borderRadius: 11, background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: 12 }}>{me.upgradeHint}</div>
            )}
            {msg && <div style={{ padding: '9px 12px', borderRadius: 11, fontSize: 12.5, background: msg.ok ? 'var(--jade-soft)' : 'rgba(236,106,133,.14)', color: msg.ok ? 'var(--jade)' : 'var(--rose)' }}>{msg.t}</div>}

            <div style={{ display: 'grid', gap: 7 }}>
              <div className="mut" style={{ fontSize: 11.5 }}>Email {me?.email ? <span className="mono" style={{ color: 'var(--jade)' }}>· {me.email}</span> : ''}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@congty.vn" type="email" style={inputSt} />
                <button onClick={() => bind('email')} disabled={busy === 'email'} className="btn-p" style={{ width: 'auto', padding: '0 16px', fontSize: 13, opacity: busy === 'email' ? .6 : 1 }}>{busy === 'email' ? '…' : 'Gắn'}</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              <div className="mut" style={{ fontSize: 11.5 }}>Số điện thoại {me?.phone ? <span className="mono" style={{ color: 'var(--jade)' }}>· {me.phone}</span> : ''}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" type="tel" style={inputSt} />
                <button onClick={() => bind('phone')} disabled={busy === 'phone'} className="btn-p" style={{ width: 'auto', padding: '0 16px', fontSize: 13, opacity: busy === 'phone' ? .6 : 1 }}>{busy === 'phone' ? '…' : 'Gắn'}</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ margin: '20px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', padding: '0 4px 8px' }}>Quyền của tôi</div>
          <div className="card" style={{ borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--violet-soft, rgba(152,137,232,.14))', color: 'var(--violet)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="shield" size={16} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{roleLabel[perms?.role ?? role] ?? (perms?.role ?? role)} · {myPerms.length} quyền</div>
                <div className="mut" style={{ fontSize: 11.5, marginTop: 1 }}>Danh sách lấy trực tiếp từ GET /permissions</div>
              </div>
            </div>
            {!perms ? <div className="mut" style={{ fontSize: 12 }}>Đang tải quyền…</div> : Object.entries(permsByModule).map(([mod, list]) => (
              <div key={mod} style={{ display: 'grid', gap: 7 }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--jade)', textTransform: 'uppercase' }}>{mod}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {list.map((p) => <span key={p.key} className="chip" title={p.description} style={{ borderColor: p.securityLevel >= 2 ? 'rgba(232,179,102,.35)' : undefined, color: p.securityLevel >= 2 ? 'var(--amber)' : undefined }}>{p.description}{p.securityLevel >= 2 ? ' · L2' : ''}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── R5: Hướng dẫn sử dụng (tutorial) ── */}
        <div style={{ margin: '20px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', padding: '0 4px 8px' }}>Hướng dẫn sử dụng</div>
          <div className="card" style={{ borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: tutOff ? 'var(--s3)' : 'var(--jade-soft)', color: tutOff ? 'var(--dim)' : 'var(--jade)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="help" size={16} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Tutorial từng trang</div>
                <div className="mut" style={{ fontSize: 11.5, marginTop: 1 }}>{tutOff ? 'Đang TẮT — không hiện hướng dẫn tự động' : 'Hiện tour spotlight lần đầu vào mỗi trang'}</div>
              </div>
              <button role="switch" aria-checked={!tutOff} aria-label={tutOff ? 'Bật tutorial' : 'Tắt toàn bộ tutorial'}
                className={`sw ${tutOff ? '' : 'on'}`} onClick={toggleTut} />
            </div>
            {tutMsg && <div style={{ padding: '9px 12px', borderRadius: 11, fontSize: 12.5, background: 'var(--jade-soft)', color: 'var(--jade)' }}>{tutMsg}</div>}
            <button onClick={resetTut} className="chip" style={{ width: 'fit-content', fontSize: 12, padding: '8px 14px' }}>Xem lại hướng dẫn từ đầu</button>
          </div>
        </div>

        {[
          { gl: 'Tiểu Tâm', items: [
            { icon: 'spark', tint: 'var(--jade-soft)', color: 'var(--jade)', n: 'Chế độ tính cách', v: tt ? personaLabel[tt.personaMode] : 'Đang tải', open: 'persona' as const },
            { icon: 'spark', tint: 'rgba(152,137,232,.14)', color: 'var(--violet)', n: 'Gợi ý chủ động', v: tt?.proactive ? 'Bật' : 'Tắt', open: 'proactive' as const },
          ]},
          { gl: 'Tổ chức', items: [
            { icon: 'coffee', tint: 'var(--amber-soft)', color: 'var(--amber)', n: 'Thông tin tổ chức', v: org?.name ?? 'Đang tải', open: 'org' as const },
            { icon: 'users', tint: 'var(--s3)', color: 'var(--dim)', n: 'Thành viên & quyền', v: members.length ? `${members.length} thành viên` : 'Xem', open: 'members' as const },
          ]},
        ].map((g) => (
          <div key={g.gl} style={{ margin: '20px 20px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', padding: '0 4px 8px' }}>{g.gl}</div>
            <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
              {g.items.map((it, i) => (
                <button key={it.n} onClick={() => setPanel(it.open)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', border: 'none', borderBottom: i < g.items.length - 1 ? '1px solid var(--line)' : 'none', background: 'none', color: 'var(--txt)', textAlign: 'left' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: it.tint, color: it.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={it.icon} size={16} /></div>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{it.n}</div>
                  {it.v && <span className="mono" style={{ fontSize: 12.5, color: 'var(--mut)' }}>{it.v}</span>}
                  <Icon name="chevron" size={18} style={{ color: 'var(--faint)' }} />
                </button>
              ))}
            </div>
          </div>
        ))}
        {panel && <div className="card" style={{ margin: '20px', borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><b style={{ flex: 1 }}>{panel === 'persona' ? 'Chế độ tính cách' : panel === 'proactive' ? 'Gợi ý chủ động' : panel === 'org' ? 'Thông tin tổ chức' : 'Thành viên & quyền'}</b><button className="chip" onClick={() => setPanel('')}>Đóng</button></div>
          {panel === 'persona' && <div style={{ display: 'grid', gap: 8 }}>{(['friendly','professional','concise','playful'] as PersonaMode[]).map((m) => <button key={m} className={tt?.personaMode === m ? 'btn-p' : 'chip'} disabled={busy === 'tt'} onClick={() => saveTt({ personaMode: m })}>{personaLabel[m]}</button>)}</div>}
          {panel === 'proactive' && <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{tt?.proactive ? 'Đang bật' : 'Đang tắt'}</div><div className="mut" style={{ fontSize: 12 }}>{tt?.proactiveNote ?? 'Preference lưu ở backend qua PATCH /tieu-tam/settings.'}</div></div><button role="switch" aria-checked={!!tt?.proactive} className={`sw ${tt?.proactive ? 'on' : ''}`} disabled={busy === 'tt'} onClick={() => saveTt({ proactive: !tt?.proactive })} /></div>}
          {panel === 'org' && <div style={{ display: 'grid', gap: 10 }}><div className="mut" style={{ fontSize: 12 }}>Slug: <span className="mono">{org?.slug}</span> · {org?.memberCount ?? members.length} thành viên</div><input style={inputSt} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Tên tổ chức" /><input style={inputSt} value={orgEmoji} onChange={(e) => setOrgEmoji(e.target.value)} placeholder="Emoji logo" /><button className="btn-p" disabled={busy === 'org'} onClick={saveOrg}>{busy === 'org' ? 'Đang lưu…' : 'Lưu tổ chức'}</button></div>}
          {panel === 'members' && <div style={{ display: 'grid', gap: 10 }}>{members.length === 0 ? <div className="mut">Bạn cần quyền quản lý để xem danh sách thành viên.</div> : members.map((m) => <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid var(--line)', borderRadius: 12 }}><div className="ava" style={{ width: 34, height: 34, borderRadius: 12, background: m.avatarColor ?? 'var(--jade-soft)' }}>{(m.displayName ?? '?').slice(0,1)}</div><div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{m.displayName ?? 'Thành viên'}</div><div className="mut" style={{ fontSize: 11 }}>L{m.securityLevel ?? 1} · {m.email ?? m.phone ?? m.id.slice(0,8)}</div></div><select value={m.role} disabled={busy === `role:${m.id}` || role !== 'owner'} onChange={(e) => changeRole(m.id, e.target.value)} style={{ ...inputSt, width: 118 }}><option value="owner">owner</option><option value="manager">manager</option><option value="staff">staff</option></select></div>)}</div>}
        </div>}
        <div style={{ margin: '20px 20px 0' }}>
          <div className="card" style={{ borderRadius: 16 }}>
            <button onClick={() => { clearSession(); router.replace('/'); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', background: 'none', border: 'none', color: 'var(--rose)', fontSize: 14, fontWeight: 500 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--s3)', display: 'grid', placeItems: 'center' }}><Icon name="logout" size={16} /></div>
              Đăng xuất
            </button>
          </div>
        </div>
        <div style={{ height: 14 }} />
      </div>
    </Shell>
  );
}
