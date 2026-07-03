'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../components/Icon';
import { apiLogin, getSession, API, DEMO_TOKEN } from '../lib/api';

export default function Login() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiUp, setApiUp] = useState<'…' | 'OK' | 'down'>('…');

  useEffect(() => {
    if (getSession()) { router.replace('/home'); return; }
    fetch(`${API}/health`).then((r) => r.json()).then((d) => setApiUp(d.ok ? 'OK' : 'down')).catch(() => setApiUp('down'));
  }, [router]);

  async function go(tok?: string) {
    if (busy) return;
    setBusy(true); setErr('');
    try { await apiLogin(tok ?? token); router.replace('/home'); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="ambient" />
      <main className="shell" style={{ justifyContent: 'center', padding: 30 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div className="core" style={{ width: 110, height: 110, marginBottom: 26 }}>
            <div className="pulse" /><div className="pulse" />
            <div className="orb"><Icon name="spark" size={40} /></div>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--jade)', letterSpacing: '.16em', textTransform: 'uppercase' }}>SUPERCITADEL · Tiểu Tâm-First Business OS</div>
          <h1 className="fd" style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.1, letterSpacing: '-.03em', marginTop: 12 }}>
            Chào, tôi là <span style={{ color: 'var(--jade)' }}>Tiểu Tâm</span>.
          </h1>
          <p className="dim" style={{ fontSize: 13.5, marginTop: 10, maxWidth: 300, lineHeight: 1.55 }}>
            Nhập token 13 ký tự để mở khóa pháo đài của bạn.
          </p>
          <div style={{ width: '100%', maxWidth: 320, marginTop: 26 }}>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13))}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              placeholder="A7KX9M2PQ4RB3"
              className="mono"
              style={{ width: '100%', padding: 15, borderRadius: 13, border: '1.5px solid var(--bd2)', background: 'var(--s1)', color: 'var(--jade)', fontSize: 18, letterSpacing: 5, textAlign: 'center', outline: 'none' }}
            />
            <button className="btn-p" onClick={() => go()} disabled={busy} style={{ marginTop: 14, opacity: busy ? .6 : 1 }}>
              {busy ? 'Đang mở khóa…' : 'Mở khóa pháo đài'}
            </button>
            {DEMO_TOKEN && (
              <>
                <div className="beta-banner">🔓 BETA MỞ — dùng thử không cần token</div>
                <button className="btn-demo" disabled={busy} onClick={() => go(DEMO_TOKEN)}>
                  {busy ? 'Đang vào…' : 'Vào dùng thử ngay'}
                </button>
              </>
            )}
            {err && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--rose)' }}>{err}</p>}
            <p className="mut" style={{ fontSize: 11.5, marginTop: 16 }}>
              API: <b style={{ color: apiUp === 'OK' ? 'var(--jade)' : apiUp === 'down' ? 'var(--rose)' : 'var(--mut)' }}>{apiUp}</b>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
