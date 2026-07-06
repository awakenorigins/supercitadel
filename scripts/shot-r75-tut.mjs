// R7.5 — verify Tutorial hiển thị trên live (clean localStorage) + chụp screenshot
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://supercitadel.62.146.238.213.sslip.io';
const TOKEN = readFileSync('/tmp/seed.txt', 'utf8').trim();

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// login qua API → set localStorage session như FE làm
const res = await page.request.post(`${BASE}/api/v1/auth/login`, { data: { token: TOKEN } });
const login = await res.json();
if (!login.jwt) { console.error('LOGIN FAIL', JSON.stringify(login).slice(0, 200)); process.exit(1); }

await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
// tìm key session mà FE dùng
await page.evaluate((s) => {
  localStorage.clear();
  localStorage.setItem('citadel.session', JSON.stringify(s));
}, login);
await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800); // chờ auto-start 650ms + render

const tut = await page.$('.tut-layer');
const card = await page.$('.tut-card');
console.log('tut-layer:', !!tut, '| tut-card:', !!card);
if (card) console.log('card text:', (await card.innerText()).slice(0, 120).replace(/\n/g, ' | '));
console.log('url:', page.url());
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await page.screenshot({ path: 'scripts/shot-r75-tut-home.png', fullPage: false });
await browser.close();
