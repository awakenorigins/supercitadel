// R7.6 — playwright verify mobile: tutorial center card + FAB "?", chat persistence UI, send button size
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://supercitadel.62.146.238.213.sslip.io';
const TOKEN = readFileSync('/tmp/seed.txt', 'utf8').trim();

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
// iPhone-ish viewport
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const res = await page.request.post(`${BASE}/api/v1/auth/login`, { data: { token: TOKEN } });
const login = await res.json();
await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('citadel.session', JSON.stringify(s)); }, login);

// A. tutorial welcome (bước center) trên mobile — card phải ở GIỮA màn
await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
const card = await page.$('.tut-card');
if (card) {
  const box = await card.boundingBox();
  const centered = box && box.x >= 8 && box.x + box.width <= 390 - 8 && box.y > 100 && box.y + box.height < 844 - 60;
  console.log('A. welcome card mobile:', JSON.stringify(box), '| centered:', centered ? 'YES' : 'NO');
  await page.screenshot({ path: 'scripts/shot-r76-tut-mobile.png' });
  // Bỏ qua tour
  const skip = await page.$('.tut-skip');
  if (skip) await skip.click(); else await page.click('.tut-next');
  await page.waitForTimeout(500);
} else console.log('A. welcome card mobile: NOT SHOWN');

// B. FAB "?" gọi lại tour sau khi đã bỏ qua
const fab = await page.$('.tut-fab');
console.log('B. tut-fab visible:', !!fab);
if (fab) {
  await fab.click();
  await page.waitForTimeout(1200);
  const again = await page.$('.tut-card');
  console.log('B2. tour recalled via FAB:', !!again);
  await page.screenshot({ path: 'scripts/shot-r76-fab-recall.png' });
  // đóng
  const kill = await page.$('.tut-kill');
  if (kill) await kill.click();
}

// C. chat sheet: send button size + history hiển thị (đã có từ verify-r76.py)
await page.click('.bn-c'); // botnav Tiểu Tâm → trang tieu-tam; mở sheet qua tb-energy không có trên mobile → dùng event
await page.waitForTimeout(600);
await page.evaluate(() => window.dispatchEvent(new Event('citadel:tt-chat')));
await page.waitForTimeout(1500);
const sendBtn = await page.$('.tt-sheet button[aria-label="Gửi tin nhắn"]');
const sb = sendBtn ? await sendBtn.boundingBox() : null;
console.log('C. send button:', JSON.stringify(sb), '| >=44px:', sb && sb.width >= 44 && sb.height >= 44 ? 'YES' : 'NO');
const bubbles = await page.$$eval('.tt-sheet .bub', (els) => els.length);
console.log('C2. history bubbles rendered:', bubbles, bubbles > 2 ? '(persistence UI OK)' : '(chỉ greeting?)');
const leaked = await page.$$eval('.tt-sheet .bub', (els) => els.some((e) => (e.textContent || '').includes('data:')));
console.log('C3. "data:" leak in bubbles:', leaked ? 'STILL LEAKING ❌' : 'CLEAN ✅');
await page.screenshot({ path: 'scripts/shot-r76-chat-mobile.png' });
await browser.close();
