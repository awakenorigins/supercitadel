// R3 visual verify — screenshot landing + home + modules (logged in via demo token)
import { chromium } from 'playwright';
const BASE = 'https://supercitadel.62.146.238.213.sslip.io';
const OUT = '/root/.openclaw/workspace/supercitadel/shots';
import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
// 1. landing
await pg.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
await pg.waitForTimeout(1500);
await pg.screenshot({ path: OUT + '/r3-landing.png' });
// 2. login via demo button
const demo = pg.locator('text=Vào dùng thử ngay').first();
if (await demo.count()) { await demo.click(); await pg.waitForURL('**/home', { timeout: 20000 }).catch(() => {}); }
await pg.waitForTimeout(2500);
await pg.screenshot({ path: OUT + '/r3-home.png' });
// 3. modules store
await pg.goto(BASE + '/modules', { waitUntil: 'networkidle', timeout: 30000 });
await pg.waitForTimeout(1500);
await pg.screenshot({ path: OUT + '/r3-modules.png' });
// 4. accounting (OwnedBar + shell)
await pg.goto(BASE + '/accounting', { waitUntil: 'networkidle', timeout: 30000 });
await pg.waitForTimeout(1500);
await pg.screenshot({ path: OUT + '/r3-accounting.png' });
console.log('done');
await b.close();
