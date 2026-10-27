// Audit V8 — Soul-Trade (Automato mượt? đo ms từng thao tác) + Soul-Restaurant (click 11 tab như user).
// Kết quả /tmp/audit-v8.txt, ảnh scripts/v8-*.png
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
  /* ═══ SOUL-TRADE / AUTOMATO ═══ */
  await pg.goto(`${BASE}/soul-trade`, { waitUntil: 'networkidle', timeout: 45000 });
  await pg.waitForTimeout(2000);
  const auto = pg.locator('.menu-item', { hasText: /Automato/i });
  if (await auto.count()) { await auto.first().click(); await pg.waitForTimeout(1200); }
  ok('st-automato-view', await pg.locator('.core').count() > 0);

  // 1) Đo độ trễ ARM lớn: từ click → chữ trên nút đổi (optimistic phải < 300ms)
  const core = pg.locator('.core').first();
  const word0 = (await core.innerText()).replace(/\s+/g, ' ').trim();
  const t0 = Date.now();
  await core.click();
  let flipped = -1;
  for (let i = 0; i < 40; i++) {
    const w = (await core.innerText()).replace(/\s+/g, ' ').trim();
    if (w !== word0) { flipped = Date.now() - t0; break; }
    await pg.waitForTimeout(25);
  }
  ok('st-ARM-doi-tuc-thi', flipped >= 0 && flipped <= 400, `đổi sau ${flipped}ms (yêu cầu ≤400ms)`);
  await pg.waitForTimeout(2500);
  // không bị poll ghi đè lật ngược
  const wordAfterPoll = (await core.innerText()).replace(/\s+/g, ' ').trim();
  ok('st-ARM-khong-bi-lat-nguoc', wordAfterPoll !== word0, `sau 2.5s poll: "${wordAfterPoll.slice(0, 30)}"`);

  // 2) DISARM cũng phải tức thì
  const w1 = wordAfterPoll;
  const t1 = Date.now();
  await core.click();
  let flip2 = -1;
  for (let i = 0; i < 40; i++) {
    const w = (await core.innerText()).replace(/\s+/g, ' ').trim();
    if (w !== w1) { flip2 = Date.now() - t1; break; }
    await pg.waitForTimeout(25);
  }
  ok('st-DISARM-tuc-thi', flip2 >= 0 && flip2 <= 400, `đổi sau ${flip2}ms`);
  await pg.waitForTimeout(2800);
  const wEnd = (await core.innerText()).replace(/\s+/g, ' ').trim();
  ok('st-DISARM-giu-trang-thai', /ARM/.test(wEnd) && !/QUÉT/.test(wEnd), wEnd.slice(0, 30));

  // 3) Double-click nhanh không vỡ state (armInFlight guard)
  await core.click(); await pg.waitForTimeout(60); await core.click(); await pg.waitForTimeout(2500);
  const wDouble = (await core.innerText()).replace(/\s+/g, ' ').trim();
  ok('st-double-click-an-toan', wDouble.length > 0, `state: "${wDouble.slice(0, 28)}"`);
  // đưa về armed=false cho sạch
  if (/QUÉT/.test(wDouble)) { await core.click(); await pg.waitForTimeout(1500); }

  // 4) Đa lệnh: toggle nút nhỏ tức thì + không flicker
  const dials = pg.locator('.ord-dial-wrap .ord-dial');
  if (await dials.count() === 0) { const add = pg.locator('.ord-dial.add'); if (await add.count()) { await add.click(); await pg.waitForTimeout(2000); } }
  if (await dials.count() > 0) {
    const d0 = dials.first();
    const dw0 = (await d0.innerText()).replace(/\s+/g, ' ').trim();
    const t2 = Date.now();
    await d0.click();
    let flip3 = -1;
    for (let i = 0; i < 40; i++) {
      const w = (await d0.innerText()).replace(/\s+/g, ' ').trim();
      if (w !== dw0) { flip3 = Date.now() - t2; break; }
      await pg.waitForTimeout(25);
    }
    ok('st-order-dial-toggle-tuc-thi', flip3 >= 0 && flip3 <= 400, `${flip3}ms`);
    await pg.waitForTimeout(3200); // qua 1 chu kỳ poll 3s
    const dwAfter = (await d0.innerText()).replace(/\s+/g, ' ').trim();
    ok('st-order-dial-khong-flicker', dwAfter !== dw0, `sau poll: "${dwAfter.slice(0, 30)}"`);
    await d0.click(); await pg.waitForTimeout(1200); // tắt lại
  } else ok('st-order-dial-ton-tai', false);

  // 5) Slider đòn bẩy optimistic
  const range = pg.locator('.lev-range').first();
  if (await range.count()) {
    await range.fill('12'); await pg.waitForTimeout(300);
    const lv = await pg.locator('.lev-val').first().innerText();
    ok('st-leverage-slider-nhanh', /12/.test(lv), lv.trim());
  }
  await shot('v8-st-automato');

  // 6) Tab Phân tích + Nhật ký render
  for (const t of ['Phân tích', 'Nhật ký']) {
    const el = pg.locator('.at-tabs button, .at-tabs .tab', { hasText: t });
    if (await el.count()) { await el.first().click(); await pg.waitForTimeout(1200); ok(`st-tab-${t}`, true); }
    else ok(`st-tab-${t}`, false);
  }
  await shot('v8-st-analytics');

  /* ═══ SOUL-RESTAURANT ═══ */
  await pg.goto(`${BASE}/soul-restaurant`, { waitUntil: 'networkidle', timeout: 45000 });
  await pg.waitForTimeout(2200);
  ok('resto-load', await pg.locator('h1', { hasText: 'Soul-Restaurant' }).count() > 0);
  const groups = ['Bảng điều khiển', 'Sàn & Bàn', 'Đơn hàng', 'Bếp / KDS', 'Menu & Định lượng', 'Bill & Thanh toán', 'Đặt bàn', 'Khuyến mãi', 'Khách & Điểm', 'Báo cáo', 'Cấu hình'];
  let consoleErrs = 0;
  pg.on('pageerror', () => consoleErrs++);
  for (const g of groups) {
    const el = pg.locator('.tabs button', { hasText: g });
    if (await el.count()) {
      await el.first().click(); await pg.waitForTimeout(900);
      const body = (await pg.locator('body').innerText()).length;
      ok(`resto-tab-${g}`, body > 300, `content ${body} chars`);
    } else ok(`resto-tab-${g}`, false, 'không thấy tab');
  }
  ok('resto-khong-js-error', consoleErrs === 0, `${consoleErrs} lỗi`);
  await pg.locator('.tabs button', { hasText: 'Sàn & Bàn' }).first().click(); await pg.waitForTimeout(1000);
  await shot('v8-resto-floor');
  await pg.locator('.tabs button', { hasText: 'Bảng điều khiển' }).first().click(); await pg.waitForTimeout(1000);
  await shot('v8-resto-dash');
} catch (e) {
  R.push('ERROR ' + String(e).slice(0, 300));
  await shot('v8-error').catch(() => {});
}
await b.close();
writeFileSync('/tmp/audit-v8.txt', R.join('\n') + '\n');
console.log(R.join('\n'));
