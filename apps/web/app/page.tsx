'use client';
// R3 Landing public — hero animated grid (port ý tưởng magicui animated-grid-pattern, CSS thuần),
// aurora gradient text, bento features, number-ticker stats. Đã login → redirect /home.
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../components/Icon';
import { NumberTicker } from '../components/NumberTicker';
import { apiLogin, getSession, API, DEMO_TOKEN } from '../lib/api';

const FEATURES = [
  { icon: 'book', name: 'Kế Toán', desc: 'Sổ cái kép, thu chi, công nợ, lãi lỗ theo thời gian thực.', color: 'var(--jade)', tint: 'var(--jade-soft)' },
  { icon: 'target', name: 'CRM', desc: 'Pipeline 5 giai đoạn, khách hàng, deal, chăm sóc tự động.', color: 'var(--violet)', tint: 'var(--violet-soft)' },
  { icon: 'box', name: 'Kho Hàng', desc: 'Tồn kho chính xác, cảnh báo sắp hết, nhập hàng một chạm.', color: 'var(--amber)', tint: 'var(--amber-soft)' },
  { icon: 'users', name: 'Nhân Sự & Ca', desc: 'Phân ca, chấm công, nghỉ phép — vận hành đội ngũ gọn nhẹ.', color: 'var(--sky)', tint: 'var(--sky-soft)' },
  { icon: 'coin', name: 'Ví Om', desc: 'Đồng Om nội bộ: mua module, thuê theo ngày, vòng kinh tế khép kín.', color: 'var(--amber)', tint: 'var(--amber-soft)' },
  { icon: 'spark', name: 'Tiểu Tâm AI', desc: 'Trợ lý cáo nhỏ hiểu số liệu thật của quán — hỏi gì đáp nấy.', color: 'var(--jade)', tint: 'var(--jade-soft)' },
];

const STATS = [
  { value: 8, suffix: '', label: 'Module nghiệp vụ sẵn sàng' },
  { value: 9, suffix: '/9', label: 'Chuẩn nghiệm thu đạt' },
  { value: 100, suffix: '%', label: 'Dữ liệu thật — không mock' },
  { value: 13, suffix: '', label: 'Ký tự token là vào ngay' },
];

// ô sáng trên grid — deterministic để tránh hydration mismatch/React #418 khi SSR
function gridRand(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function useGridCells(n = 14) {
  return useMemo(() => Array.from({ length: n }, (_, i) => ({
    id: i,
    left: Math.floor(gridRand(i, 1) * 24) * 44,
    top: Math.floor(gridRand(i, 2) * 16) * 44,
    dur: 3.5 + gridRand(i, 3) * 4,
    delay: gridRand(i, 4) * 5,
  })), [n]);
}

export default function Landing() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const cells = useGridCells();

  useEffect(() => {
    if (getSession()) { router.replace('/home'); return; }
    setReady(true);
  }, [router]);

  async function go(tok?: string) {
    if (busy) return;
    setBusy(true); setErr('');
    try { await apiLogin(tok ?? token); router.replace('/home'); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!ready) return <div className="ld" />;

  return (
    <div className="ld">
      {/* ── HERO ── */}
      <section className="ld-hero">
        <div className="ld-grid" aria-hidden>
          {cells.map((c) => (
            <i key={c.id} style={{ left: c.left, top: c.top, ['--gd' as any]: `${c.dur}s`, ['--gdel' as any]: `${c.delay}s` }} />
          ))}
        </div>
        <div className="ld-kick"><Icon name="spark" size={13} /> Tiểu Tâm-First Business OS</div>
        <h1 className="ld-e1"><span className="ld-aurora">SUPERCITADEL</span></h1>
        <p className="ld-tag ld-e2">Pháo đài quản trị cho doanh nghiệp Việt — kế toán, CRM, kho, nhân sự và trợ lý AI Tiểu Tâm trong một tòa thành.</p>
        <div className="ld-cta ld-e3">
          {DEMO_TOKEN && <button className="ld-btn-p" disabled={busy} onClick={() => go(DEMO_TOKEN)}>{busy ? 'Đang vào…' : '🔓 Vào dùng thử ngay'}</button>}
          <button className="ld-btn-s" onClick={() => setShowLogin((v) => !v)}>Đăng nhập bằng token</button>
        </div>
        {showLogin && (
          <div className="ld-login">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13))}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              placeholder="A7KX9M2PQ4RB3"
              autoFocus
              className="mono"
              style={{ width: '100%', padding: 15, borderRadius: 13, border: '1.5px solid var(--bd2)', background: 'var(--s1)', color: 'var(--jade)', fontSize: 17, letterSpacing: 5, textAlign: 'center', outline: 'none' }}
            />
            <button className="btn-p" onClick={() => go()} disabled={busy} style={{ marginTop: 11, opacity: busy ? .6 : 1 }}>
              {busy ? 'Đang mở khóa…' : 'Mở khóa pháo đài'}
            </button>
          </div>
        )}
        {err && <p style={{ marginTop: 14, fontSize: 13, color: 'var(--rose)' }}>{err}</p>}
        <div className="ld-badges">
          <span className="ld-bdg warm">✦ Beta mở — miễn phí</span>
          <span className="ld-bdg cool">● Backend thật 100%</span>
        </div>
        <div className="ld-scrolldn">▾ CUỘN XUỐNG</div>
      </section>

      {/* ── MARQUEE MODULE (port magicui marquee → CSS thuần) ── */}
      <div className="ld-marquee" aria-hidden>
        <div className="mq-track">
          {[0, 1].map((rep) => (
            <span key={rep} style={{ display: 'flex', gap: 14 }}>
              {[...FEATURES, { icon: 'grid', name: 'Cửa hàng Module', color: 'var(--sky)', tint: '', desc: '' }, { icon: 'bag', name: 'Kho vật phẩm', color: 'var(--violet)', tint: '', desc: '' }].map((f) => (
                <span key={rep + f.name} className="mq-item"><Icon name={f.icon} style={{ color: f.color }} /> {f.name}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ── 3 BƯỚC BẮT ĐẦU ── */}
      <section className="ld-sect">
        <div className="sh">Bắt đầu trong 3 bước</div>
        <div className="sd">Không cài đặt, không thẻ tín dụng — vào thẳng bằng trình duyệt.</div>
        <div className="ld-steps">
          {[
            { n: '01', t: 'Vào dùng thử', d: 'Bấm “Vào dùng thử ngay” — hệ thống mở sẵn tài khoản demo với dữ liệu thật.' },
            { n: '02', t: 'Bật module cần dùng', d: 'Kế toán, CRM, kho, nhân sự… bật tắt như công tắc. Thuê theo ngày bằng đồng Om nếu muốn thử.' },
            { n: '03', t: 'Hỏi Tiểu Tâm', d: 'Trợ lý AI hiểu số liệu của bạn — doanh thu, deal, tồn kho, ca làm… hỏi gì đáp nấy.' },
          ].map((s) => (
            <div key={s.n} className="ld-step">
              <div className="sn">{s.n}</div>
              <b>{s.t}</b>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── BENTO FEATURES ── */}
      <section className="ld-sect">
        <div className="sh">Một tòa thành, đủ mọi nghiệp vụ</div>
        <div className="sd">Bật module khi cần, thuê theo ngày khi muốn thử — trả bằng đồng Om.</div>
        <div className="ld-bento">
          {FEATURES.map((f) => (
            <div key={f.name} className="ld-cell" style={{ ['--cell-tint' as any]: f.tint }}>
              <div className="ci" style={{ background: f.tint, color: f.color }}><Icon name={f.icon} size={20} /></div>
              <b>{f.name}</b>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="ld-sect">
        <div className="sh">Người dùng thử nói gì</div>
        <div className="sd">Phản hồi từ những chủ quán đầu tiên trong beta.</div>
        <div className="ld-quotes">
          {[
            { q: 'Trước giờ ghi sổ tay, giờ phiếu thu chi vào thẳng sổ cái kép. Cuối tháng nhìn lãi lỗ một phát là ra.', n: 'Chị Lan', r: 'Chủ quán cà phê · Đà Nẵng', ava: 'amber' },
            { q: 'Thuê CRM 7 ngày bằng Om để thử — hợp thì mua đứt. Không bị ép gói năm như phần mềm khác.', n: 'Anh Minh', r: 'Tiệm bánh · Sài Gòn', ava: 'mint' },
            { q: 'Tiểu Tâm trả lời “tồn kho sữa còn bao nhiêu” nhanh hơn mình mở bảng tính. Còn nhắc hàng sắp hết.', n: 'Cô Hạnh', r: 'Tạp hóa · Hà Nội', ava: 'violet' },
          ].map((t) => (
            <div key={t.n} className="ld-quote">
              <div className="qi2"><Icon name="quote" size={20} /></div>
              <p className="qt">“{t.q}”</p>
              <div className="qa2">
                <span className={`ava ${t.ava}`} style={{ width: 34, height: 34, borderRadius: 11, fontSize: 12 }}>{t.n.split(' ').pop()!.slice(0, 1)}</span>
                <span><b>{t.n}</b><span>{t.r}</span></span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="ld-sect">
        <div className="sh">Hoạt động thật, số liệu thật</div>
        <div className="sd">Không mock, không demo giả — mọi con số chạy trên dữ liệu thật của bạn.</div>
        <div className="ld-stats">
          {STATS.map((s) => (
            <div key={s.label} className="ld-stat">
              <div className="n"><NumberTicker value={s.value} suffix={s.suffix} /></div>
              <div className="l">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="ld-foot">
        <b>SUPERCITADEL</b> · Pháo đài quản trị cho doanh nghiệp Việt · API {API.replace(/^https?:\/\//, '')}
      </footer>
    </div>
  );
}
