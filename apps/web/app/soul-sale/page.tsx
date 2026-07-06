'use client';
// Soul-Sale 1A (Bán Hàng & Kênh Phân Phối) — FE page. Nối API /api/v1/soul-sale/* (backend v11.4).
// Action nhạy cảm theo dry-run→confirm: gọi không confirm để xem preview → người dùng bấm xác nhận → gọi lại confirm:true.
// NẠP-MODULE: copy file này vào apps/web/app/soul-sale/page.tsx (Beat FE).
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { ModuleLocked } from '../../components/ModuleGate';
import { EmptyState } from '../../components/EmptyState';
import { api, getSession } from '../../lib/api';

interface StageRow { stage: string; probability: number; count: number; total: string; weighted: string }
interface NextBest { priority: number; action: string; refType: string; refId: string; reason: string }
interface CustRow { id: string; code: string; name: string; kind: string; phone: string | null }
interface TreeNode { id: string; code: string; name: string; kind: string; children: TreeNode[] }
interface OrderRow { id: string; code: string; status: string; grandTotal: string; createdAt: string }
interface Debtor { customerId: string; code: string; name: string; outstanding: string }
interface BatchRow { id: string; code: string; period: string; status: string; rowCount: number; exceptionCount: number }

const num = (s: string | number | null | undefined) => Number(s ?? 0).toLocaleString('vi-VN');
const STATUS_VI: Record<string, string> = {
  draft: 'Nháp', confirmed: 'Đã xác nhận', delivering: 'Đang giao', delivered: 'Đã giao',
  invoiced: 'Đã xuất HĐ', closed: 'Đóng', cancelled: 'Đã hủy', on_hold: 'Đang giữ',
  uploaded: 'Đã nạp', reconciling: 'Đang đối soát', ready: 'Sẵn sàng chốt', void: 'Đã hủy',
};
const ACTION_VI: Record<string, string> = {
  chase_quote: 'Chốt báo giá', remind_debt: 'Nhắc nợ', merge_customer: 'Gộp khách trùng', win_back: 'Gọi lại khách',
  call: 'Gọi', send_quote: 'Gửi báo giá', upsell: 'Bán thêm', collect_deposit: 'Thu cọc',
};

export default function SoulSalePage() {
  const router = useRouter();
  const [tab, setTab] = useState<'tq' | 'kenh' | 'don' | 'no' | 'doisoat'>('tq');
  const [locked, setLocked] = useState(false);
  const [pipeline, setPipeline] = useState<{ stages: StageRow[]; openCount: number; weightedTotal: string } | null>(null);
  const [nextBest, setNextBest] = useState<NextBest[] | null>(null);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [custs, setCusts] = useState<CustRow[] | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [debt, setDebt] = useState<{ topDebtors: Debtor[]; totalOutstanding: string } | null>(null);
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [kw, setKw] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const gate = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    if (/kích hoạt|hết hạn thuê|INACTIVE|RENT_EXPIRED/i.test(m)) setLocked(true);
    else setMsg({ t: m, ok: false });
  };
  const P = '/api/v1/soul-sale';

  const loadAll = useCallback((keyword?: string) => {
    api(`${P}/pipeline/summary`).then((r) => setPipeline(r.data)).catch(gate);
    api(`${P}/intel/next-best?limit=8`).then((r) => setNextBest(r.data)).catch(gate);
    api(`${P}/agency-tree`).then((r) => setTree(r.data)).catch(gate);
    api(`${P}/customers?q=${encodeURIComponent(keyword ?? '')}&limit=30`).then((r) => setCusts(r.data)).catch(gate);
    api(`${P}/orders?limit=30`).then((r) => setOrders(r.data)).catch(gate);
    api(`${P}/debt/summary?topN=10`).then((r) => setDebt(r.data)).catch(gate);
    api(`${P}/import/batches`).then((r) => setBatches(r.data.batches ?? [])).catch(gate);
  }, []);

  useEffect(() => {
    if (!getSession()) { router.push('/'); return; }
    loadAll();
  }, [router, loadAll]);

  if (locked) return <Shell><ModuleLocked id="soul-sale" name="Soul-Sale 1A" /></Shell>;

  const Tree = ({ n, d }: { n: TreeNode; d: number }) => (
    <div>
      <div style={{ paddingLeft: d * 18 }} className="row">
        <Icon name={n.kind === 'retailer' ? 'bag' : 'target'} />
        <b>{n.name}</b> <span className="muted">{n.code} · {n.kind === 'retailer' ? 'điểm bán' : n.kind === 'distributor' ? 'NPP' : 'đại lý'}</span>
      </div>
      {n.children.map((ch) => <Tree key={ch.id} n={ch} d={d + 1} />)}
    </div>
  );

  return (
    <Shell>
      <div className="page-head">
        <h1><Icon name="target" /> Soul-Sale 1A</h1>
        <div className="muted">Bán hàng & kênh phân phối — hỏi Tiểu Tâm: “pipeline tháng này thế nào?”, “ai đang nợ nhiều nhất?”</div>
      </div>
      {msg && <div className={msg.ok ? 'toast ok' : 'toast err'} onClick={() => setMsg(null)}>{msg.t}</div>}

      <div className="tabs">
        <button className={tab === 'tq' ? 'on' : ''} onClick={() => setTab('tq')}>Tổng quan</button>
        <button className={tab === 'kenh' ? 'on' : ''} onClick={() => setTab('kenh')}>Khách & Kênh</button>
        <button className={tab === 'don' ? 'on' : ''} onClick={() => setTab('don')}>Đơn hàng</button>
        <button className={tab === 'no' ? 'on' : ''} onClick={() => setTab('no')}>Công nợ</button>
        <button className={tab === 'doisoat' ? 'on' : ''} onClick={() => setTab('doisoat')}>Đối soát</button>
      </div>

      {tab === 'tq' && (
        <div className="grid2">
          <section className="card">
            <h3>Pipeline (mở: {pipeline?.openCount ?? 0} · trọng số: {num(pipeline?.weightedTotal)}đ)</h3>
            {!pipeline?.stages?.length
              ? <EmptyState icon="box" title="Chưa có deal nào" sub='Nói với Tiểu Tâm: "tạo deal 30 triệu cho khách KH-0001"' />
              : (
                <table className="tbl"><thead><tr><th>Stage</th><th>%</th><th>Số deal</th><th>Tổng</th><th>Trọng số</th></tr></thead>
                  <tbody>{pipeline.stages.map((s) => (
                    <tr key={s.stage}><td>{s.stage}</td><td>{s.probability}%</td><td>{s.count}</td><td>{num(s.total)}đ</td><td>{num(s.weighted)}đ</td></tr>
                  ))}</tbody></table>
              )}
          </section>
          <section className="card">
            <h3><Icon name="spark" /> Việc nên làm ngay</h3>
            {!nextBest?.length
              ? <EmptyState icon="box" title="Chưa có đề xuất" sub="Chạy tự động đêm hoặc phát sinh dữ liệu là mục này tự đầy" />
              : nextBest.map((a, i) => (
                <div key={i} className="row">
                  <span className="pill">{ACTION_VI[a.action] ?? a.action}</span>
                  <span>{a.reason}</span>
                </div>
              ))}
          </section>
        </div>
      )}

      {tab === 'kenh' && (
        <div className="grid2">
          <section className="card">
            <h3>Cây kênh phân phối</h3>
            {!tree?.length
              ? <EmptyState icon="users" title="Chưa dựng cây kênh" sub='Nói với Tiểu Tâm: "mở đại lý cấp 1 tên NPP Miền Nam khu vực HCM"' />
              : tree.map((n) => <Tree key={n.id} n={n} d={0} />)}
          </section>
          <section className="card">
            <h3>Khách hàng</h3>
            <div className="row">
              <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Tìm tên (bỏ dấu được) / mã / SĐT" />
              <button onClick={() => loadAll(kw)}><Icon name="search" /> Tìm</button>
            </div>
            {!custs?.length
              ? <EmptyState icon="user" title="Chưa có khách" sub='Nói với Tiểu Tâm: "tạo khách mới tên Chị Út, SĐT 0988..."' />
              : (
                <table className="tbl"><thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>SĐT</th></tr></thead>
                  <tbody>{custs.map((c) => (
                    <tr key={c.id}><td>{c.code}</td><td>{c.name}</td><td>{c.kind}</td><td>{c.phone ?? '—'}</td></tr>
                  ))}</tbody></table>
              )}
          </section>
        </div>
      )}

      {tab === 'don' && (
        <section className="card">
          <h3>Đơn hàng gần đây</h3>
          {!orders?.length
            ? <EmptyState icon="cart" title="Chưa có đơn" sub='Nói với Tiểu Tâm: "lên đơn 10 thùng NPK cho đại lý Sông Tiền"' />
            : (
              <table className="tbl"><thead><tr><th>Mã đơn</th><th>Trạng thái</th><th>Tổng tiền</th><th>Ngày</th></tr></thead>
                <tbody>{orders.map((o) => (
                  <tr key={o.id}><td>{o.code}</td><td><span className="pill">{STATUS_VI[o.status] ?? o.status}</span></td><td>{num(o.grandTotal)}đ</td><td>{new Date(o.createdAt).toLocaleDateString('vi-VN')}</td></tr>
                ))}</tbody></table>
            )}
        </section>
      )}

      {tab === 'no' && (
        <section className="card">
          <h3>Top công nợ (tổng: {num(debt?.totalOutstanding)}đ)</h3>
          {!debt?.topDebtors?.length
            ? <EmptyState icon="coin" title="Không ai đang nợ" sub="Đơn xác nhận chưa thu đủ tiền sẽ hiện ở đây" />
            : (
              <table className="tbl"><thead><tr><th>Mã</th><th>Khách</th><th>Đang nợ</th></tr></thead>
                <tbody>{debt.topDebtors.map((d) => (
                  <tr key={d.customerId}><td>{d.code}</td><td>{d.name}</td><td><b>{num(d.outstanding)}đ</b></td></tr>
                ))}</tbody></table>
            )}
        </section>
      )}

      {tab === 'doisoat' && (
        <section className="card">
          <h3>Batch bảng kê đại lý (Splitter)</h3>
          {!batches?.length
            ? <EmptyState icon="book" title="Chưa nạp bảng kê nào" sub='Nói với Tiểu Tâm: "nạp file bảng kê tháng 6 của NPP Đồng Tháp" rồi đính kèm Excel' />
            : (
              <table className="tbl"><thead><tr><th>Mã batch</th><th>Kỳ</th><th>Trạng thái</th><th>Số dòng</th><th>Case mở</th></tr></thead>
                <tbody>{batches.map((b) => (
                  <tr key={b.id}><td>{b.code}</td><td>{b.period}</td><td><span className="pill">{STATUS_VI[b.status] ?? b.status}</span></td><td>{b.rowCount}</td><td>{b.exceptionCount}</td></tr>
                ))}</tbody></table>
            )}
        </section>
      )}
      {/* Spacer: chừa chỗ cho bottom-nav mobile (fixed 78px) + safe-area, tránh che nội dung cuối */}
      <div aria-hidden style={{ height: 'calc(96px + env(safe-area-inset-bottom, 0px))' }} />
    </Shell>
  );
}
