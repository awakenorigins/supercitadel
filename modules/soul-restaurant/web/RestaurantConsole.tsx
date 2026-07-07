/**
 * SOUL-RESTAURANT — web/RestaurantConsole.tsx
 * Bảng điều khiển vận hành cho apps/web (Next 15). Render ĐỘNG từ
 * restoUiCatalog → mọi năng lực (42) là một nút thật, gọi đúng route module.
 * "Sống 100%": không nút chết — thêm tool phải thêm entry catalog (audit ép 1:1).
 *
 * Mount tại /restaurant (khai trong manifest.module.json#menu). Component này
 * KHÔNG nằm trong tsc của module (tsconfig include chỉ src+tests); apps/web
 * biên dịch nó. Import catalog + client từ package module.
 *
 * Dùng:
 *   import { RestaurantConsole } from '@citadel/module-soul-restaurant/web/RestaurantConsole';
 *   <RestaurantConsole />   // JWT do host gắn qua cookie/session
 */
import React, { useEffect, useMemo, useState } from 'react';
import { restoUiCatalog, UI_GROUPS, type UiCapability, type UiField } from '../src/ui-catalog.js';
import { RestaurantApi } from './api-client.js';

function coerce(field: UiField, raw: string): unknown {
  if (raw === '' || raw == null) return undefined;
  if (field.type === 'number') return Number(raw);
  if (field.type === 'bool') return raw === 'true';
  if (field.type === 'json') { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}

function CapabilityCard({ cap, api }: { cap: UiCapability; api: RestaurantApi }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);

  async function run(confirm?: boolean) {
    setBusy(true); setResult(null);
    const params: Record<string, unknown> = {};
    for (const f of cap.fields) {
      const v = coerce(f, form[f.name] ?? '');
      if (v !== undefined) params[f.name] = v;
    }
    if (cap.sensitive && confirm) params.confirm = true;
    const res = await api.call(cap, params);
    setResult(res);
    setBusy(false);
    setConfirming(false);
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong>{cap.label}</strong>
        <span style={{ fontSize: 11, color: cap.kind === 'action' ? '#b45309' : '#0369a1' }}>
          {cap.method} · {cap.tool}{cap.sensitive ? ' · 🔒' : ''}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0' }}>
        {cap.fields.map((f) => (
          <label key={f.name} style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>{f.label}{f.required ? ' *' : ''}</span>
            {f.type === 'select' ? (
              <select value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                <option value="">—</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'bool' ? (
              <select value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                <option value="">—</option><option value="true">Có</option><option value="false">Không</option>
              </select>
            ) : f.type === 'json' || f.type === 'textarea' ? (
              <textarea rows={2} placeholder={f.placeholder} value={form[f.name] ?? ''}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
            ) : (
              <input type={f.type === 'number' ? 'number' : 'text'} placeholder={f.placeholder}
                value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      {cap.sensitive && !confirming ? (
        <button disabled={busy} onClick={() => setConfirming(true)}>Chuẩn bị {cap.label}…</button>
      ) : cap.sensitive && confirming ? (
        <span>
          <button disabled={busy} onClick={() => run(true)}>Xác nhận chạy</button>{' '}
          <button disabled={busy} onClick={() => setConfirming(false)}>Hủy</button>
        </span>
      ) : (
        <button disabled={busy} onClick={() => run(false)}>{busy ? 'Đang chạy…' : 'Chạy'}</button>
      )}
      {result != null && (
        <pre style={{ marginTop: 10, maxHeight: 260, overflow: 'auto', background: '#0b1021', color: '#d7e0ff', padding: 10, borderRadius: 8, fontSize: 12 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function RestaurantConsole({ baseUrl, token }: { baseUrl?: string; token?: string }) {
  const api = useMemo(() => new RestaurantApi(baseUrl, token), [baseUrl, token]);
  const [group, setGroup] = useState<string>(UI_GROUPS[0]);
  const [dash, setDash] = useState<unknown>(null);

  useEffect(() => {
    api.call({ method: 'GET', path: '/restaurant/dashboard' }, {}).then((r) => setDash(r.data ?? r.error));
  }, [api]);

  const caps = restoUiCatalog.filter((c) => c.group === group);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ borderRight: '1px solid #e5e7eb', paddingRight: 12 }}>
        <h3>Nhà hàng</h3>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{restoUiCatalog.length} năng lực · sống 100%</div>
        {UI_GROUPS.map((g) => (
          <button key={g} onClick={() => setGroup(g)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: g === group ? '#111827' : '#f3f4f6', color: g === group ? '#fff' : '#111827' }}>
            {g}
          </button>
        ))}
      </aside>
      <main>
        {group === 'Bảng điều khiển' && (
          <pre style={{ background: '#0b1021', color: '#d7e0ff', padding: 12, borderRadius: 10, maxHeight: 220, overflow: 'auto', fontSize: 12 }}>
            {JSON.stringify(dash, null, 2)}
          </pre>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {caps.map((c) => <CapabilityCard key={c.tool} cap={c} api={api} />)}
        </div>
      </main>
    </div>
  );
}

export default RestaurantConsole;
