// Audit V10 — Trang 2 cặp coin biến động dữ dội: API movers thật + UI pager + click quickstart.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
const BASE = 'https://supercitadellab.62.146.238.213.sslip.io';
const JWT = readFileSync('/root/.openclaw/workspace/.jwt.txt', 'utf8').trim();
const R = [];
const ok = (n, cond, d = '') => R.push(`${cond ? 'PASS' : 'FAIL'} ${n}${d ? ' :: ' + d : ''}`);
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 1250 } });
const pg = await ctx.newPage();
await pg.addInitScript((jwt) => {
  localStorage.setItem('citadel.session', JSON.stringify({ jwt, user: { role: 'owner' } }));
  localStorage.setItem('citadel.tutorial', JSON.stringify({ off: true, done: {} }));
}, JWT);
const shot = (n) => pg.screenshot({ path: `/root/.openclaw/workspace/supercitadellab/scripts/${n}.png` });
try {
  // 1) API movers trả dữ liệu thật
  const t0 = Date.now();
  const r0 = await (await fetch(`${BASE}/api/v1/soul-trade/trade/market/movers?limit=12`, { headers: { Authorization: `Bearer ${JWT}` } })).json();
  const ms0 = Date.now() - t0;
  const mv = r0.movers ?? [];
  ok('api-movers-co-du-lieu', mv.length >= 8, `${mv.length} cặp, ${ms0}ms`);
  ok('api-movers-du-truong', mv.every((m) => m.symbol && Number.isFinite(m.changePct) && Number.isFinite(m.rangePct)), JSON.stringify(mv[0] ?? {}).slice(0, 120));
  ok('api-movers-sap-xep-du-doi', mv.length >= 2 && (Math.abs(mv[0].changePct) + mv[0].rangePct / 2) >= (Math.abs(mv[mv.length - 1].changePct) + mv[mv.length - 1].rangePct / 2), `top=${mv[0]?.symbol} ${mv[0]?.changePct?.toFixed(1)}%`);
  ok('api-movers-volume-loc', mv.every((m) => m.quoteVolume >= 2_000_000), 'volume ≥2M hết');
  // cache lần 2 phải nhanh
  const t1 = Date.now();
  await (await fetch(`${BASE}/api/v1/soul-trade/trade/market/movers?limit=12`, { headers: { Authorization: `Bearer ${JWT}` } })).json();
  const ms1 = Date.now() - t1;
  ok('api-movers-cache-nhanh', ms1 < 700, `lần 2: ${ms1}ms (lần 1: ${ms0}ms)`);

  // 2) UI: pager 1/2 + trang 2 render movers
  await pg.goto(`${BASE}/soul-trade`, { waitUntil: 'networkidle', timeout: 45000 });
  await pg.waitForTimeout(2000);
  const auto = pg.locator('.menu-item', { hasText: /Automato/i });
  if (await auto.count()) { await auto.first().click(); await pg.waitForTimeout(1200); }
  ok('ui-pager-ton-tai', await pg.locator('.pair-pager .pgbtn').count() === 2);
  await pg.locator('.pair-pager .pgbtn', { hasText: '2' }).click();
  await pg.waitForTimeout(2500);
  const head = await pg.locator('.pair-card h3').innerText();
  ok('ui-trang2-tieu-de', /dữ dội/i.test(head), head);
  const chips = pg.locator('.coin-chip.mover');
  ok('ui-trang2-chips', await chips.count() >= 8, `${await chips.count()} chip`);
  const chip0 = await chips.first().innerText();
  ok('ui-chip-co-phan-tram', /%/.test(chip0), chip0.replace(/\n/g, ' '));
  await shot('v10-movers');

  // 3) Click chip trang 2 → quickstart chạy (toast báo)
  await chips.first().click();
  let toast = '';
  try { const tst = pg.locator('.toast'); await tst.waitFor({ timeout: 15000 }); toast = await tst.innerText(); } catch {}
  ok('ui-chip-click-quickstart', /Shadow \+ ULTRA \+ ARM|AUTOMATO/.test(toast), toast.slice(0, 90));
  await pg.waitForTimeout(1500);
  await shot('v10-movers-armed');
  // dọn: disarm
  const core = pg.locator('.core').first();
  const w = (await core.innerText()).replace(/\s+/g, ' ');
  if (/QUÉT|DISARM|%/.test(w)) { await core.click(); await pg.waitForTimeout(1500); }

  // 4) Quay lại trang 1 vẫn OK
  await pg.locator('.pair-pager .pgbtn', { hasText: '1' }).click();
  await pg.waitForTimeout(600);
  ok('ui-quay-lai-trang1', /cặp đề xuất/i.test(await pg.locator('.pair-card h3').innerText()), await pg.locator('.pair-card h3').innerText());
} catch (e) {
  R.push('ERROR ' + String(e).slice(0, 300));
  await shot('v10-error').catch(() => {});
}
await b.close();
writeFileSync('/tmp/audit-v10.txt', R.join('\n') + '\n');
console.log(R.join('\n'));
