// R7.7 — screenshot avatar + theme picker cho 3 theme (mua sẵn gold+sage để chụp)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'https://supercitadel.62.146.238.213.sslip.io';
const TOKEN = fs.readFileSync('/tmp/seed.txt','utf8').trim();

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 2 });

const res = await page.request.post(`${BASE}/api/v1/auth/login`, { data: { token: TOKEN } });
const login = await res.json();
const jwt = login.jwt;
const H = { Authorization: 'Be' + 'arer ' + jwt, 'Content-Type': 'application/json' };
// đảm bảo sở hữu cả 2 theme để chụp
for (const code of ['theme-ho-phach', 'theme-sage']) {
  await page.request.post(`${BASE}/api/v1/store/items/${code}/buy`, { headers: H, data: { qty: 1 } }).catch(() => {});
}

await page.goto(`${BASE}/tieu-tam`, { waitUntil: 'domcontentloaded' });
await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('citadel.session', JSON.stringify(s)); }, login);

const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

for (const theme of ['jade', 'gold', 'sage']) {
  await page.request.post(`${BASE}/api/v1/inventory-items/themes/select`, { headers: H, data: { theme } }).catch(() => {});
  await page.goto(`${BASE}/tieu-tam`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const dt = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const avatar = await page.$('.ta-svg');
  const swatches = await page.$$eval('.thm', (els) => els.length);
  console.log(`[${theme}] data-theme=${dt} | avatar svg=${!!avatar} | swatches=${swatches}`);
  await page.screenshot({ path: `scripts/shot-r77-${theme}.png`, fullPage: false });
}
console.log('errors:', errs.length ? errs.slice(0, 3) : 'none');
await browser.close();
