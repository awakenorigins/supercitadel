'use client';
// Soul-Sale 1A (Bán Hàng & Kênh Phân Phối) — FE FULL CRUD (R11.6m).
// Phơi đủ 34 write actions + 23 read tools ra UI: form tạo/sửa, quick-action trên từng dòng,
// action nhạy cảm (L2) đi dry-run→confirm: gọi không confirm → modal preview → xác nhận → gọi confirm:true.
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

/* ───────────────────────── types ───────────────────────── */
interface StageRow { stage: string; probability: number; count: number; total: string; weighted: string }
interface NextBest { priority: number; action: string; refType: string; refId: string; reason: string }
interface CustRow { id: string; code: string; name: string; kind: string; phone: string | null }
interface TreeNode { id: string; code: string; name: string; kind: string; children: TreeNode[] }
interface OrderRow { id: string; code: string; status: string; grandTotal: string; createdAt: string }
interface LeadRow { id: string; code?: string; name: string; source: string; status: string; phone?: string | null; score?: number }
interface Debtor { customerId: string; code: string; name: string; outstanding: string }
interface BatchRow { id: string; code: string; period: string; status: string; rowCount: number; exceptionCount: number }
interface CatalogItem { name: string; description: string; permission: string; securityLevel?: number; sensitive?: boolean; examples: string[] }
interface Item { productCode: string; productName: string; qty: number; unitPrice?: string }

const num = (s: string | number | null | undefined) => Number(s ?? 0).toLocaleString('vi-VN');
const STATUS_VI: Record<string, string> = {
  draft: 'Nháp', confirmed: 'Đã xác nhận', delivering: 'Đang giao', delivered: 'Đã giao',
  invoiced: 'Đã xuất HĐ', closed: 'Đóng', cancelled: 'Đã hủy', on_hold: 'Đang giữ',
  uploaded: 'Đã nạp', reconciling: 'Đang đối soát', ready: 'Sẵn sàng chốt', void: 'Đã hủy',
  new: 'Mới', working: 'Đang chăm', converted: 'Đã convert', disqualified: 'Đã loại',
};
const ACTION_VI: Record<string, string> = {
  chase_quote: 'Chốt báo giá', remind_debt: 'Nhắc nợ', merge_customer: 'Gộp khách trùng', win_back: 'Gọi lại khách',
  call: 'Gọi', send_quote: 'Gửi báo giá', upsell: 'Bán thêm', collect_deposit: 'Thu cọc',
};
const P = '/api/v1/soul-sale';

/* ─────────── preview → tiếng Việt dễ đọc (KHÔNG dump JSON cho user) ─────────── */
const PREVIEW_VI: Record<string, string> = {
  source: 'Khách nguồn (bị gộp)', target: 'Khách đích (giữ lại)', childrenBlocking: 'Node con đang chặn',
  willMove: 'Sẽ chuyển sang khách đích', contacts: 'Liên hệ', addresses: 'Địa chỉ', deals: 'Deal', quotes: 'Báo giá',
  orders: 'Đơn hàng', payments: 'Thanh toán', order: 'Đơn hàng', status: 'Trạng thái', grandTotal: 'Tổng tiền',
  grandTotalFmt: 'Tổng tiền', subtreeSize: 'Số node trong tuyến', note: 'Ghi chú', batch: 'Batch', period: 'Kỳ',
  split: 'Tách dòng tiền', rowCount: 'Số dòng', creditLimit: 'Hạn mức hiện tại', outstanding: 'Đang nợ',
  available: 'Còn được nợ', hold: 'Đang khoá nợ', creditHold: 'Đang khoá nợ', limit: 'Hạn mức', limitAmount: 'Hạn mức',
  currentResolution: 'Giá đang áp dụng', incoming: 'Giá sắp đặt', unitPrice: 'Đơn giá', unitPriceFmt: 'Đơn giá',
  discountPct: 'Chiết khấu %', scope: 'Phạm vi áp dụng', amount: 'Số tiền', amountFmt: 'Số tiền', kind: 'Loại',
  customer: 'Khách', code: 'Mã', name: 'Tên', totalRows: 'Tổng dòng', exceptions: 'Case ngoại lệ', plan: 'Plan',
  ratePct: 'Tỷ lệ %', total: 'Tổng', totalFmt: 'Tổng', lines: 'Số dòng', beneficiary: 'Người hưởng',
  opening: 'Nợ đầu kỳ', incurred: 'Phát sinh', collected: 'Đã thu', closing: 'Nợ cuối kỳ', customers: 'Số khách',
  paid: 'Đã thu', remaining: 'Còn lại', method: 'Hình thức', category: 'Nhóm', paidTotal: 'Đã thu',
  alreadyRefunded: 'Đã hoàn', refundable: 'Có thể hoàn', gate: 'Cổng công nợ', pass: 'Qua cổng', blocked: 'Bị chặn',
  reason: 'Lý do', warnings: 'Cảnh báo', productCode: 'Mã SP', qty: 'Số lượng', priceBook: 'Bảng giá',
};
const SKIP_KEYS = new Set(['id', 'orgId', 'customerId', 'sourceId', 'targetId', 'refId', 'batchId', 'rowId', 'orderId', 'dealId', 'leadId', 'quoteId', 'planId', 'segmentId', 'ownerUserId', 'territoryId', 'grandTotal', 'unitPrice', 'amount', 'total']);
const viKey = (k: string) => PREVIEW_VI[k] ?? k.replace(/([A-Z])/g, ' $1').toLowerCase();
const isMoneyKey = (k: string) => /amount|total|price|limit|outstanding|opening|closing|incurred|collected|available|paid|refund/i.test(k) && !/fmt|pct|count/i.test(k);
const fmtVal = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (typeof v === 'number') return isMoneyKey(k) ? `${v.toLocaleString('vi-VN')}đ` : v.toLocaleString('vi-VN');
  if (typeof v === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(v)) return '—'; // uuid → ẩn
    if (/^\d+$/.test(v) && isMoneyKey(k)) return `${Number(v).toLocaleString('vi-VN')}đ`;
    return STATUS_VI[v] ?? v;
  }
  return String(v);
};
/** Render preview object thành các dòng label–value tiếng Việt, đệ quy 2 cấp, ẩn id kỹ thuật. */
function PreviewRows({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    return <>{data.map((it, i) => (
      <div key={i} style={{ marginLeft: depth * 12, borderLeft: depth ? '2px solid rgba(52,211,184,.25)' : undefined, paddingLeft: depth ? 8 : 0, marginBottom: 6 }}>
        <PreviewRows data={it} depth={depth + 1} />
      </div>
    ))}</>;
  }
  if (typeof data !== 'object') return <div>{String(data)}</div>;
  const obj = data as Record<string, unknown>;
  // object dạng {code, name} → 1 dòng gọn
  if (obj.code && obj.name && Object.keys(obj).filter((k) => !SKIP_KEYS.has(k)).length <= 3) {
    return <div><b>{String(obj.code)}</b> · {String(obj.name)}</div>;
  }
  return (
    <>{Object.entries(obj).filter(([k]) => !SKIP_KEYS.has(k) || typeof obj[k] === 'object').map(([k, v]) => {
      if (v !== null && typeof v === 'object') {
        return (
          <div key={k} style={{ marginTop: 6 }}>
            <div className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>{viKey(k)}</div>
            <div style={{ marginLeft: 10, borderLeft: '2px solid rgba(52,211,184,.25)', paddingLeft: 8 }}>
              <PreviewRows data={v} depth={depth + 1} />
            </div>
          </div>
        );
      }
      const shown = fmtVal(k, v);
      if (shown === '—' && SKIP_KEYS.has(k)) return null;
      return (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', fontSize: 13.5 }}>
          <span className="muted">{viKey(k)}</span><b style={{ textAlign: 'right' }}>{shown}</b>
        </div>
      );
    })}</>
  );
}

/* ─────────────── form field spec (schema-driven) ─────────────── */
type FieldType = 'text' | 'int' | 'vnd' | 'select' | 'bool' | 'textarea' | 'customer';
interface Field { k: string; label: string; type?: FieldType; opts?: [string, string][]; req?: boolean; ph?: string }
interface ActDef { name: string; title: string; icon?: string; sensitive?: boolean; fields: Field[]; withItems?: boolean }

export default function SoulSalePage() {
  const router = useRouter();
  const [tab, setTab] = useState<'tq' | 'kenh' | 'crm' | 'ban' | 'no' | 'doisoat' | 'dstv'>('tq');
  const [locked, setLocked] = useState(false);
  const [pipeline, setPipeline] = useState<{ stages: StageRow[]; openCount: number; weightedTotal: string } | null>(null);
  const [nextBest, setNextBest] = useState<NextBest[] | null>(null);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [custs, setCusts] = useState<CustRow[] | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [debt, setDebt] = useState<{ topDebtors: Debtor[]; totalOutstanding: string } | null>(null);
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [catalog, setCatalog] = useState<{ tools: CatalogItem[]; actions: CatalogItem[] } | null>(null);
  const [kw, setKw] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // modal dry-run→confirm
  const [pending, setPending] = useState<{ name: string; title: string; params: Record<string, unknown>; preview: unknown } | null>(null);

  const gate = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    if (/kích hoạt|hết hạn thuê|INACTIVE|RENT_EXPIRED/i.test(m)) setLocked(true);
    else setMsg({ t: m, ok: false });
  };

  const loadAll = useCallback((keyword?: string) => {
    api(`${P}/pipeline/summary`).then((r) => setPipeline(r.data)).catch(gate);
    api(`${P}/intel/next-best?limit=8`).then((r) => setNextBest(r.data)).catch(gate);
    api(`${P}/agency-tree`).then((r) => setTree(r.data)).catch(gate);
    api(`${P}/customers?q=${encodeURIComponent(keyword ?? '')}&limit=50`).then((r) => setCusts(r.data)).catch(gate);
    api(`${P}/orders?limit=30`).then((r) => setOrders(r.data)).catch(gate);
    api(`${P}/leads?limit=30`).then((r) => setLeads(Array.isArray(r.data) ? r.data : (r.data?.leads ?? []))).catch(gate);
    api(`${P}/debt/summary?topN=10`).then((r) => setDebt(r.data)).catch(gate);
    api(`${P}/import/batches`).then((r) => setBatches(r.data.batches ?? [])).catch(gate);
    Promise.all([api(`${P}/tools`), api(`${P}/actions`)])
      .then(([t, a]) => setCatalog({ tools: t as CatalogItem[], actions: a as CatalogItem[] })).catch(gate);
  }, []);

  useEffect(() => {
    if (!getSession()) { router.push('/'); return; }
    loadAll();
  }, [router, loadAll]);

  /* ───────── core: gọi action, tự xử lý dry-run→confirm ───────── */
  const runAction = async (name: string, title: string, params: Record<string, unknown>, confirmed = false) => {
    setBusy(name);
    try {
      const body = confirmed ? { ...params, confirm: true } : params;
      const r = await api(`${P}/actions/${name}`, { method: 'POST', body: JSON.stringify(body) });
      const d = r.data;
      if (d && typeof d === 'object' && (d as any).dry_run === true) {
        setPending({ name, title, params, preview: (d as any).preview ?? (d as any).input ?? {} });
      } else {
        setPending(null);
        setMsg({ t: `✅ ${title} — xong`, ok: true });
        loadAll(kw);
      }
    } catch (e) { gate(e); } finally { setBusy(null); }
  };

  if (locked) return <Shell><ModuleLocked id="soul-sale" name="Soul-Sale 1A" /></Shell>;

  /* ───────── generic form component ───────── */
  const custOpts: [string, string][] = (custs ?? []).map((c) => [c.id, `${c.code} · ${c.name} (${c.kind})`]);
  const ActForm = ({ def }: { def: ActDef }) => {
    const [v, setV] = useState<Record<string, string>>({});
    const [items, setItems] = useState<Item[]>([{ productCode: '', productName: '', qty: 1 }]);
    const [open, setOpen] = useState(false);
    const set = (k: string, val: string) => setV((o) => ({ ...o, [k]: val }));
    const submit = () => {
      const params: Record<string, unknown> = {};
      for (const f of def.fields) {
        const raw = v[f.k] ?? '';
        if (raw === '') { if (f.req) { setMsg({ t: `Thiếu: ${f.label}`, ok: false }); return; } continue; }
        if (f.type === 'int') params[f.k] = Number(raw);
        else if (f.type === 'bool') params[f.k] = raw === 'true';
        else params[f.k] = raw;
      }
      if (def.withItems) {
        const rows = items.filter((i) => i.productCode && i.qty > 0)
          .map((i) => ({ productCode: i.productCode, productName: i.productName || i.productCode, qty: i.qty, ...(i.unitPrice ? { unitPrice: i.unitPrice } : {}) }));
        if (rows.length) params.items = rows;
      }
      runAction(def.name, def.title, params);
    };
    return (
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
          <b>{def.sensitive ? '🔐 ' : ''}{def.title}</b>
          <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{open ? '−' : '+'}</button>
        </div>
        {open && (
          <div>
            {def.fields.map((f) => (
              <div className="row" key={f.k}>
                <label style={{ minWidth: 130, fontSize: 13 }} className="muted">{f.label}{f.req ? ' *' : ''}</label>
                {f.type === 'select' || f.type === 'bool' || f.type === 'customer' ? (
                  <select value={v[f.k] ?? ''} onChange={(e) => set(f.k, e.target.value)} style={{ flex: 1 }}>
                    <option value="">— chọn —</option>
                    {(f.type === 'bool' ? [['true', 'Có'], ['false', 'Không']] as [string, string][]
                      : f.type === 'customer' ? custOpts : (f.opts ?? []))
                      .map(([val, lb]) => <option key={val} value={val}>{lb}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea value={v[f.k] ?? ''} onChange={(e) => set(f.k, e.target.value)} placeholder={f.ph} rows={2} style={{ flex: 1 }} />
                ) : (
                  <input value={v[f.k] ?? ''} onChange={(e) => set(f.k, e.target.value)}
                    placeholder={f.ph ?? (f.type === 'vnd' ? 'VND, vd 5000000' : f.type === 'int' ? 'số' : '')} style={{ flex: 1 }} />
                )}
              </div>
            ))}
            {def.withItems && (
              <div style={{ marginTop: 6 }}>
                <div className="muted" style={{ fontSize: 13 }}>Danh sách hàng:</div>
                {items.map((it, i) => (
                  <div className="row" key={i}>
                    <input value={it.productCode} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, productCode: e.target.value } : x))} placeholder="Mã SP *" style={{ width: 90 }} />
                    <input value={it.productName} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, productName: e.target.value } : x))} placeholder="Tên SP" style={{ flex: 1 }} />
                    <input value={it.qty} type="number" min={1} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} style={{ width: 60 }} />
                    <input value={it.unitPrice ?? ''} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))} placeholder="Đơn giá (trống = máy giá)" style={{ width: 150 }} />
                    <button onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button onClick={() => setItems([...items, { productCode: '', productName: '', qty: 1 }])}>+ Thêm dòng</button>
              </div>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn-primary" disabled={busy === def.name} onClick={submit}>
                {busy === def.name ? 'Đang chạy…' : def.sensitive ? 'Xem trước & xác nhận' : 'Thực hiện'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ───────── quick row action (prompt cho field bắt buộc) ───────── */
  const quick = (name: string, title: string, params: Record<string, unknown>, ask?: { k: string; q: string }) => {
    let p = { ...params };
    if (ask) {
      const a = window.prompt(ask.q);
      if (a === null) return;
      if (a.trim() === '') { setMsg({ t: `Cần nhập: ${ask.q}`, ok: false }); return; }
      p = { ...p, [ask.k]: a.trim() };
    }
    runAction(name, title, p);
  };

  const Tree = ({ n, d }: { n: TreeNode; d: number }) => (
    <div>
      <div style={{ paddingLeft: d * 18 }} className="row">
        <Icon name={n.kind === 'retailer' ? 'bag' : 'target'} />
        <b>{n.name}</b> <span className="muted">{n.code} · {n.kind === 'retailer' ? 'điểm bán' : n.kind === 'distributor' ? 'NPP' : 'đại lý'}</span>
        <button title="Copy ID" onClick={() => { navigator.clipboard?.writeText(n.id); setMsg({ t: `Đã copy ID của ${n.code}`, ok: true }); }}>⧉</button>
      </div>
      {n.children.map((ch) => <Tree key={ch.id} n={ch} d={d + 1} />)}
    </div>
  );

  const TABS: [typeof tab, string][] = [
    ['tq', 'Tổng quan'], ['kenh', 'Khách & Kênh'], ['crm', 'CRM'], ['ban', 'Bán hàng'],
    ['no', 'Giá & Công nợ'], ['doisoat', 'Đối soát'], ['dstv', 'Tất cả tác vụ'],
  ];

  return (
    <Shell>
      <div className="page-head">
        <h1><Icon name="target" /> Soul-Sale 1A</h1>
        <div className="muted">Bán hàng & kênh phân phối — 23 tra cứu + 34 thao tác, bấm trực tiếp hoặc nhờ Tiểu Tâm · 🔐 = thao tác nhạy cảm, xem trước rồi xác nhận mới chạy</div>
      </div>
      {msg && <div className={msg.ok ? 'toast ok' : 'toast err'} onClick={() => setMsg(null)}>{msg.t}</div>}

      {/* modal dry-run→confirm */}
      {pending && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setPending(null)}>
          <div className="card" style={{ maxWidth: 560, width: '100%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3>🔐 Xác nhận: {pending.title}</h3>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Kiểm tra lại thông tin dưới đây rồi bấm xác nhận để chạy thật.</div>
            <div style={{ background: 'rgba(127,127,127,.08)', padding: '10px 12px', borderRadius: 10 }}>
              <PreviewRows data={pending.preview} />
            </div>
            <div className="row">
              <button className="btn-primary" disabled={busy !== null}
                onClick={() => runAction(pending.name, pending.title, pending.params, true)}>
                {busy ? 'Đang chạy…' : '✅ Xác nhận chạy thật'}
              </button>
              <button onClick={() => setPending(null)}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {TABS.map(([k, lb]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{lb}</button>
        ))}
      </div>

      {/* ═══════════ TỔNG QUAN ═══════════ */}
      {tab === 'tq' && (
        <div className="grid2">
          <section className="card">
            <h3>Pipeline (mở: {pipeline?.openCount ?? 0} · trọng số: {num(pipeline?.weightedTotal)}đ)</h3>
            {!pipeline?.stages?.length
              ? <EmptyState icon="box" title="Chưa có deal nào" sub="Tạo deal ở tab CRM hoặc nhờ Tiểu Tâm" />
              : (
                <table className="tbl"><thead><tr><th>Stage</th><th>%</th><th>Số deal</th><th>Tổng</th><th>Trọng số</th></tr></thead>
                  <tbody>{pipeline.stages.map((s) => (
                    <tr key={s.stage}><td>{s.stage}</td><td>{s.probability}%</td><td>{s.count}</td><td>{num(s.total)}đ</td><td>{num(s.weighted)}đ</td></tr>
                  ))}</tbody></table>
              )}
          </section>
          <section className="card">
            <h3><Icon name="spark" /> Việc nên làm ngay</h3>
            <div className="row"><button onClick={() => api(`${P}/automation/run`, { method: 'POST', body: '{}' }).then(() => { setMsg({ t: '✅ Đã chạy 6 job tự động', ok: true }); loadAll(kw); }).catch(gate)}>▶ Chạy tự động ngay</button></div>
            {!nextBest?.length
              ? <EmptyState icon="box" title="Chưa có đề xuất" sub="Bấm Chạy tự động hoặc phát sinh dữ liệu là mục này tự đầy" />
              : nextBest.map((a, i) => (
                <div key={i} className="row"><span className="pill">{ACTION_VI[a.action] ?? a.action}</span><span>{a.reason}</span></div>
              ))}
          </section>
        </div>
      )}

      {/* ═══════════ KHÁCH & KÊNH ═══════════ */}
      {tab === 'kenh' && (
        <div className="grid2">
          <div>
            <section className="card">
              <h3>Cây kênh phân phối</h3>
              {!tree?.length
                ? <EmptyState icon="users" title="Chưa dựng cây kênh" sub="Dùng form Tạo đại lý / Tạo điểm bán bên cạnh" />
                : tree.map((n) => <Tree key={n.id} n={n} d={0} />)}
            </section>
            <section className="card">
              <h3>Khách hàng</h3>
              <div className="row">
                <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Tìm tên (bỏ dấu được) / mã / SĐT" />
                <button onClick={() => loadAll(kw)}><Icon name="search" /> Tìm</button>
              </div>
              {!custs?.length
                ? <EmptyState icon="user" title="Chưa có khách" sub="Dùng form Tạo khách hàng bên cạnh" />
                : (
                  <table className="tbl"><thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>SĐT</th><th></th></tr></thead>
                    <tbody>{custs.map((c) => (
                      <tr key={c.id}><td>{c.code}</td><td>{c.name}</td><td>{c.kind}</td><td>{c.phone ?? '—'}</td>
                        <td><button title="Copy ID" onClick={() => { navigator.clipboard?.writeText(c.id); setMsg({ t: `Đã copy ID ${c.code}`, ok: true }); }}>⧉</button></td></tr>
                    ))}</tbody></table>
                )}
            </section>
          </div>
          <div>
            <ActForm def={{ name: 'soulsale.customer.create', title: 'Tạo khách hàng', fields: [
              { k: 'kind', label: 'Loại', type: 'select', req: true, opts: [['person', 'Cá nhân'], ['company', 'Công ty'], ['agency', 'Đại lý'], ['retailer', 'Điểm bán'], ['distributor', 'NPP']] },
              { k: 'name', label: 'Tên', req: true }, { k: 'phone', label: 'SĐT' }, { k: 'email', label: 'Email' },
              { k: 'taxCode', label: 'Mã số thuế' }, { k: 'segmentCode', label: 'Segment' }, { k: 'note', label: 'Ghi chú', type: 'textarea' },
            ] }} />
            <ActForm def={{ name: 'soulsale.customer.update', title: 'Cập nhật khách', fields: [
              { k: 'customerId', label: 'Khách', type: 'customer', req: true },
              { k: 'name', label: 'Tên mới' }, { k: 'phone', label: 'SĐT mới' }, { k: 'email', label: 'Email mới' },
              { k: 'taxCode', label: 'MST mới' }, { k: 'segmentCode', label: 'Segment mới' }, { k: 'note', label: 'Ghi chú', type: 'textarea' },
            ] }} />
            <ActForm def={{ name: 'soulsale.customer.merge', title: 'Gộp khách trùng', sensitive: true, fields: [
              { k: 'sourceId', label: 'Khách nguồn (bị gộp)', type: 'customer', req: true },
              { k: 'targetId', label: 'Khách đích (giữ lại)', type: 'customer', req: true },
            ] }} />
            <ActForm def={{ name: 'soulsale.agency.create', title: 'Tạo đại lý / NPP', fields: [
              { k: 'name', label: 'Tên', req: true }, { k: 'level', label: 'Cấp (1-5)', type: 'int' },
              { k: 'parentAgencyCustomerId', label: 'Tuyến trên', type: 'customer' },
              { k: 'territoryCode', label: 'Mã khu vực' }, { k: 'phone', label: 'SĐT' }, { k: 'email', label: 'Email' },
              { k: 'taxCode', label: 'MST' }, { k: 'discountTier', label: 'Bậc chiết khấu' }, { k: 'segmentCode', label: 'Segment' },
            ] }} />
            <ActForm def={{ name: 'soulsale.retailer.create', title: 'Tạo shop / điểm bán', fields: [
              { k: 'name', label: 'Tên', req: true }, { k: 'parentAgencyCustomerId', label: 'Đại lý tuyến trên', type: 'customer' },
              { k: 'shopType', label: 'Loại shop', ph: 'tạp hoá / cửa hàng...' }, { k: 'territoryCode', label: 'Mã khu vực' },
              { k: 'phone', label: 'SĐT' }, { k: 'email', label: 'Email' }, { k: 'segmentCode', label: 'Segment' },
            ] }} />
            <ActForm def={{ name: 'soulsale.agency.move', title: 'Chuyển tuyến node kênh', sensitive: true, fields: [
              { k: 'customerId', label: 'Node cần chuyển', type: 'customer', req: true },
              { k: 'newParentId', label: 'Cha mới', type: 'customer' },
            ] }} />
            <ActForm def={{ name: 'soulsale.territory.assign', title: 'Gán khu vực', fields: [
              { k: 'customerId', label: 'Đại lý / shop', type: 'customer', req: true },
              { k: 'territoryCode', label: 'Mã khu vực', req: true, ph: 'vd MEKONG' }, { k: 'territoryName', label: 'Tên khu vực' },
            ] }} />
          </div>
        </div>
      )}

      {/* ═══════════ CRM ═══════════ */}
      {tab === 'crm' && (
        <div className="grid2">
          <div>
            <section className="card">
              <h3>Leads</h3>
              {!leads?.length
                ? <EmptyState icon="user" title="Chưa có lead" sub="Dùng form Ghi lead mới bên cạnh" />
                : (
                  <table className="tbl"><thead><tr><th>Tên</th><th>Nguồn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                    <tbody>{leads.map((l) => (
                      <tr key={l.id}>
                        <td>{l.name}</td><td>{l.source}</td><td><span className="pill">{STATUS_VI[l.status] ?? l.status}</span></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button onClick={() => quick('soulsale.lead.convert', `Convert lead ${l.name}`, { leadId: l.id })}>Convert</button>{' '}
                          <button onClick={() => quick('soulsale.lead.assign', `Gán lead ${l.name}`, { leadId: l.id }, { k: 'ownerUserId', q: 'ID nhân viên phụ trách?' })}>Gán</button>{' '}
                          <button onClick={() => quick('soulsale.lead.disqualify', `Loại lead ${l.name}`, { leadId: l.id }, { k: 'reason', q: 'Lý do loại lead?' })}>Loại</button>{' '}
                          <button title="Copy ID" onClick={() => { navigator.clipboard?.writeText(l.id); setMsg({ t: 'Đã copy lead ID', ok: true }); }}>⧉</button>
                        </td>
                      </tr>
                    ))}</tbody></table>
                )}
            </section>
          </div>
          <div>
            <ActForm def={{ name: 'soulsale.lead.create', title: 'Ghi lead mới', fields: [
              { k: 'source', label: 'Nguồn', type: 'select', req: true, opts: [['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['zalo', 'Zalo'], ['showroom', 'Showroom'], ['referral', 'Giới thiệu'], ['campaign', 'Chiến dịch'], ['import', 'Import'], ['other', 'Khác']] },
              { k: 'name', label: 'Tên', req: true }, { k: 'phone', label: 'SĐT' }, { k: 'email', label: 'Email' }, { k: 'note', label: 'Ghi chú', type: 'textarea' },
            ] }} />
            <ActForm def={{ name: 'soulsale.deal.create', title: 'Tạo deal (cơ hội bán)', fields: [
              { k: 'title', label: 'Tiêu đề', req: true }, { k: 'customerId', label: 'Khách', type: 'customer' },
              { k: 'amount', label: 'Giá trị', type: 'vnd' }, { k: 'stageName', label: 'Stage', ph: 'vd Tiếp cận' },
              { k: 'expectedClose', label: 'Dự kiến chốt', ph: 'YYYY-MM-DD' },
            ] }} />
            <ActForm def={{ name: 'soulsale.deal.move-stage', title: 'Chuyển stage deal', fields: [
              { k: 'dealId', label: 'Deal ID', req: true, ph: 'uuid (copy từ Tiểu Tâm/pipeline)' },
              { k: 'stageName', label: 'Stage mới', req: true, ph: 'vd Báo giá / Thắng / Thua' },
              { k: 'lostReason', label: 'Lý do thua (nếu Thua)' }, { k: 'amount', label: 'Giá trị mới', type: 'vnd' },
            ] }} />
            <ActForm def={{ name: 'soulsale.activity.log', title: 'Ghi hoạt động (call/meet/note...)', fields: [
              { k: 'kind', label: 'Loại', type: 'select', req: true, opts: [['call', 'Gọi'], ['meet', 'Gặp'], ['note', 'Note'], ['task', 'Task'], ['email', 'Email'], ['zalo', 'Zalo']] },
              { k: 'subject', label: 'Tiêu đề', req: true },
              { k: 'refType', label: 'Gắn vào', type: 'select', req: true, opts: [['lead', 'Lead'], ['deal', 'Deal'], ['customer', 'Khách'], ['order', 'Đơn']] },
              { k: 'refId', label: 'ID đối tượng', req: true, ph: 'uuid' },
              { k: 'content', label: 'Nội dung', type: 'textarea' }, { k: 'dueAt', label: 'Hạn', ph: 'YYYY-MM-DD' },
            ] }} />
          </div>
        </div>
      )}

      {/* ═══════════ BÁN HÀNG ═══════════ */}
      {tab === 'ban' && (
        <div className="grid2">
          <div>
            <section className="card">
              <h3>Đơn hàng gần đây</h3>
              {!orders?.length
                ? <EmptyState icon="cart" title="Chưa có đơn" sub="Dùng form Tạo đơn bên cạnh" />
                : (
                  <table className="tbl"><thead><tr><th>Mã đơn</th><th>Trạng thái</th><th>Tổng tiền</th><th>Thao tác</th></tr></thead>
                    <tbody>{orders.map((o) => (
                      <tr key={o.id}>
                        <td>{o.code}</td><td><span className="pill">{STATUS_VI[o.status] ?? o.status}</span></td><td>{num(o.grandTotal)}đ</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {(o.status === 'draft' || o.status === 'on_hold') && <button onClick={() => quick('soulsale.order.confirm', `Xác nhận đơn ${o.code}`, { orderId: o.id })}>Xác nhận</button>}{' '}
                          {o.status !== 'cancelled' && o.status !== 'closed' && <button onClick={() => quick('soulsale.order.cancel', `Hủy đơn ${o.code}`, { orderId: o.id }, { k: 'reason', q: 'Lý do hủy đơn?' })}>Hủy</button>}{' '}
                          <button onClick={() => quick('soulsale.order.hold-toggle', `${o.status === 'on_hold' ? 'Thả' : 'Giữ'} đơn ${o.code}`, { orderId: o.id, hold: o.status !== 'on_hold' }, o.status !== 'on_hold' ? { k: 'reason', q: 'Lý do giữ đơn?' } : undefined)}>{o.status === 'on_hold' ? 'Thả' : 'Giữ'}</button>{' '}
                          <button onClick={() => quick('soulsale.payment.record', `Thu tiền đơn ${o.code}`, { orderId: o.id, kind: 'payment' }, { k: 'amount', q: 'Số tiền thu (VND, chỉ số)?' })}>Thu tiền</button>{' '}
                          <button title="Copy ID" onClick={() => { navigator.clipboard?.writeText(o.id); setMsg({ t: `Đã copy ID ${o.code}`, ok: true }); }}>⧉</button>
                        </td>
                      </tr>
                    ))}</tbody></table>
                )}
            </section>
          </div>
          <div>
            <ActForm def={{ name: 'soulsale.quote.create', title: 'Tạo báo giá', withItems: true, fields: [
              { k: 'customerId', label: 'Khách', type: 'customer', req: true },
              { k: 'dealId', label: 'Deal ID (nếu có)', ph: 'uuid' }, { k: 'validUntil', label: 'Hiệu lực tới', ph: 'YYYY-MM-DD' },
              { k: 'note', label: 'Ghi chú', type: 'textarea' },
            ] }} />
            <ActForm def={{ name: 'soulsale.quote.close', title: 'Chốt báo giá', fields: [
              { k: 'quoteId', label: 'Báo giá ID', req: true, ph: 'uuid' },
              { k: 'outcome', label: 'Kết quả', type: 'select', req: true, opts: [['accepted', 'Khách đồng ý'], ['rejected', 'Khách từ chối']] },
              { k: 'reason', label: 'Lý do (nếu từ chối)' },
            ] }} />
            <ActForm def={{ name: 'soulsale.order.create', title: 'Tạo đơn hàng (nháp)', withItems: true, fields: [
              { k: 'customerId', label: 'Khách', type: 'customer' },
              { k: 'fromQuoteId', label: 'Từ báo giá ID', ph: 'uuid (bỏ trống nếu nhập hàng tay)' },
              { k: 'paymentTermCode', label: 'Điều khoản', ph: 'COD/DEP30/NET7/NET15/NET30' },
              { k: 'channel', label: 'Kênh', type: 'select', opts: [['b2b', 'B2B'], ['b2c', 'B2C'], ['agency', 'Đại lý'], ['retailer', 'Điểm bán']] },
            ] }} />
            <ActForm def={{ name: 'soulsale.payment.record', title: 'Ghi nhận tiền về', sensitive: true, fields: [
              { k: 'kind', label: 'Loại', type: 'select', req: true, opts: [['deposit', 'Cọc'], ['payment', 'Thanh toán'], ['refund', 'Hoàn tiền']] },
              { k: 'amount', label: 'Số tiền', type: 'vnd', req: true },
              { k: 'orderId', label: 'Đơn ID', ph: 'uuid (hoặc chọn khách)' }, { k: 'customerId', label: 'Khách', type: 'customer' },
              { k: 'method', label: 'Hình thức', type: 'select', opts: [['cash', 'Tiền mặt'], ['bank', 'Chuyển khoản'], ['card', 'Thẻ'], ['ewallet', 'Ví điện tử']] },
              { k: 'externalRef', label: 'Mã tham chiếu' }, { k: 'note', label: 'Ghi chú' },
            ] }} />
            <ActForm def={{ name: 'soulsale.payment.term-set', title: 'Gán điều khoản thanh toán', fields: [
              { k: 'customerId', label: 'Khách', type: 'customer', req: true },
              { k: 'termCode', label: 'Điều khoản', req: true, ph: 'COD/DEP30/NET7/NET15/NET30' },
            ] }} />
          </div>
        </div>
      )}

      {/* ═══════════ GIÁ & CÔNG NỢ ═══════════ */}
      {tab === 'no' && (
        <div className="grid2">
          <div>
            <section className="card">
              <h3>Top công nợ (tổng: {num(debt?.totalOutstanding)}đ)</h3>
              {!debt?.topDebtors?.length
                ? <EmptyState icon="coin" title="Không ai đang nợ" sub="Đơn xác nhận chưa thu đủ tiền sẽ hiện ở đây" />
                : (
                  <table className="tbl"><thead><tr><th>Mã</th><th>Khách</th><th>Đang nợ</th><th>Thao tác</th></tr></thead>
                    <tbody>{debt.topDebtors.map((d) => (
                      <tr key={d.customerId}>
                        <td>{d.code}</td><td>{d.name}</td><td><b>{num(d.outstanding)}đ</b></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button onClick={() => quick('soulsale.payment.record', `Thu nợ ${d.name}`, { customerId: d.customerId, kind: 'payment' }, { k: 'amount', q: 'Số tiền thu (VND)?' })}>Thu</button>{' '}
                          <button onClick={() => quick('soulsale.credit.hold-toggle', `Khoá nợ ${d.name}`, { customerId: d.customerId, hold: true }, { k: 'reason', q: 'Lý do khoá công nợ?' })}>Khoá nợ</button>
                        </td>
                      </tr>
                    ))}</tbody></table>
                )}
            </section>
          </div>
          <div>
            <ActForm def={{ name: 'soulsale.price.rule-set', title: 'Đặt rule giá (máy giá tầng)', sensitive: true, fields: [
              { k: 'productCode', label: 'Mã SP', req: true }, { k: 'unitPrice', label: 'Đơn giá', type: 'vnd', req: true },
              { k: 'discountPct', label: 'Chiết khấu %', ph: 'vd 2.5' }, { k: 'customerId', label: 'Đích danh khách', type: 'customer' },
              { k: 'segmentCode', label: 'Segment' }, { k: 'agencyLevel', label: 'Cấp đại lý (1-5)', type: 'int' },
              { k: 'minQty', label: 'SL tối thiểu', type: 'int' }, { k: 'validFrom', label: 'Từ ngày', ph: 'YYYY-MM-DD' }, { k: 'validTo', label: 'Đến ngày', ph: 'YYYY-MM-DD' },
            ] }} />
            <ActForm def={{ name: 'soulsale.credit.limit-set', title: 'Đặt hạn mức công nợ', sensitive: true, fields: [
              { k: 'customerId', label: 'Khách', type: 'customer', req: true },
              { k: 'limitAmount', label: 'Hạn mức', type: 'vnd', req: true }, { k: 'paymentTermCode', label: 'Điều khoản', ph: 'NET30...' },
            ] }} />
            <ActForm def={{ name: 'soulsale.credit.hold-toggle', title: 'Khoá / mở khoá công nợ', sensitive: true, fields: [
              { k: 'customerId', label: 'Khách', type: 'customer', req: true },
              { k: 'hold', label: 'Khoá?', type: 'bool', req: true }, { k: 'reason', label: 'Lý do (bắt buộc khi khoá)' },
            ] }} />
            <ActForm def={{ name: 'soulsale.target.set', title: 'Giao chỉ tiêu doanh số', fields: [
              { k: 'scope', label: 'Phạm vi', type: 'select', req: true, opts: [['user', 'Nhân viên'], ['agency', 'Đại lý'], ['territory', 'Khu vực'], ['org', 'Toàn công ty']] },
              { k: 'scopeId', label: 'ID phạm vi', ph: 'user id / customer id / territory code' },
              { k: 'period', label: 'Kỳ', req: true, ph: 'YYYY-MM' }, { k: 'targetAmount', label: 'Chỉ tiêu', type: 'vnd', req: true },
            ] }} />
            <ActForm def={{ name: 'soulsale.commission.plan-set', title: 'Plan hoa hồng', sensitive: true, fields: [
              { k: 'code', label: 'Mã plan', req: true }, { k: 'name', label: 'Tên plan', req: true },
              { k: 'ratePct', label: 'Tỷ lệ %', req: true, ph: 'vd 2 hoặc 2.50' },
              { k: 'beneficiary', label: 'Người hưởng', type: 'select', req: true, opts: [['owner', 'NV phụ trách đơn'], ['agency', 'Đại lý gốc tuyến']] },
            ] }} />
            <ActForm def={{ name: 'soulsale.commission.post', title: 'Chốt hoa hồng kỳ', sensitive: true, fields: [
              { k: 'period', label: 'Kỳ', req: true, ph: 'YYYY-MM' }, { k: 'planCode', label: 'Mã plan (trống = tất cả)' },
            ] }} />
            <ActForm def={{ name: 'soulsale.debt.snapshot-close', title: 'Chốt kỳ công nợ', sensitive: true, fields: [
              { k: 'period', label: 'Kỳ', req: true, ph: 'YYYY-MM' }, { k: 'customerId', label: 'Riêng 1 khách (trống = tất cả)', type: 'customer' },
            ] }} />
          </div>
        </div>
      )}

      {/* ═══════════ ĐỐI SOÁT ═══════════ */}
      {tab === 'doisoat' && (
        <div className="grid2">
          <div>
            <section className="card">
              <h3>Batch bảng kê đại lý (Splitter)</h3>
              {!batches?.length
                ? <EmptyState icon="book" title="Chưa nạp bảng kê nào" sub="Dùng form Nạp bảng kê bên cạnh, hoặc gửi Excel cho Tiểu Tâm" />
                : (
                  <table className="tbl"><thead><tr><th>Mã batch</th><th>Kỳ</th><th>Trạng thái</th><th>Dòng</th><th>Case</th><th>Thao tác</th></tr></thead>
                    <tbody>{batches.map((b) => (
                      <tr key={b.id}>
                        <td>{b.code}</td><td>{b.period}</td><td><span className="pill">{STATUS_VI[b.status] ?? b.status}</span></td><td>{b.rowCount}</td><td>{b.exceptionCount}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button onClick={() => quick('soulsale.import.batch-reconcile', `Đối soát ${b.code}`, { batchId: b.id })}>Đối soát</button>{' '}
                          <button onClick={() => quick('soulsale.import.split-confirm', `Chốt batch ${b.code}`, { batchId: b.id })}>Chốt</button>{' '}
                          <button onClick={() => quick('soulsale.import.batch-void', `Hủy batch ${b.code}`, { batchId: b.id }, { k: 'reason', q: 'Lý do hủy batch?' })}>Hủy</button>{' '}
                          <button title="Copy ID" onClick={() => { navigator.clipboard?.writeText(b.id); setMsg({ t: `Đã copy ID ${b.code}`, ok: true }); }}>⧉</button>
                        </td>
                      </tr>
                    ))}</tbody></table>
                )}
            </section>
          </div>
          <div>
            <ActForm def={{ name: 'soulsale.import.statement-upload', title: 'Nạp bảng kê (rows JSON)', fields: [
              { k: 'sourceCustomerId', label: 'Đại lý nguồn', type: 'customer', req: true },
              { k: 'period', label: 'Kỳ', req: true, ph: 'YYYY-MM' }, { k: 'fileName', label: 'Tên file' },
            ] }} />
            <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>💡 Nạp file Excel thật: gửi file cho Tiểu Tâm kèm câu &quot;nạp bảng kê tháng X của đại lý Y&quot; — em parse và nạp giúp.</div>
            <ActForm def={{ name: 'soulsale.import.row-resolve', title: 'Xử lý dòng ngoại lệ', fields: [
              { k: 'rowId', label: 'Row ID', req: true, ph: 'uuid (từ danh sách case)' },
              { k: 'action', label: 'Cách xử lý', type: 'select', req: true, opts: [['match', 'Gán khách'], ['accept', 'Nhận ứng viên mờ'], ['void', 'Bỏ dòng']] },
              { k: 'customerId', label: 'Khách (nếu match)', type: 'customer' }, { k: 'note', label: 'Ghi chú' },
            ] }} />
          </div>
        </div>
      )}

      {/* ═══════════ TẤT CẢ TÁC VỤ ═══════════ */}
      {tab === 'dstv' && (
        <div>
          <section className="card">
            <h3>34 thao tác ghi (write actions){' '}<span className="muted" style={{ fontSize: 13 }}>🔐 = nhạy cảm, cần xác nhận 2 bước</span></h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl"><thead><tr><th>Tác vụ</th><th>Mô tả</th><th>Ví dụ nói với Tiểu Tâm</th></tr></thead>
                <tbody>{(catalog?.actions ?? []).map((a) => (
                  <tr key={a.name}><td style={{ whiteSpace: 'nowrap' }}>{a.sensitive ? '🔐 ' : ''}{a.name.replace('soulsale.', '')}</td><td>{a.description}</td><td className="muted">{a.examples[0] ?? ''}</td></tr>
                ))}</tbody></table>
            </div>
          </section>
          <section className="card">
            <h3>23 tra cứu (read tools)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl"><thead><tr><th>Tác vụ</th><th>Mô tả</th><th>Ví dụ</th></tr></thead>
                <tbody>{(catalog?.tools ?? []).map((t) => (
                  <tr key={t.name}><td style={{ whiteSpace: 'nowrap' }}>{t.name.replace('soulsale.', '')}</td><td>{t.description}</td><td className="muted">{t.examples[0] ?? ''}</td></tr>
                ))}</tbody></table>
            </div>
          </section>
        </div>
      )}

      {/* Spacer: chừa chỗ cho bottom-nav mobile (fixed 78px) + safe-area, tránh che nội dung cuối */}
      <div aria-hidden style={{ height: 'calc(96px + env(safe-area-inset-bottom, 0px))' }} />
    </Shell>
  );
}
