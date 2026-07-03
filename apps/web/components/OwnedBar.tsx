'use client';
// R3 OwnedBar — thanh chip ngang các module SỞ HỮU (purchased hoặc đang thuê).
// 🟢 active · ⚪ inactive (bấm = bật ngay) · 🟡 thuê còn hạn · 🔴 thuê ≤3 ngày (bấm = tới gia hạn).
import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, getSession } from '../lib/api';

interface Mod {
  id: string; name: string; route: string; tier: string; status: string;
  active: boolean; purchased: boolean; rentedUntil: string | null; rentDaysLeft: number | null;
}

// cache module-level đơn giản: fetch 1 lần / mount app, các trang dùng chung
let cache: Mod[] | null = null;
let cacheAt = 0;
const TTL = 30_000;

export function invalidateOwnedBar() { cache = null; }

export function OwnedBar() {
  const router = useRouter();
  const path = usePathname();
  const [mods, setMods] = useState<Mod[] | null>(cache);
  const [busy, setBusy] = useState('');

  const load = useCallback((force = false) => {
    if (!getSession()) return;
    if (!force && cache && Date.now() - cacheAt < TTL) { setMods(cache); return; }
    api<{ modules: Mod[] }>('/api/v1/modules')
      .then((d) => { cache = d.modules; cacheAt = Date.now(); setMods(d.modules); })
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load, path]);

  if (!mods) return null;
  // chỉ module trả phí đang sở hữu: mua đứt hoặc còn/từng thuê
  const owned = mods.filter((m) => m.tier === 'paid' && m.status === 'ready' && (m.purchased || m.rentedUntil));
  if (!owned.length) return null;

  const dotOf = (m: Mod): { color: string; label: string } => {
    if (!m.purchased && m.rentDaysLeft !== null && m.rentDaysLeft <= 3) return { color: 'var(--rose)', label: `còn ${m.rentDaysLeft}d` };
    if (!m.purchased && m.rentDaysLeft !== null) return { color: 'var(--amber)', label: `còn ${m.rentDaysLeft}d` };
    if (!m.purchased && m.rentedUntil && m.rentDaysLeft === null) return { color: 'var(--rose)', label: 'hết hạn' };
    if (m.active) return { color: 'var(--jade)', label: '' };
    return { color: 'var(--mut)', label: 'tắt' };
  };

  async function tap(m: Mod) {
    const rentUrgent = !m.purchased && m.rentedUntil && (m.rentDaysLeft === null || m.rentDaysLeft <= 3);
    if (rentUrgent) { router.push(`/modules?rent=${m.id}`); return; } // sắp hết/hết hạn → mở sheet gia hạn
    if (!m.active) {
      setBusy(m.id);
      try { await api(`/api/v1/modules/${m.id}/activate`, { method: 'POST' }); load(true); }
      catch { router.push('/modules'); }
      finally { setBusy(''); }
      return;
    }
    router.push(m.route);
  }

  return (
    <div className="owned-bar">
      {owned.map((m) => {
        const d = dotOf(m);
        return (
          <button key={m.id} className="ob-chip" disabled={busy === m.id} onClick={() => tap(m)}
            title={m.active ? `Mở ${m.name}` : `Bật ${m.name}`} style={{ opacity: busy === m.id ? .6 : 1 }}>
            <span className="ob-dot" style={{ background: d.color }} />
            {m.name}
            {d.label && <span className="ob-days" style={{ color: d.color }}>{d.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
