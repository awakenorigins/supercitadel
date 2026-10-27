'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { api, getSession } from '../../lib/api';

interface Result { type: string; id: string; label: string }

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!getSession()) router.replace('/'); }, [router]);

  function onType(v: string) {
    setQ(v);
    if (tRef.current) clearTimeout(tRef.current);
    if (!v.trim()) { setResults(null); return; }
    setBusy(true);
    tRef.current = setTimeout(async () => {
      try { const d = await api<{ results: Result[] }>(`/api/v1/dashboard/search?q=${encodeURIComponent(v)}`); setResults(d.results); }
      catch { setResults([]); }
      finally { setBusy(false); }
    }, 300);
  }

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Toàn pháo đài</div><h1>Tìm Kiếm</h1></div>
        <div style={{ margin: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--s1)', border: '1.5px solid var(--bd)', borderRadius: 14, padding: '12px 14px' }}>
          <Icon name="search" size={17} style={{ color: 'var(--mut)' }} />
          <input value={q} onChange={(e) => onType(e.target.value)} placeholder="Tìm người, deal, tin nhắn…" autoFocus
            style={{ flex: 1, background: 'none', border: 'none', color: 'var(--txt)', fontSize: 14, outline: 'none' }} />
          {busy && <div className="skel" style={{ width: 16, height: 16, borderRadius: '50%' }} />}
        </div>
        <div style={{ marginTop: 8 }}>
          {results?.map((r) => (
            <div key={r.type + r.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
              <div className={`ava ${r.type === 'user' ? 'mint' : 'violet'}`} style={{ width: 36, height: 36, fontSize: 13, borderRadius: 11 }}>{r.label.slice(0, 2)}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.label}</div></div>
              <span className="mono" style={{ fontSize: 9, color: 'var(--faint)', border: '1px solid var(--bd)', borderRadius: 5, padding: '2px 6px' }}>{r.type}</span>
            </div>
          ))}
          {results?.length === 0 && <p className="mut" style={{ padding: 20, fontSize: 13 }}>Không có kết quả cho "{q}".</p>}
          {results === null && <p className="mut" style={{ padding: '16px 20px', fontSize: 12 }}>Gõ để tìm trong tổ chức (debounce 300ms).</p>}
        </div>
      </div>
    </Shell>
  );
}
