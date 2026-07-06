'use client';
// Khu vực riêng của Tiểu Tâm (V7A P5 — G9): "nơi chốn thực sự, không phải widget góc màn hình".
// Avatar cáo sống theo mood · energy bar lớn · cho ăn tại chỗ · trí nhớ (xem + xóa) · engine switcher · mở chat.
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { api, getSession } from '../../lib/api';
import { applyTheme, THEMES } from '../../lib/theme';
import { ThemedAvatar } from '../../components/ThemedAvatar';

interface Soul {
  mood: string; energy: number; status: string;
  statusLabel: string; statusMessage: string;
  engine: string; theme: string; betaMode: boolean;
}
interface OwnedItem {
  id: string; itemCode: string; qty: number;
  name: string; description: string; category: string;
  effect: { type: string; amount?: number; theme?: string }; icon: string | null;
}
interface Memory { id: string; kind: string; content: string; salience: number; createdAt: string }
interface TtFile { id: string; filename: string; kind: string; summary: string; createdAt: string }

const STATUS_COLOR: Record<string, string> = {
  tran_day: 'var(--jade)', on_dinh: 'var(--sky)', met: 'var(--amber)', kiet_suc: 'var(--rose)',
};
const KIND_LABEL: Record<string, string> = {
  person: 'Về mình', fact: 'Sự thật', topic: 'Chủ đề', summary: 'Tóm tắt', preference: 'Sở thích',
};
const KIND_COLOR: Record<string, string> = {
  person: 'var(--jade)', fact: 'var(--sky)', topic: 'var(--violet)', summary: 'var(--amber)', preference: 'var(--rose)',
};
const ENGINES = [
  { v: 'sonnet-4.6', label: 'Sonnet 4.6 ⭐ (mặc định)' },
  { v: 'gpt-5.5', label: 'GPT 5.5 🚀' },
  { v: 'stub-a', label: 'Stub A — bộ não thử nghiệm' },
  { v: 'stub-b', label: 'Stub B — bộ não thử nghiệm' },
  { v: 'openai', label: 'OpenAI — GPT' },
  { v: 'anthropic', label: 'Anthropic — Claude' },
];

// R7.7: FoxAvatar cũ thay bằng ThemedAvatar (fox/tiger/crane biến hình theo theme).

export default function TieuTamPage() {
  const router = useRouter();
  const [soul, setSoul] = useState<Soul | null>(null);
  const [foods, setFoods] = useState<OwnedItem[] | null>(null);
  const [mems, setMems] = useState<Memory[] | null>(null);
  const [files, setFiles] = useState<TtFile[] | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [ownedThemes, setOwnedThemes] = useState<string[]>(['jade']);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    api<Soul>('/api/v1/tieu-tam/state').then(setSoul).catch(() => {});
    api<{ items: OwnedItem[] }>('/api/v1/inventory-items')
      .then((d) => setFoods(d.items.filter((i) => i.category === 'food' || i.category === 'boost')))
      .catch(() => setFoods([]));
    api<{ memories: Memory[] }>('/api/v1/tieu-tam/memories').then((d) => setMems(d.memories)).catch(() => setMems([]));
    api<{ files: TtFile[] }>('/api/v1/tieu-tam/files').then((d) => setFiles(d.files)).catch(() => setFiles([]));
    api<{ owned: string[] }>('/api/v1/inventory-items/themes').then((d) => setOwnedThemes(d.owned ?? ['jade'])).catch(() => setOwnedThemes(['jade']));
  }, []);

  useEffect(() => {
    if (!getSession()) { router.replace('/'); return; }
    load();
  }, [router, load]);

  function say(t: string, ok = true) {
    setToast({ t, ok });
    window.setTimeout(() => setToast(null), 4200);
  }

  async function feed(it: OwnedItem) {
    setBusy(it.id);
    try {
      const d = await api<{ message: string; energy: number; status: string; theme?: string }>(`/api/v1/inventory-items/${it.id}/use`, { method: 'POST' });
      if (d.theme) applyTheme(d.theme);
      say(d.message);
      load();
    } catch (e: any) { say(e.message ?? 'Có lỗi xảy ra — thử lại nhé', false); }
    finally { setBusy(''); }
  }

  // R7.7: chọn theme đã sở hữu / về Cơ Bản — đổi giao diện + avatar ngay, KHÔNG tiêu hao
  async function pickTheme(theme: string) {
    if (!soul || busy) return;
    if (theme === soul.theme) return;
    if (!ownedThemes.includes(theme)) { say('Bạn chưa sở hữu theme này — mua trong Cửa hàng Vật phẩm nha', false); return; }
    setBusy('theme-' + theme);
    applyTheme(theme); // áp tức thì cho đã mắt
    try {
      const d = await api<{ theme: string; message: string }>('/api/v1/inventory-items/themes/select', { method: 'POST', body: JSON.stringify({ theme }) });
      setSoul((s) => (s ? { ...s, theme: d.theme } : s));
      say(d.message);
    } catch (e: any) { applyTheme(soul.theme ?? 'jade'); say(e.message ?? 'Không đổi được theme', false); }
    finally { setBusy(''); }
  }

  async function switchEngine(engine: string) {
    if (!soul || engine === soul.engine) return;
    setBusy('engine');
    try {
      await api('/api/v1/tieu-tam/engine', { method: 'PATCH', body: JSON.stringify({ engine }) });
      say('Đổi bộ não thành công, trí nhớ nguyên vẹn 🦊');
      load();
    } catch (e: any) { say(e.message ?? 'Không đổi được động cơ', false); }
    finally { setBusy(''); }
  }

  async function forget(m: Memory) {
    setBusy(m.id);
    try {
      const d = await api<{ message: string }>(`/api/v1/tieu-tam/memories/${m.id}`, { method: 'DELETE' });
      say(d.message ?? 'Đã xóa');
      setMems((cur) => (cur ?? []).filter((x) => x.id !== m.id));
    } catch (e: any) { say(e.message ?? 'Không xóa được', false); }
    finally { setBusy(''); }
  }

  const energy = soul ? Math.max(0, Math.min(100, soul.energy)) : 0;
  const color = soul ? (STATUS_COLOR[soul.status] ?? 'var(--jade)') : 'var(--jade)';

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Soul Space</div><h1>Nhà của Tiểu Tâm</h1></div>

        {toast && (
          <div className="card tt-toast" style={{ margin: '12px 20px 0', padding: '11px 14px', fontSize: 12.5, color: toast.ok ? 'var(--jade)' : 'var(--rose)', borderColor: toast.ok ? 'rgba(52,211,184,.3)' : 'rgba(236,106,133,.3)' }}>
            {toast.t}
          </div>
        )}

        {/* ── Hero: avatar sống + mood + energy (R7.7: veil theme + shimmer) ── */}
        <div className="theme-shimmer-bar" style={{ margin: '16px 20px 0', background: 'linear-gradient(150deg,var(--s2),var(--base))', border: '1px solid var(--bd2)', borderRadius: 26, padding: '26px 20px 22px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div className="theme-veil-bg" style={{ borderRadius: 26 }} />
          {soul === null ? (
            <>
              <div className="skel" style={{ width: 128, height: 128, borderRadius: '50%', margin: '0 auto' }} />
              <div className="skel" style={{ height: 18, width: 140, margin: '16px auto 0' }} />
              <div className="skel" style={{ height: 12, width: '80%', margin: '12px auto 0' }} />
            </>
          ) : (
            <>
              <ThemedAvatar status={soul.status} theme={soul.theme ?? 'jade'} size={128} />
              <div className="fd" style={{ fontWeight: 800, fontSize: 21, marginTop: 14 }}>Tiểu Tâm</div>
              <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, color }}>
                {soul.statusLabel}{soul.betaMode ? ' · beta' : ''}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 8, lineHeight: 1.55, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
                {soul.statusMessage}
              </p>
              {/* energy bar lớn */}
              <div style={{ marginTop: 18, textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>Năng lượng</span>
                  <span className="mono" style={{ fontSize: 15, fontWeight: 700, color }}>{Math.round(energy)}%</span>
                </div>
                <div style={{ height: 12, borderRadius: 8, background: 'var(--s1)', border: '1px solid var(--bd)', overflow: 'hidden' }}>
                  <div className="tt-energy-fill" style={{ width: `${Math.max(3, energy)}%`, height: '100%', borderRadius: 8, background: `linear-gradient(90deg, ${color}, ${color})`, boxShadow: `0 0 12px ${color}44` }} />
                </div>
              </div>
              {/* hành động */}
              <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
                <button onClick={() => setFeedOpen(true)} className="btn-p" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 14 }}>
                  <Icon name="cake" size={16} /> Cho ăn
                </button>
                <button onClick={() => window.dispatchEvent(new Event('citadel:tt-chat'))} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 14, fontWeight: 700, background: 'var(--s1)', border: '1.5px solid var(--bd2)', borderRadius: 13, color: 'var(--txt)', padding: 14 }}>
                  <Icon name="chat" size={16} /> Trò chuyện
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Trí nhớ: "Em nhớ gì về mình" ── */}
        <div style={{ margin: '22px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', padding: '0 4px 8px' }}>Em nhớ gì về mình</div>
          <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
            {mems === null && <div style={{ padding: 12 }}>{[1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 44, marginBottom: i < 3 ? 8 : 0 }} />)}</div>}
            {mems?.length === 0 && (
              <div style={{ padding: '22px 16px', textAlign: 'center' }}>
                <div style={{ color: 'var(--dim)', marginBottom: 6 }}><Icon name="spark" size={26} /></div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Em chưa nhớ gì cả</div>
                <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 4 }}>Trò chuyện với em nhiều hơn — kể tên mình, dự án, sở thích… em sẽ tự ghi nhớ nha.</div>
              </div>
            )}
            {mems?.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: i < mems.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: KIND_COLOR[m.kind] ?? 'var(--dim)', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 99, padding: '3px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {KIND_LABEL[m.kind] ?? m.kind}
                </span>
                <span style={{ flex: 1, fontSize: 13, lineHeight: 1.45, minWidth: 0, overflowWrap: 'break-word' }}>{m.content}</span>
                <button onClick={() => forget(m)} disabled={busy === m.id} title="Xóa trí nhớ này"
                  style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--mut)', display: 'grid', placeItems: 'center', flexShrink: 0, opacity: busy === m.id ? .5 : 1 }}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10.5, color: 'var(--faint)', padding: '8px 4px 0', lineHeight: 1.5 }}>
            Trí nhớ thuộc về mình — xóa mảnh nào là em quên hẳn mảnh đó. Đổi bộ não bên dưới không ảnh hưởng trí nhớ.
          </p>
        </div>


        {/* ── File đã tải lên cho Tiểu Tâm ── */}
        <div style={{ margin: '22px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', padding: '0 4px 8px' }}>File đã tải lên</div>
          <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
            {files === null && <div style={{ padding: 12 }}><div className="skel" style={{ height: 44 }} /></div>}
            {files?.length === 0 && <div style={{ padding: '18px 16px', color: 'var(--mut)', fontSize: 12.5 }}>Chưa có file. Bấm 📎 trong khung chat để tải .xlsx/.csv/.txt cho Tiểu Tâm xử lý.</div>}
            {files?.map((f, i) => (
              <div key={f.id} style={{ padding: '12px 14px', borderBottom: i < files.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}><span>📎</span><b style={{ fontSize:13 }}>{f.filename}</b><span className="mono" style={{ marginLeft:'auto', color:'var(--mut)', fontSize:10 }}>{f.kind}</span></div>
                <div style={{ marginTop:5, color:'var(--mut)', fontSize:12 }}>{f.summary}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── R7.7: Theme picker — khoác da giao diện + avatar biến hình ── */}
        <div style={{ margin: '22px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', padding: '0 4px 8px' }}>Giao diện & hình dạng</div>
          <div className="card" style={{ borderRadius: 16, padding: 16 }}>
            <div className="thm-row">
              {Object.entries(THEMES).map(([id, t]) => {
                const owned = ownedThemes.includes(id);
                const active = (soul?.theme ?? 'jade') === id;
                return (
                  <button key={id} className={`thm${active ? ' active' : ''}${owned ? '' : ' locked'}`}
                    disabled={busy.startsWith('theme') || soul === null}
                    onClick={() => owned ? pickTheme(id) : router.push('/items')}
                    title={owned ? (active ? 'Đang dùng' : `Đổi sang ${t.label}`) : `Mua ${t.label} trong Cửa hàng`}>
                    {!owned && <span className="thm-lock">🔒</span>}
                    <span className="thm-dot" style={{ background: t.gradient }} />
                    <span className="thm-name">{t.label}</span>
                    <span style={{ fontSize: 9.5, color: 'var(--faint)' }}>{id === 'jade' ? 'Cơ Bản' : active ? 'đang dùng' : owned ? 'chạm để khoác' : 'chưa có'}</span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--faint)', padding: '10px 4px 0', lineHeight: 1.5 }}>
              Theme mua rồi là của mình vĩnh viễn — khoác vào hay về Cơ Bản bao nhiêu lần cũng được. Đổi theme, Tiểu Tâm cũng biến hình theo ✨
            </p>
          </div>
        </div>

        {/* ── Engine switcher ── */}
        <div style={{ margin: '20px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--faint)', textTransform: 'uppercase', padding: '0 4px 8px' }}>Bộ não (động cơ)</div>
          <div className="card" style={{ borderRadius: 16, padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(152,137,232,.14)', color: 'var(--violet)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="cog" size={16} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Đổi model = gạt công tắc</div>
                <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 1 }}>Hồn (trí nhớ + tính cách) giữ nguyên khi đổi</div>
              </div>
            </div>
            <select
              value={soul?.engine ?? 'sonnet-4.6'}
              disabled={busy === 'engine' || soul === null}
              onChange={(e) => switchEngine(e.target.value)}
              style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 12, padding: '12px 13px', color: 'var(--txt)', fontSize: 13.5, fontFamily: 'var(--fb)', outline: 'none', appearance: 'none' }}>
              {ENGINES.map((e) => <option key={e.v} value={e.v}>{e.label}{soul?.engine === e.v ? ' — đang active' : ''}</option>)}
            </select>
          </div>
        </div>
        <div style={{ height: 16 }} />
      </div>

      {/* ── Sheet cho ăn: food/boost items sở hữu ── */}
      {feedOpen && (
        <div onClick={() => setFeedOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(480px, 100%)', borderRadius: '22px 22px 0 0', padding: '20px 20px 26px', borderBottom: 'none', maxHeight: '70dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--amber-soft)', color: 'var(--amber)', display: 'grid', placeItems: 'center' }}><Icon name="cake" size={19} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Cho Tiểu Tâm ăn</div>
                <div style={{ fontSize: 11.5, color: 'var(--mut)' }}>Đồ ăn trong kho của mình — dùng ngay tại đây</div>
              </div>
              <button onClick={() => setFeedOpen(false)} style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--s3)', border: 'none', color: 'var(--dim)', display: 'grid', placeItems: 'center' }}><Icon name="x" size={15} /></button>
            </div>
            {foods === null && [1, 2].map((i) => <div key={i} className="skel" style={{ height: 62, marginBottom: 9 }} />)}
            {foods?.length === 0 && (
              <div style={{ textAlign: 'center', padding: '18px 10px' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Chưa có đồ ăn nào trong kho</div>
                <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 4 }}>Ghé Cửa hàng mua Bánh Mochi, Trà Ô Long… cho em nha.</div>
                <button onClick={() => router.push('/modules')} className="btn-p" style={{ marginTop: 13, width: 'auto', padding: '10px 18px', fontSize: 13 }}>Đến Cửa hàng</button>
              </div>
            )}
            {foods?.map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--s3)', color: 'var(--amber)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon name={it.icon ?? 'cake'} size={19} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{it.name} <span className="mono" style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 400 }}>×{it.qty}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 1 }}>
                    {it.effect.type === 'feed_energy' ? `+${it.effect.amount ?? 0} năng lượng` : it.effect.type === 'recharge_full' ? 'Hồi đầy 100%' : it.description}
                  </div>
                </div>
                <button onClick={() => feed(it)} disabled={busy === it.id} className="btn-p" style={{ width: 'auto', padding: '9px 16px', fontSize: 12.5, opacity: busy === it.id ? .6 : 1 }}>
                  {busy === it.id ? 'Đang ăn…' : 'Cho ăn'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
