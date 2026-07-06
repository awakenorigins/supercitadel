'use client';
// R3 ModuleLocked — biết trạng thái thật của module (purchased/rented/inactive/hết hạn thuê)
// để đưa đúng hành động: Bật lại ngay · Gia hạn · Tới Cửa hàng.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { api } from '../lib/api';
import { invalidateOwnedBar } from './OwnedBar';

interface Mod { id: string; purchased: boolean; rentedUntil: string | null; rentDaysLeft: number | null }

export function ModuleLocked({ name, id }: { name: string; id?: string }) {
  const router = useRouter();
  const [mod, setMod] = useState<Mod | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) return;
    api<{ modules: Mod[] }>('/api/v1/modules')
      .then((d) => setMod(d.modules.find((m) => m.id === id) ?? null))
      .catch(() => {});
  }, [id]);

  const rentExpired = mod && !mod.purchased && mod.rentedUntil && mod.rentDaysLeft === null;
  const ownedInactive = mod && (mod.purchased || (mod.rentDaysLeft !== null));

  async function reactivate() {
    if (!id) return;
    setBusy(true); setErr('');
    try {
      await api(`/api/v1/modules/${id}/activate`, { method: 'POST' });
      invalidateOwnedBar();
      window.location.reload();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div style={{ padding: '60px 30px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--s2)', border: '1px solid var(--bd2)', display: 'grid', placeItems: 'center', margin: '0 auto 18px', color: rentExpired ? 'var(--rose)' : 'var(--mut)' }}><Icon name="shield" size={28} /></div>
      <b className="fd" style={{ fontSize: 17 }}>{rentExpired ? `${name} đã hết hạn thuê` : `${name} chưa kích hoạt`}</b>
      <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
        {rentExpired
          ? 'Gia hạn trong Cửa hàng để tiếp tục sử dụng.'
          : ownedInactive
            ? 'Bạn đã sở hữu module này — chỉ cần bật lại.'
            : 'Mua hoặc thuê module trong Cửa hàng để sử dụng.'}
      </p>
      {ownedInactive && !rentExpired ? (
        <button className="btn-p" style={{ maxWidth: 220, margin: '18px auto 0', opacity: busy ? .6 : 1 }} disabled={busy} onClick={reactivate}>
          {busy ? 'Đang bật…' : 'Bật lại ngay'}
        </button>
      ) : rentExpired ? (
        <button className="btn-p" style={{ maxWidth: 220, margin: '18px auto 0' }} onClick={() => router.push(`/modules?rent=${id}`)}>Gia hạn</button>
      ) : (
        <button className="btn-p" style={{ maxWidth: 220, margin: '18px auto 0' }} onClick={() => router.push('/modules')}>Tới Cửa hàng Module</button>
      )}
      {err && <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--rose)' }}>{err}</p>}
    </div>
  );
}
