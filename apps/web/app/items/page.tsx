'use client';
// Kho vật phẩm (V7A P3 — G3): xem info đầy đủ + Sử dụng → hiệu ứng thật NGAY (energy/theme).
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { api, getSession } from '../../lib/api';
import { applyTheme, THEMES } from '../../lib/theme';

interface OwnedItem {
  id: string; itemCode: string; qty: number; acquiredAt: string;
  name: string; description: string; category: string; price: number;
  effect: { type: string; amount?: number; theme?: string }; icon: string | null;
}
interface UseRes { ok: boolean; message: string; theme?: string; energy?: number; energyBefore?: number; energyAfter?: number; qtyLeft: number }

const CAT_LABEL: Record<string, string> = { food: 'Đồ ăn', decor: 'Trang trí', boost: 'Tăng lực' };
const CAT_COLOR: Record<string, string> = { food: 'var(--amber)', decor: 'var(--violet, #9889e8)', boost: 'var(--jade)' };

function effectText(e: OwnedItem['effect']): string {
  if (e.type === 'feed_energy') return `Cho Tiểu Tâm ăn — năng lượng +${e.amount ?? 0}`;
  if (e.type === 'recharge_full') return 'Hồi đầy 100% năng lượng ngay lập tức';
  if (e.type === 'decor') return `Đổi giao diện sang theme ${THEMES[e.theme ?? '']?.label ?? e.theme}`;
  return 'Hiệu ứng đặc biệt';
}

export default function ItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<OwnedItem[] | null>(null);
  const [sel, setSel] = useState<OwnedItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ t: string; ok: boolean } | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);

  const load = () => {
    api<{ items: OwnedItem[] }>('/api/v1/inventory-items').then((d) => setItems(d.items)).catch(() => setItems([]));
    api<{ energy: number }>('/api/v1/tieu-tam/state').then((d) => setEnergy(d.energy)).catch(() => {});
  };
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } load(); }, [router]);

  async function use(it: OwnedItem) {
    setBusy(true); setToast(null);
    try {
      const d = await api<UseRes>(`/api/v1/inventory-items/${it.id}/use`, { method: 'POST' });
      if (d.theme) applyTheme(d.theme); // decor: đổi màu NGAY
      if (typeof d.energy === 'number') setEnergy(d.energy); // energy bar update NGAY
      setToast({ t: d.message, ok: true });
      setSel(null);
      load();
    } catch (e: any) { setToast({ t: e.message, ok: false }); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}><div className="k">Item Inventory</div><h1>Kho Vật Phẩm</h1></div>
          {energy !== null && (
            <span className="mono" style={{ background: 'var(--jade-soft)', border: '1px solid rgba(52,211,184,.26)', borderRadius: 99, padding: '7px 13px', color: 'var(--jade)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="spark" size={13} /> {energy}%
            </span>
          )}
        </div>

        {toast && (
          <div className="card" style={{ margin: '12px 20px 0', padding: '11px 14px', fontSize: 12.5, color: toast.ok ? 'var(--jade)' : 'var(--rose)', borderColor: toast.ok ? 'rgba(52,211,184,.3)' : 'rgba(236,106,133,.3)' }}>
            {toast.t}
          </div>
        )}

        {items?.length === 0 && (
          <div className="card" style={{ margin: '16px 20px 0', padding: 22, textAlign: 'center' }}>
            <div style={{ color: 'var(--dim)', marginBottom: 8 }}><Icon name="bag" size={34} /></div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Kho còn trống</div>
            <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 4 }}>Ghé Cửa hàng mua đồ ăn cho Tiểu Tâm hoặc theme trang trí nha.</div>
            <button onClick={() => router.push('/modules')} className="btn-p" style={{ marginTop: 14, width: 'auto', padding: '11px 20px', fontSize: 13 }}>Đến Cửa hàng</button>
          </div>
        )}

        {/* grid vật phẩm sở hữu */}
        <div style={{ padding: '14px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {items === null && [1, 2, 3, 4].map((i) => <div key={i} className="skel" style={{ height: 120, borderRadius: 16 }} />)}
          {items?.map((it) => (
            <button key={it.id} onClick={() => setSel(it)} className="card" style={{ padding: 14, borderRadius: 16, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--s3)', color: CAT_COLOR[it.category] ?? 'var(--jade)', display: 'grid', placeItems: 'center' }}>
                  <Icon name={it.icon ?? 'gift'} size={19} />
                </div>
                <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', background: 'var(--s3)', borderRadius: 99, padding: '3px 9px' }}>×{it.qty}</span>
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{it.name}</div>
                <div style={{ fontSize: 10.5, color: CAT_COLOR[it.category] ?? 'var(--mut)', marginTop: 2, fontWeight: 600 }}>{CAT_LABEL[it.category] ?? it.category}</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ height: 14 }} />
      </div>

      {/* sheet info đầy đủ + nút Sử dụng */}
      {sel && (
        <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(480px, 100%)', borderRadius: '22px 22px 0 0', padding: 22, borderBottom: 'none' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 15, background: 'var(--s3)', color: CAT_COLOR[sel.category] ?? 'var(--jade)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={sel.icon ?? 'gift'} size={26} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{sel.name}</div>
                <div style={{ fontSize: 11, color: CAT_COLOR[sel.category], fontWeight: 600, marginTop: 2 }}>{CAT_LABEL[sel.category] ?? sel.category} · còn ×{sel.qty}</div>
              </div>
              <button onClick={() => setSel(null)} style={{ background: 'var(--s3)', border: 'none', borderRadius: 10, width: 32, height: 32, color: 'var(--dim)', display: 'grid', placeItems: 'center' }}><Icon name="x" size={15} /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--mut)', marginTop: 14, lineHeight: 1.55 }}>{sel.description}</p>
            <div className="card" style={{ marginTop: 12, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'center', background: 'var(--jade-soft)', borderColor: 'rgba(52,211,184,.22)' }}>
              <Icon name="spark" size={15} style={{ color: 'var(--jade)' }} />
              <span style={{ fontSize: 12.5, color: 'var(--jade)', fontWeight: 600 }}>{effectText(sel.effect)}</span>
            </div>
            <button disabled={busy} onClick={() => use(sel)} className="btn-p" style={{ marginTop: 16, opacity: busy ? .6 : 1 }}>
              {busy ? 'Đang dùng…' : 'Sử dụng'}
            </button>
            <div style={{ height: 10 }} />
          </div>
        </div>
      )}
    </Shell>
  );
}
