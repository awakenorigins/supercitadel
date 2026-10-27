// Audit V7 — Kế Toán 10A (4 form mới) + Soul-Sale (57 tác vụ, 8 tab) click như người.
// Kết quả gọn ra /tmp/audit-v7.txt, ảnh scripts/v7-k10a-*.png + v7-ss-*.png
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
const tab = async (label) => { await pg.locator('.tab', { hasText: label }).first().click(); await pg.waitForTimeout(900); };
try {
  /* ═══════════ KẾ TOÁN 10A ═══════════ */
  await pg.goto(`${BASE}/ke-toan-10a`, { waitUntil: 'networkidle', timeout: 40000 });
  await pg.waitForTimeout(2000);
  ok('k10a-load', await pg.locator('h1', { hasText: 'Kế Toán 10A' }).count() > 0);

  // FORM 1: Tạo mẫu định kỳ (tab Vận hành)
  await tab('Vận hành');
  const rForm = pg.locator('[data-tut="k10a-recurring-form"]');
  ok('k10a-form-dinh-ky-ton-tai', await rForm.count() > 0);
  if (await rForm.count()) {
    await rForm.locator('input').first().fill('Thuê VP audit-v7');
    await rForm.locator('input[inputmode="numeric"]').fill('20000000');
    await rForm.locator('button', { hasText: 'Tạo mẫu' }).click();
    await pg.waitForTimeout(1800);
    const msg = await pg.locator('.card').first().innerText().catch(() => '');
    const rows = await pg.locator('table.dt tbody tr', { hasText: 'Thuê VP audit-v7' }).count();
    ok('k10a-tao-mau-dinh-ky', rows > 0 || /Đã tạo mẫu định kỳ/.test(msg), `rows=${rows}`);
  }
  await shot('v7-k10a-vh');

  // FORM 2: Hạn mức tín dụng (tab Hóa đơn)
  await tab('Hóa đơn');
  const cCard = pg.locator('[data-tut="k10a-credit"]');
  ok('k10a-form-han-muc-ton-tai', await cCard.count() > 0);
  if (await cCard.count()) {
    // tạo hóa đơn trước để có contact
    const hd = pg.locator('[data-tut="k10a-hd"]');
    await hd.locator('input').first().fill('Khách AuditV7');
    await hd.locator('input[inputmode="numeric"]').fill('5000000');
    await hd.locator('button', { hasText: 'Tạo HĐ' }).click();
    await pg.waitForTimeout(2200);
    await cCard.locator('input').nth(0).fill('Khách AuditV7');
    await cCard.locator('input').nth(1).fill('30000000');
    await cCard.locator('input').nth(2).fill('30');
    await cCard.locator('button', { hasText: 'Đặt hạn mức' }).click();
    await pg.waitForTimeout(1800);
    const msg = await pg.locator('.card').first().innerText().catch(() => '');
    ok('k10a-dat-han-muc', /Đã đặt hạn mức/.test(msg), msg.slice(0, 90));
  }
  await shot('v7-k10a-hd');

  // FORM 3: Đánh giá tỷ giá (tab Phân tích)
  await tab('Phân tích');
  const fxCard = pg.locator('[data-tut="k10a-fx"]');
  ok('k10a-form-ty-gia-ton-tai', await fxCard.count() > 0);
  if (await fxCard.count()) {
    await fxCard.locator('input').nth(2).fill('1000');
    await fxCard.locator('input').nth(3).fill('25400');
    await fxCard.locator('button', { hasText: 'Đánh giá' }).click();
    await pg.waitForTimeout(1800);
    const msg = await pg.locator('.card').first().innerText().catch(() => '');
    ok('k10a-danh-gia-ty-gia', /Đánh giá lại TK/.test(msg), msg.slice(0, 110));
  }
  await shot('v7-k10a-pt');

  // FORM 4: Kết chuyển + khóa kỳ (tab Báo cáo)
  await tab('Báo cáo');
  const closeCard = pg.locator('[data-tut="k10a-close"]');
  ok('k10a-form-ket-chuyen-ton-tai', await closeCard.count() > 0);
  if (await closeCard.count()) {
    pg.once('dialog', (d) => d.accept());
    await closeCard.locator('input').fill('2025');
    await closeCard.locator('button', { hasText: 'Kết chuyển + Khóa' }).click();
    await pg.waitForTimeout(2500);
    const msg = await pg.locator('.card').first().innerText().catch(() => '');
    const lockRow = await closeCard.locator('tr', { hasText: '2025' }).count();
    ok('k10a-ket-chuyen-khoa-ky', /kết chuyển|ĐÃ KHÓA/i.test(msg) || lockRow > 0, msg.slice(0, 110));
    // mở lại kỳ để không chặn nghiệp vụ thật
    const reopen = closeCard.locator('button', { hasText: 'Mở lại' });
    if (await reopen.count()) { pg.once('dialog', (d) => d.accept()); await reopen.first().click(); await pg.waitForTimeout(1500); }
  }
  await shot('v7-k10a-bc');

  // Tabs còn lại click qua
  await tab('Sổ quỹ');
  ok('k10a-tab-so-quy', await pg.locator('[data-tut="k10a-quy"]').count() > 0);
  await shot('v7-k10a-quy');

  /* ═══════════ SOUL-SALE ═══════════ */
  await pg.goto(`${BASE}/soul-sale`, { waitUntil: 'networkidle', timeout: 40000 });
  await pg.waitForTimeout(2000);
  ok('ss-load', (await pg.locator('h1').first().innerText().catch(() => '')).includes('Soul-Sale') || await pg.locator('.tabs').count() > 0);
  const ssTabs = ['Tổng quan', 'Khách hàng', 'Đại lý', 'CRM', 'Bán hàng', 'Giá', 'Đối soát', 'Tất cả'];
  for (const t of ssTabs) {
    const el = pg.locator('.tab', { hasText: t });
    if (await el.count()) { await el.first().click(); await pg.waitForTimeout(800); ok(`ss-tab-${t}`, true); }
    else ok(`ss-tab-${t}`, false);
  }
  // Tab "Tất cả tác vụ": đếm số tác vụ hiện ra
  const allTab = pg.locator('.tab', { hasText: 'Tất cả' });
  if (await allTab.count()) {
    await allTab.first().click(); await pg.waitForTimeout(1000);
    const body = await pg.locator('body').innerText();
    const capCount = (body.match(/soulsale\./g) || []).length;
    const groups = ['Khách hàng', 'Đại lý', 'Lead', 'Báo giá', 'Đơn hàng', 'công nợ', 'hoa hồng', 'Đối soát', 'Báo cáo'];
    const foundGroups = groups.filter((g) => new RegExp(g, 'i').test(body)).length;
    ok('ss-tat-ca-tac-vu', capCount >= 57, `caps hiển thị=${capCount}`);
    ok('ss-9-nhom', foundGroups >= 7, `nhóm khớp=${foundGroups}/9`);
  }
  await shot('v7-ss-all');
  await pg.locator('.tab').first().click(); await pg.waitForTimeout(800);
  await shot('v7-ss-overview');
} catch (e) {
  R.push('ERROR ' + String(e).slice(0, 300));
  await shot('v7-error').catch(() => {});
}
await b.close();
writeFileSync('/tmp/audit-v7.txt', R.join('\n') + '\n');
console.log(R.join('\n'));
