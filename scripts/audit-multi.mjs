// Audit UI đa lệnh: đăng nhập, vào Automato, thêm 1 lệnh → kiểm mini-dial hiện + bật/tắt.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE = 'https://supercitadellab.62.146.238.213.sslip.io';
const JWT = readFileSync('/root/.openclaw/workspace/.jwt.txt', 'utf8').trim();
const out = [];
const log = (n, ok, d = '') => { out.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' :: ' + d : ''}`); };
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 1000 } });
const pg = await ctx.newPage();
await pg.addInitScript((jwt) => {
  localStorage.setItem('citadel.session', JSON.stringify({ jwt, user: { role: 'owner' } }));
  localStorage.setItem('citadel.tutorial', JSON.stringify({ off: true, done: {} }));
}, JWT);
try {
  await pg.goto(`${BASE}/soul-trade`, { waitUntil: 'networkidle', timeout: 30000 });
  await pg.waitForTimeout(1500);
  const auto = pg.locator('.menu-item', { hasText: /Automato/i });
  if (await auto.count()) { await auto.first().click(); await pg.waitForTimeout(1000); }
  log('mở view Automato', await pg.locator('.ord-card').count() > 0, 'thấy card đa lệnh');
  // đếm dial trước
  const before = await pg.locator('.ord-dial-wrap').count();
  // bấm + Thêm
  const add = pg.locator('.ord-dial.add');
  if (await add.count()) { await add.first().click(); await pg.waitForTimeout(2500); }
  const after = await pg.locator('.ord-dial-wrap').count();
  log('thêm lệnh → mini-dial xuất hiện', after > before, `dials ${before}→${after}`);
  // toggle nút nhỏ (arm)
  const dial = pg.locator('.ord-dial-wrap .ord-dial').first();
  const wordBefore = (await dial.innerText()).replace(/\s+/g, ' ').trim();
  await dial.click(); await pg.waitForTimeout(2500);
  const wordAfter = (await dial.innerText()).replace(/\s+/g, ' ').trim();
  log('bấm mini-dial → bật/tắt riêng', wordAfter !== wordBefore || /QUÉT|đang giữ|chờ vào/.test(wordAfter), `${wordBefore.slice(0,30)} → ${wordAfter.slice(0,30)}`);
  // dọn: xoá lệnh vừa thêm
  const del = pg.locator('.ord-dial-wrap .od-x').first();
  if (await del.count()) { await del.first().click(); await pg.waitForTimeout(1500); }
  await pg.screenshot({ path: 'scripts/multi-order.png' }).catch(() => {});
} catch (e) { log('chạy audit', false, String(e).slice(0, 160)); }
finally { await b.close(); }
const fail = out.filter(x => !x.ok);
console.log(`\n=== ${out.length - fail.length}/${out.length} PASS ===`);
process.exit(fail.length ? 1 : 0);
