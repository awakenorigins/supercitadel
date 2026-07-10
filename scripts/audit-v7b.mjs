// Recheck 2 điểm: FX flash message + đếm dòng tác vụ tab "Tất cả" (UI ẩn mã máy → đếm <tr>).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
const BASE = 'https://supercitadellab.62.146.238.213.sslip.io';
const JWT = readFileSync('/root/.openclaw/workspace/.jwt.txt', 'utf8').trim();
const R = [];
const ok = (n, cond, d = '') => R.push(`${cond ? 'PASS' : 'FAIL'} ${n}${d ? ' :: ' + d : ''}`);
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 1200 } });
const pg = await ctx.newPage();
await pg.addInitScript((jwt) => {
  localStorage.setItem('citadel.session', JSON.stringify({ jwt, user: { role: 'owner' } }));
  localStorage.setItem('citadel.tutorial', JSON.stringify({ off: true, done: {} }));
}, JWT);
const shot = (n) => pg.screenshot({ path: `/root/.openclaw/workspace/supercitadellab/scripts/${n}.png` });
try {
  // FX revalue qua UI, chờ flash message đích danh
  await pg.goto(`${BASE}/ke-toan-10a`, { waitUntil: 'networkidle', timeout: 40000 });
  await pg.waitForTimeout(2000);
  await pg.locator('.tab', { hasText: 'Phân tích' }).first().click(); await pg.waitForTimeout(900);
  const fxCard = pg.locator('[data-tut="k10a-fx"]');
  await fxCard.locator('input').nth(2).fill('1000');
  await fxCard.locator('input').nth(3).fill('25600');
  await fxCard.locator('button', { hasText: 'Đánh giá' }).click();
  let flashTxt = '';
  try { const fl = pg.locator('div.card', { hasText: 'Đánh giá lại TK' }); await fl.waitFor({ timeout: 5000 }); flashTxt = await fl.innerText(); } catch {}
  ok('k10a-danh-gia-ty-gia-ui', /Đánh giá lại TK/.test(flashTxt), flashTxt.slice(0, 120));
  await shot('v7-k10a-fx');

  // Soul-Sale tab Tất cả: đếm dòng tác vụ
  await pg.goto(`${BASE}/soul-sale`, { waitUntil: 'networkidle', timeout: 40000 });
  await pg.waitForTimeout(2000);
  await pg.locator('.tab', { hasText: 'Tất cả' }).first().click(); await pg.waitForTimeout(1500);
  const rows = await pg.locator('section.card table tbody tr').count();
  const sections = await pg.locator('section.card h3').allInnerTexts();
  ok('ss-tat-ca-57-tac-vu', rows >= 57, `rows=${rows}, nhóm=${sections.length}: ${sections.join(' | ')}`);
  await shot('v7-ss-all');
} catch (e) { R.push('ERROR ' + String(e).slice(0, 300)); }
await b.close();
writeFileSync('/tmp/audit-v7b.txt', R.join('\n') + '\n');
console.log(R.join('\n'));
