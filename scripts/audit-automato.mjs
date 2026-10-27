// Audit thật như người: mở /soul-trade, vào Automato, thử nhập 0,1 / rỗng / rác vào
// các ô risk/TP/SL/đòn bẩy → xác nhận KHÔNG ra NaN. Test nút ARM phản hồi tức thì.
import { chromium } from 'playwright';

const BASE = process.env.WEB || 'http://127.0.0.1:3010';
const JWT = process.env.JWT;
if (!JWT) { console.error('need JWT env'); process.exit(2); }

const results = [];
const log = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`); };

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await ctx.newPage();

// inject session trước khi app load
await page.addInitScript((jwt) => {
  localStorage.setItem('citadel.session', JSON.stringify({ jwt, user: { role: 'owner' } }));
  localStorage.setItem('citadel.tutorial', JSON.stringify({ off: true, done: {} })); // tắt tour để khỏi che
}, JWT);

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

try {
  await page.goto(`${BASE}/soul-trade`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Vào view Automato
  const automatoBtn = page.locator('.menu-item', { hasText: /Automato/i });
  if (await automatoBtn.count()) { await automatoBtn.first().click(); await page.waitForTimeout(800); log('mở view Automato', true); }
  else log('mở view Automato', false, 'không thấy nút Automato');

  // Tab Auto (mặc định) — tìm ô "Rủi ro mỗi lệnh"
  // NumInp render <input type=text inputmode=decimal> trong .field
  const riskField = page.locator('.field', { hasText: /Rủi ro mỗi lệnh/i }).locator('input');
  const haveRisk = await riskField.count();
  if (!haveRisk) { log('tìm ô Rủi ro', false, 'không thấy field'); }
  else {
    log('tìm ô Rủi ro', true);
    // Test 1: gõ "0,1" (dấu phẩy VN)
    await riskField.first().click();
    await riskField.first().fill('');
    await riskField.first().type('0,1', { delay: 40 });
    await riskField.first().blur();
    await page.waitForTimeout(400);
    let v = await riskField.first().inputValue();
    log('nhập "0,1" → không NaN', v === '0.1' || v === '0,1', `giá trị = "${v}"`);

    // Test 2: xoá trắng → blur (phải khôi phục giá trị cũ, không NaN)
    await riskField.first().click();
    await riskField.first().fill('');
    await riskField.first().blur();
    await page.waitForTimeout(400);
    v = await riskField.first().inputValue();
    log('xoá trắng → không NaN', v !== 'NaN' && v !== '', `giá trị = "${v}"`);

    // Test 3: gõ rác "abc"
    await riskField.first().click();
    await riskField.first().fill('');
    await riskField.first().type('abc', { delay: 30 });
    await riskField.first().blur();
    await page.waitForTimeout(300);
    v = await riskField.first().inputValue();
    log('nhập "abc" → không NaN', v !== 'NaN' && !/NaN/.test(v), `giá trị = "${v}"`);

    // Test 4: nhập 0.1 chuẩn
    await riskField.first().click();
    await riskField.first().fill('');
    await riskField.first().type('0.1', { delay: 30 });
    await riskField.first().blur();
    await page.waitForTimeout(300);
    v = await riskField.first().inputValue();
    log('nhập "0.1" min 0,1% OK', v === '0.1', `giá trị = "${v}"`);
  }

  // Quét toàn trang: có chữ "NaN" hiển thị đâu không?
  const bodyText = await page.locator('body').innerText();
  log('không có "NaN" trên UI', !/NaN/.test(bodyText), /NaN/.test(bodyText) ? 'CÒN NaN trong DOM' : '');

  // Test ARM: bấm nút tròn, kiểm tra label đổi nhanh (<800ms)
  const core = page.locator('.core');
  if (await core.count()) {
    const before = (await core.first().innerText()).replace(/\s+/g, ' ').trim();
    const t0 = Date.now();
    await core.first().click();
    // chờ label đổi
    let changed = false, after = before;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(50);
      after = (await core.first().innerText()).replace(/\s+/g, ' ').trim();
      if (after !== before) { changed = true; break; }
    }
    const dt = Date.now() - t0;
    log('nút ARM đổi trạng thái tức thì', changed && dt < 900, `${before} → ${after} (${dt}ms)`);
    // disarm lại cho sạch
    await page.waitForTimeout(300); await core.first().click(); await page.waitForTimeout(300);
  } else log('nút ARM tồn tại', false);

  log('không có console error nghiêm trọng', consoleErrors.filter(e => !/favicon|404/.test(e)).length === 0, consoleErrors.slice(0,3).join(' | '));
} catch (e) {
  log('chạy audit', false, String(e).slice(0, 200));
} finally {
  await page.screenshot({ path: 'scripts/automato-audit.png', fullPage: false }).catch(() => {});
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
process.exit(failed.length ? 1 : 0);
