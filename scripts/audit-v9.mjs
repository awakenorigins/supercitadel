// Audit V9 — Gắn tài khoản sàn thật (BingX): modal keys, verify fail với key giả, API status.
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
  // 1) API: GET keys status (chưa có key)
  const st0 = await (await fetch(`${BASE}/api/v1/soul-trade/trade/bots/RSI/keys`, { headers: { Authorization: `Bearer ${JWT}` } })).json();
  ok('api-keys-status', st0.has_keys === false || st0.has_keys === true, JSON.stringify(st0).slice(0, 100));

  // 2) API: POST key GIẢ → phải bị TỪ CHỐI (verify fail, không lưu key chết)
  const bad = await fetch(`${BASE}/api/v1/soul-trade/trade/bots/RSI/keys`, {
    method: 'POST', headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'fake-key-12345678', secret: 'fake-secret-12345678' }),
  });
  const badBody = await bad.json().catch(() => ({}));
  ok('api-key-gia-bi-tu-choi', !bad.ok || badBody.error, `status=${bad.status} ${JSON.stringify(badBody).slice(0, 140)}`);

  // 3) Sau khi POST fail, has_keys vẫn phải false (không lưu key chết)
  const st1 = await (await fetch(`${BASE}/api/v1/soul-trade/trade/bots/RSI/keys`, { headers: { Authorization: `Bearer ${JWT}` } })).json();
  ok('api-khong-luu-key-chet', st1.has_keys === false, JSON.stringify(st1).slice(0, 100));

  // 4) UI: nút "Gắn sàn thật" trên card bot
  await pg.goto(`${BASE}/soul-trade`, { waitUntil: 'networkidle', timeout: 45000 });
  await pg.waitForTimeout(2000);
  const keyBtn = pg.locator('button', { hasText: /Gắn sàn thật|Đã nối sàn/ });
  ok('ui-nut-gan-san', await keyBtn.count() > 0, `${await keyBtn.count()} nút`);

  // 5) Mở modal → có input API Key + Secret + hướng dẫn quyền
  await keyBtn.first().click(); await pg.waitForTimeout(800);
  const modal = pg.locator('.od-editor', { hasText: /Nối sàn thật/ });
  ok('ui-modal-mo', await modal.count() > 0);
  ok('ui-modal-input-key', await modal.locator('input[type="text"]').count() > 0);
  ok('ui-modal-input-secret', await modal.locator('input[type="password"]').count() > 0);
  const modalText = await modal.innerText();
  ok('ui-modal-huong-dan-quyen', /Read \+ Perpetual Futures Trading/.test(modalText) && /Withdraw/.test(modalText));
  ok('ui-modal-nhac-verify', /Verify/.test(modalText));
  await shot('v9-keys-modal');

  // 6) Nhập key giả trong UI → bấm Verify + Lưu → phải hiện toast lỗi (không im lặng)
  await modal.locator('input[type="text"]').fill('fake-ui-key-9999999');
  await modal.locator('input[type="password"]').fill('fake-ui-secret-9999999');
  await modal.locator('button', { hasText: 'Verify + Lưu' }).click();
  let toastErr = '';
  try { const tst = pg.locator('.toast', { hasText: /Kết nối thất bại|lỗi|error|không/i }); await tst.waitFor({ timeout: 20000 }); toastErr = await tst.innerText(); } catch {}
  ok('ui-key-gia-bao-loi', toastErr.length > 0, toastErr.slice(0, 120));
  await shot('v9-keys-fail');
} catch (e) {
  R.push('ERROR ' + String(e).slice(0, 300));
  await shot('v9-error').catch(() => {});
}
await b.close();
writeFileSync('/tmp/audit-v9.txt', R.join('\n') + '\n');
console.log(R.join('\n'));
