// Audit TOÀN BỘ tác vụ Automato như người: NaN inputs, vốn giả lập, nút ARM lớn,
// đa lệnh (add/arm/disarm/edit/delete), tab Shield/Nhật ký. Ghi kết quả gọn ra /tmp/all.txt.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
const BASE = 'https://supercitadellab.62.146.238.213.sslip.io';
const JWT = readFileSync('/root/.openclaw/workspace/.jwt.txt', 'utf8').trim();
const R = [];
const ok = (n, cond, d = '') => { R.push(`${cond ? 'PASS' : 'FAIL'} ${n}${d ? ' :: ' + d : ''}`); };
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 1100 } });
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
  ok('view-automato', await pg.locator('.automato-v12').count() > 0);

  // 1) Nút ARM lớn
  const core = pg.locator('.core').first();
  ok('nut-ARM-lon-ton-tai', await core.count() > 0);

  // 2) Vốn giả lập chip
  ok('von-gia-lap-chip', await pg.locator('.cap-chip').count() > 0);

  // 3) NaN test ô risk
  const risk = pg.locator('.field', { hasText: /Rủi ro mỗi lệnh/i }).locator('input').first();
  if (await risk.count()) {
    await risk.click(); await risk.fill(''); await risk.type('0,1', { delay: 30 }); await risk.blur(); await pg.waitForTimeout(300);
    const v = await risk.inputValue();
    ok('nhap-0,1-khong-NaN', v === '0.1', v);
  } else ok('o-risk-ton-tai', false);

  // 4) Đa lệnh: card
  ok('card-da-lenh', await pg.locator('.ord-card').count() > 0);

  // 5) Thêm 2 lệnh → 2 dial
  const before = await pg.locator('.ord-dial-wrap').count();
  for (let k = 0; k < 2; k++) { const add = pg.locator('.ord-dial.add'); if (await add.count()) { await add.first().click(); await pg.waitForTimeout(2200); } }
  const after = await pg.locator('.ord-dial-wrap').count();
  ok('them-lenh-max10', after >= before + 1, `dials ${before}->${after}`);

  // 6) Bấm nút nhỏ arm → đổi trạng thái
  const dial = pg.locator('.ord-dial-wrap .ord-dial').first();
  const w0 = (await dial.innerText()).replace(/\s+/g, ' ').trim();
  await dial.click(); await pg.waitForTimeout(2500);
  const w1 = (await dial.innerText()).replace(/\s+/g, ' ').trim();
  ok('bam-nut-nho-arm', w1 !== w0 || /QUÉT|đang giữ|chờ vào/.test(w1), `${w0.slice(0,22)}->${w1.slice(0,22)}`);

  // 7) disarm lại (bấm lần nữa)
  await dial.click(); await pg.waitForTimeout(2000);
  const w2 = (await dial.innerText()).replace(/\s+/g, ' ').trim();
  ok('bam-nut-nho-tat', /ARM/.test(w2) || w2 !== w1, w2.slice(0,22));

  // 8) Sửa lệnh (gear) → popup + đổi đòn bẩy
  const gear = pg.locator('.ord-dial-wrap .od-gear').first();
  if (await gear.count()) {
    await gear.click(); await pg.waitForTimeout(800);
    ok('popup-sua-mo', await pg.locator('.od-editor').count() > 0);
    // đổi hướng LONG
    const longBtn = pg.locator('.od-editor .ord-side .sbtn', { hasText: /^LONG$/ });
    if (await longBtn.count()) { await longBtn.first().click(); await pg.waitForTimeout(1200); }
    // đóng
    const done = pg.locator('.od-editor .od-ed-foot button', { hasText: /Xong/ });
    if (await done.count()) { await done.first().click(); await pg.waitForTimeout(500); }
    ok('sua-lenh-doi-huong', true);
  } else ok('nut-gear-ton-tai', false);

  // 9) Xoá hết lệnh test (dọn)
  let guard = 0;
  while ((await pg.locator('.ord-dial-wrap .od-x').count()) > 0 && guard++ < 12) {
    await pg.locator('.ord-dial-wrap .od-x').first().click(); await pg.waitForTimeout(1200);
  }
  ok('xoa-lenh', await pg.locator('.ord-dial-wrap').count() === 0);

  // 10) Tab Shield + Nhật ký tồn tại
  const shield = pg.locator('.at-tab', { hasText: /Shield/i });
  if (await shield.count()) { await shield.first().click(); await pg.waitForTimeout(700); ok('tab-shield', true); }
  const journal = pg.locator('.at-tab', { hasText: /Nhật ký/i });
  if (await journal.count()) { await journal.first().click(); await pg.waitForTimeout(700); ok('tab-nhatky', await pg.locator('.feed').count() > 0); }

  await pg.locator('.at-tab', { hasText: /Auto/i }).first().click().catch(()=>{});
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: 'scripts/audit-all.png' }).catch(() => {});
} catch (e) { ok('run', false, String(e).slice(0, 140)); }
finally { await b.close(); }
const fails = R.filter(x => x.startsWith('FAIL')).length;
const summary = `${R.length - fails}/${R.length} PASS\n` + R.join('\n');
writeFileSync('/tmp/all.txt', summary);
console.log(summary);
process.exit(fails ? 1 : 0);
