'use client';
// Soul-Inventory (Quản lý Kho) — FE page. Nối API /api/v1/soul-inventory/* (backend R11.4).
// Nghiệp vụ ghi sổ (nhập/xuất/chuyển) theo dry-run→confirm: xem trước thông số → xác nhận → POST.
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

interface StockRow { sku: string; name: string; unit: string; location: string; stocked: string; reserved: string; incoming: string; available: string; min_stock: string }
interface LowRow { sku: string; name: string; unit: string; available: string; min_stock: string; suggest_reorder: string }
interface ExpiryRow { sku: string; name: string; lot_no: string | null; serial_no: string | null; expiry_date: string; days_left: number; stocked: string }
interface Summary { items: string; locations: string; active_lots: string; total_available: string; low_stock_items: string; est_value: string }

const num = (s: string | number | null | undefined) => Number(s ?? 0).toLocaleString('vi-VN');
const moveLabels: Record<string, { label: string; verb: string }> = {
  receive: { label: 'Nhập kho (PNK)', verb: 'nhập' },
  issue: { label: 'Xuất kho (PXK)', verb: 'xuất' },
  transfer: { label: 'Chuyển kho', verb: 'chuyển' },
};

export default function SoulInventoryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'ton' | 'vt' | 'nxc' | 'canh'>('ton');
  const [locked, setLocked] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [low, setLow] = useState<LowRow[] | null>(null);
  const [expiry, setExpiry] = useState<ExpiryRow[] | null>(null);
  const [kw, setKw] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [sheet, setSheet] = useState<'' | 'item' | 'move'>('');
  const [busy, setBusy] = useState('');

  const gate = (e: any) => { if (/kích hoạt|hết hạn thuê|INACTIVE|RENT_EXPIRED/i.test(String(e.message))) setLocked(true); };
  const P = '/api/v1/soul-inventory';

  const loadAll = useCallback((keyword?: string) => {
    api<Summary>(`${P}/summary`).then((d) => { setSummary(d); setLocked(false); }).catch(gate);
    api<StockRow[]>(`${P}/stock${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`).then(setStock).catch(gate);
    api<LowRow[]>(`${P}/stock/low-alerts`).then(setLow).catch(() => {});
    api<ExpiryRow[]>(`${P}/stock/expiry-alerts?days=30`).then(setExpiry).catch(() => {});
  }, []);
  useEffect(() => { if (!getSession()) { router.replace('/'); return; } loadAll(); }, [router, loadAll]);

  // ── Thêm vật tư ──
  const [iSku, setISku] = useState(''); const [iName, setIName] = useState(''); const [iUnit, setIUnit] = useState('cái');
  const [iMin, setIMin] = useState(''); const [iBarcode, setIBarcode] = useState('');
  async function addItem() {
    if (!iSku.trim() || !iName.trim()) { setMsg({ t: 'Nhập SKU và tên vật tư trước đã', ok: false }); return; }
    setBusy('item'); setMsg(null);
    try {
      await api(`${P}/items`, { method: 'POST', body: JSON.stringify({ sku: iSku.trim(), name: iName.trim(), unit: iUnit.trim() || 'cái', min_stock: iMin || '0', barcode: iBarcode.trim() || undefined }) });
      setISku(''); setIName(''); setIMin(''); setIBarcode(''); setSheet(''); setMsg({ t: 'Đã lưu vật tư', ok: true }); loadAll();
    } catch (e: any) { setMsg({ t: e.message ?? 'Không lưu được vật tư', ok: false }); } finally { setBusy(''); }
  }

  // ── Nhập / Xuất / Chuyển — dry-run→confirm (xem trước → xác nhận → ghi sổ) ──
  const [mvKind, setMvKind] = useState<'receive' | 'issue' | 'transfer'>('receive');
  const [mSku, setMSku] = useState(''); const [mQty, setMQty] = useState('');
  const [mLoc, setMLoc] = useState(''); const [mToLoc, setMToLoc] = useState('');
  const [mCost, setMCost] = useState(''); const [mLot, setMLot] = useState(''); const [mExp, setMExp] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  function buildMovePayload(): Record<string, unknown> | null {
    if (!mSku.trim() || !mQty.trim()) { setMsg({ t: 'Nhập SKU và số lượng trước đã', ok: false }); return null; }
    if (mvKind === 'transfer') {
      if (!mLoc.trim() || !mToLoc.trim()) { setMsg({ t: 'Chuyển kho cần đủ kho đi và kho đến', ok: false }); return null; }
      return { sku: mSku.trim(), from_location_code: mLoc.trim(), to_location_code: mToLoc.trim(), quantity: mQty.trim() };
    }
    return {
      sku: mSku.trim(), quantity: mQty.trim(),
      ...(mLoc.trim() ? { location_code: mLoc.trim() } : {}),
      ...(mvKind === 'receive' && mCost.trim() ? { unit_cost: mCost.trim() } : {}),
      ...(mLot.trim() ? { lot_no: mLot.trim() } : {}),
      ...(mvKind === 'receive' && mExp.trim() ? { expiry_date: mExp.trim() } : {}),
    };
  }
  function dryRunMove() { const p = buildMovePayload(); if (p) { setMsg(null); setPreview(p); } }
  async function confirmMove() {
    if (!preview) return;
    setBusy('move'); setMsg(null);
    const ep = mvKind === 'receive' ? 'stock/receive' : mvKind === 'issue' ? 'stock/issue' : 'stock/transfer';
    try {
      await api(`${P}/${ep}`, { method: 'POST', body: JSON.stringify(preview) });
      setPreview(null); setSheet(''); setMSku(''); setMQty(''); setMLoc(''); setMToLoc(''); setMCost(''); setMLot(''); setMExp('');
      setMsg({ t: `Đã ${moveLabels[mvKind].verb} kho xong — sổ đã ghi`, ok: true }); loadAll();
    } catch (e: any) { setMsg({ t: e.message ?? 'Không ghi sổ được', ok: false }); setPreview(null); } finally { setBusy(''); }
  }

  if (locked) return <Shell><ModuleLocked name="Soul-Inventory — Quản lý Kho" id="soul-inventory" /></Shell>;

  const tabs: Array<{ k: typeof tab; label: string; icon: string }> = [
    { k: 'ton', label: 'Tồn kho', icon: 'box' },
    { k: 'vt', label: 'Vật tư', icon: 'grid' },
    { k: 'nxc', label: 'Nhập·Xuất·Chuyển', icon: 'cart' },
    { k: 'canh', label: 'Cảnh báo', icon: 'alert' },
  ];

  return (
    <Shell>
      <div className="scroll">
        <div className="pg-h"><div className="k">Kho vận</div><h1>Soul-Inventory</h1></div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 20px 0', flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={tab === t.k ? 'btn-p' : 'chip'} style={{ width: 'auto', padding: '8px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name={t.icon} size={15} />{t.label}
            </button>
          ))}
        </div>

        {msg && <div style={{ margin: '12px 20px 0', padding: '9px 12px', borderRadius: 11, fontSize: 12.5, background: msg.ok ? 'var(--jade-soft)' : 'rgba(236,106,133,.14)', color: msg.ok ? 'var(--jade)' : 'var(--rose)' }}>{msg.t}</div>}

        {/* ── TỒN KHO ── */}
        {tab === 'ton' && (
          <div style={{ margin: '16px 20px 0' }}>
            {summary && (
              <div className="card" style={{ borderRadius: 16, padding: 16, display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
                <div><div className="mut" style={{ fontSize: 11.5 }}>Vật tư</div><div style={{ fontSize: 24, fontWeight: 700 }}>{num(summary.items)}</div></div>
                <div><div className="mut" style={{ fontSize: 11.5 }}>Tồn khả dụng</div><div style={{ fontSize: 24, fontWeight: 700 }}>{num(summary.total_available)}</div></div>
                <div><div className="mut" style={{ fontSize: 11.5 }}>Sắp hết</div><div style={{ fontSize: 24, fontWeight: 700, color: Number(summary.low_stock_items) > 0 ? 'var(--rose)' : undefined }}>{num(summary.low_stock_items)}</div></div>
                <div><div className="mut" style={{ fontSize: 11.5 }}>Giá trị tồn (ước)</div><div style={{ fontSize: 24, fontWeight: 700 }}>{num(summary.est_value)}đ</div></div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input className="inp" placeholder="Tìm theo tên hoặc SKU…" value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadAll(kw.trim()); }} />
              <button className="btn-p" style={{ width: 'auto', padding: '0 18px', fontSize: 13 }} onClick={() => loadAll(kw.trim())}><Icon name="search" size={15} /></button>
            </div>
            {!stock ? <div className="mut" style={{ fontSize: 13 }}>Đang tải…</div> : stock.length === 0 ? <EmptyState icon="box" title="Chưa có tồn kho" sub="Thêm vật tư rồi nhập kho lô đầu tiên để bắt đầu" /> : (
              <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
                {stock.map((r, i) => (
                  <div key={`${r.sku}-${r.location}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < stock.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div className="ava mint" style={{ width: 38, height: 38, borderRadius: 12 }}><Icon name="box" size={16} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                      <div className="mut" style={{ fontSize: 11.5 }}>{r.sku} · {r.location}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontSize: 13 }}>{num(r.available)} {r.unit}</div>
                      <div className="mut" style={{ fontSize: 10.5 }}>tồn {num(r.stocked)} · giữ {num(r.reserved)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── VẬT TƯ ── */}
        {tab === 'vt' && (
          <div style={{ margin: '16px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div className="mut" style={{ fontSize: 12.5, flex: 1 }}>{summary ? `${num(summary.items)} vật tư · ${num(summary.locations)} kho` : 'Đang tải…'}</div>
              <button className="btn-p" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={() => setSheet('item')}>+ Thêm vật tư</button>
            </div>
            {!stock ? <div className="mut" style={{ fontSize: 13 }}>Đang tải…</div> : stock.length === 0 ? <EmptyState icon="grid" title="Chưa có vật tư" sub="Bấm + Thêm vật tư để lập danh mục kho" /> : (
              <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
                {[...new Map(stock.map((r) => [r.sku, r])).values()].map((r, i, arr) => (
                  <div key={r.sku} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--amber-soft)', color: 'var(--amber)', display: 'grid', placeItems: 'center' }}><Icon name="grid" size={16} /></div>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div><div className="mut" style={{ fontSize: 11.5 }}>{r.sku} · đơn vị: {r.unit}</div></div>
                    <span className="mono" style={{ fontSize: 12.5 }}>min {num(r.min_stock)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── NHẬP · XUẤT · CHUYỂN ── */}
        {tab === 'nxc' && (
          <div style={{ margin: '16px 20px 0' }}>
            <div className="card" style={{ borderRadius: 16, padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Nghiệp vụ ghi sổ kho</div>
              <div className="mut" style={{ fontSize: 12 }}>Mọi nghiệp vụ đều xem trước thông số (dry-run) rồi mới xác nhận ghi sổ — đúng chuẩn chứng từ PNK/PXK.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['receive', 'issue', 'transfer'] as const).map((k) => (
                  <button key={k} className="btn-p" style={{ width: 'auto', padding: '9px 16px', fontSize: 13 }} onClick={() => { setMvKind(k); setPreview(null); setSheet('move'); }}>
                    <Icon name={k === 'receive' ? 'plus' : k === 'issue' ? 'send' : 'up'} size={15} /> {moveLabels[k].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CẢNH BÁO ── */}
        {tab === 'canh' && (
          <div style={{ margin: '16px 20px 0' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Tồn thấp</div>
            {!low ? <div className="mut" style={{ fontSize: 13 }}>Đang tải…</div> : low.length === 0 ? <EmptyState icon="check" title="Không có hàng sắp hết" sub="Mọi vật tư đều trên ngưỡng tồn tối thiểu" /> : (
              <div className="card" style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
                {low.map((r, i) => (
                  <div key={r.sku} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < low.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(236,106,133,.14)', color: 'var(--rose)', display: 'grid', placeItems: 'center' }}><Icon name="alert" size={16} /></div>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div><div className="mut" style={{ fontSize: 11.5 }}>{r.sku} · còn {num(r.available)} / min {num(r.min_stock)} {r.unit}</div></div>
                    <span className="mono" style={{ fontSize: 12.5, color: 'var(--jade)' }}>đặt thêm {num(r.suggest_reorder)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 8px' }}>Cận hạn (30 ngày)</div>
            {!expiry ? <div className="mut" style={{ fontSize: 13 }}>Đang tải…</div> : expiry.length === 0 ? <EmptyState icon="clock" title="Không có lô cận hạn" sub="Không lô nào hết hạn trong 30 ngày tới" /> : (
              <div className="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
                {expiry.map((r, i) => (
                  <div key={`${r.sku}-${r.lot_no}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < expiry.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--amber-soft)', color: 'var(--amber)', display: 'grid', placeItems: 'center' }}><Icon name="clock" size={16} /></div>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div><div className="mut" style={{ fontSize: 11.5 }}>{r.sku}{r.lot_no ? ` · lô ${r.lot_no}` : ''} · HSD {r.expiry_date}</div></div>
                    <span className="mono" style={{ fontSize: 12.5, color: r.days_left <= 7 ? 'var(--rose)' : 'var(--amber)' }}>còn {r.days_left} ngày · {num(r.stocked)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>

      {/* ── Sheet thêm vật tư (.sh-panel: không bị bottom-nav che) ── */}
      {sheet === 'item' && (
        <div className="sh-scrim" onClick={() => setSheet('')}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head">
              <div className="sh-ico" style={{ background: 'var(--jade-soft)', color: 'var(--jade)' }}><Icon name="grid" size={18} /></div>
              <b style={{ fontSize: 15 }}>Thêm vật tư</b>
              <button className="sh-x" onClick={() => setSheet('')}><Icon name="x" size={15} /></button>
            </div>
            <div style={{ display: 'grid', gap: 9 }}>
              <input className="inp" placeholder="SKU * (vd COCA-330)" value={iSku} onChange={(e) => setISku(e.target.value)} autoFocus />
              <input className="inp" placeholder="Tên vật tư *" value={iName} onChange={(e) => setIName(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="inp" placeholder="Đơn vị (cái/lon/kg…)" value={iUnit} onChange={(e) => setIUnit(e.target.value)} />
                <input className="inp" type="number" placeholder="Tồn tối thiểu" value={iMin} onChange={(e) => setIMin(e.target.value)} />
              </div>
              <input className="inp" placeholder="Barcode (tùy chọn)" value={iBarcode} onChange={(e) => setIBarcode(e.target.value)} />
              <button className="btn-p" disabled={busy === 'item'} onClick={addItem} style={{ opacity: iSku.trim() && iName.trim() ? 1 : .5 }}><Icon name="plus" size={15} /> {busy === 'item' ? 'Đang lưu…' : 'Lưu vật tư'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sheet Nhập/Xuất/Chuyển với dry-run→confirm ── */}
      {sheet === 'move' && (
        <div className="sh-scrim" onClick={() => { setSheet(''); setPreview(null); }}>
          <div className="sh-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head">
              <div className="sh-ico" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><Icon name="cart" size={18} /></div>
              <b style={{ fontSize: 15 }}>{moveLabels[mvKind].label}</b>
              <button className="sh-x" onClick={() => { setSheet(''); setPreview(null); }}><Icon name="x" size={15} /></button>
            </div>
            {!preview ? (
              <div style={{ display: 'grid', gap: 9 }}>
                <input className="inp" placeholder="SKU *" value={mSku} onChange={(e) => setMSku(e.target.value)} autoFocus />
                <input className="inp" type="number" placeholder="Số lượng *" value={mQty} onChange={(e) => setMQty(e.target.value)} />
                {mvKind === 'transfer' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="inp" placeholder="Kho đi *" value={mLoc} onChange={(e) => setMLoc(e.target.value)} />
                    <input className="inp" placeholder="Kho đến *" value={mToLoc} onChange={(e) => setMToLoc(e.target.value)} />
                  </div>
                ) : (
                  <input className="inp" placeholder="Mã kho (trống = kho mặc định)" value={mLoc} onChange={(e) => setMLoc(e.target.value)} />
                )}
                {mvKind === 'receive' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="inp" type="number" placeholder="Đơn giá vốn" value={mCost} onChange={(e) => setMCost(e.target.value)} />
                    <input className="inp" type="date" placeholder="HSD" value={mExp} onChange={(e) => setMExp(e.target.value)} />
                  </div>
                )}
                {mvKind !== 'transfer' && <input className="inp" placeholder="Số lô (tùy chọn, vd L2607)" value={mLot} onChange={(e) => setMLot(e.target.value)} />}
                <button className="btn-p" onClick={dryRunMove} style={{ opacity: mSku.trim() && mQty.trim() ? 1 : .5 }}><Icon name="search" size={15} /> Xem trước (dry-run)</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="mut" style={{ fontSize: 12.5 }}>Xem trước — chưa ghi sổ. Kiểm tra thông số rồi xác nhận:</div>
                <div className="card" style={{ borderRadius: 12, padding: 12, display: 'grid', gap: 5 }}>
                  {Object.entries(preview).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', fontSize: 13 }}><span className="mut" style={{ flex: 1 }}>{k}</span><span className="mono">{String(v)}</span></div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="chip" style={{ flex: 1, padding: '11px 0', fontSize: 13 }} onClick={() => setPreview(null)}>Sửa lại</button>
                  <button className="btn-p" style={{ flex: 1 }} disabled={busy === 'move'} onClick={confirmMove}><Icon name="check" size={15} /> {busy === 'move' ? 'Đang ghi…' : 'Xác nhận ghi sổ'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
