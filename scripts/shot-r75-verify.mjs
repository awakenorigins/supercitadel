// R7.5 — verify sau deploy: tutorial /modules ver2 (bước Module Company) + wizard tour + widget chat small-talk
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://supercitadel.62.146.238.213.sslip.io';
const TOKEN = readFileSync('/tmp/seed.txt', 'utf8').trim();

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const res = await page.request.post(`${BASE}/api/v1/auth/login`, { data: { token: TOKEN } });
const login = await res.json();
if (!login.jwt) { console.error('LOGIN FAIL'); process.exit(1); }

await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('citadel.session', JSON.stringify(s)); }, login);

// 1) /modules tour ver2 — có bước Module Company
await page.goto(`${BASE}/modules`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
let card = await page.$('.tut-card');
console.log('A. /modules tour auto-start:', !!card);
if (card) {
  // bấm Tiếp để tới bước 2 (Module Company)
  await page.click('.tut-next');
  await page.waitForTimeout(700);
  const txt = await (await page.$('.tut-card'))?.innerText();
  console.log('A2. step2 text:', txt?.slice(0, 80).replace(/\n/g, ' | '));
  await page.screenshot({ path: 'scripts/shot-r75-modules-tour.png' });
  // đóng tour để test wizard
  const kill = await page.$('.tut-kill');
  await page.click('.tut-next').catch(() => {});
  await page.waitForTimeout(400);
  await page.click('.tut-next').catch(() => {});
  await page.waitForTimeout(400);
}
// 2) mở wizard Module Company → tour company-wizard tự chạy
const addBtn = await page.$('[data-tut="company-module-card"] button');
if (addBtn) {
  await addBtn.click();
  await page.waitForTimeout(1400);
  const wcard = await page.$('.tut-card');
  const wtxt = wcard ? await wcard.innerText() : '';
  console.log('B. wizard tour:', !!wcard, '|', wtxt.slice(0, 70).replace(/\n/g, ' | '));
  await page.screenshot({ path: 'scripts/shot-r75-wizard-tour.png' });
  // đóng
  await page.click('.tut-kill').catch(() => {});
  await page.click('.sh-x').catch(() => {});
} else console.log('B. wizard: KHÔNG thấy nút Add trên card company-module');

// 3) widget chat small-talk — kỳ vọng KHÔNG còn "nghẽn AI"/"Không kết nối được"
await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
await page.evaluate(() => { const st = { done: { 'home@v1': true }, off: true }; localStorage.setItem('citadel.tutorial', JSON.stringify(st)); });
await page.reload({ waitUntil: 'networkidle' });
await page.click('.tb-energy');
await page.waitForTimeout(900);
await page.fill('.tt-sheet input, .tt-sheet textarea', 'chào em, hôm nay em thấy sao?');
await page.keyboard.press('Enter');
// chờ stream xong (tối đa 40s)
let reply = '';
for (let t = 0; t < 40; t++) {
  await page.waitForTimeout(1000);
  const bubs = await page.$$eval('.bub.ai', (els) => els.map((e) => e.textContent || ''));
  reply = bubs.at(-1) ?? '';
  if (reply && !(await page.$('.blink'))) break;
}
console.log('C. chat reply:', reply.slice(0, 140).replace(/\n/g, ' '));
console.log('C2. PASS:', reply.length > 0 && !reply.includes('nghẽn kết nối AI') && !reply.includes('Không kết nối được') && !reply.includes('Mạng đang chập chờn') ? 'YES ✅' : 'NO ❌');
await page.screenshot({ path: 'scripts/shot-r75-chat.png' });
await browser.close();
