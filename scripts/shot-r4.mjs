// R4 visual verify — screenshot landing + tất cả trang nghiệp vụ (logged in via demo token)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const BASE = 'https://supercitadel.62.146.238.213.sslip.io';
const OUT = '/root/.openclaw/workspace/supercitadel/shots';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
// 1. landing
await pg.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
await pg.waitForTimeout(1500);
await pg.screenshot({ path: OUT + '/r4-landing.png' });
await pg.screenshot({ path: OUT + '/r4-landing-full.png', fullPage: true });
// 2. login via demo button
const demo = pg.locator('text=Vào dùng thử ngay').first();
if (await demo.count()) { await demo.click(); await pg.waitForURL('**/home', { timeout: 20000 }).catch(() => {}); }
await pg.waitForTimeout(2500);
await pg.screenshot({ path: OUT + '/r4-home.png', fullPage: true });
// 3-8. business pages
for (const p of ['accounting', 'crm', 'inventory', 'hr', 'om', 'modules']) {
  await pg.goto(BASE + '/' + p, { waitUntil: 'networkidle', timeout: 30000 });
  await pg.waitForTimeout(1800);
  await pg.screenshot({ path: OUT + `/r4-${p}.png` });
}
console.log('done');
await b.close();
