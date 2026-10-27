import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
const BASE = 'https://supercitadellab.62.146.238.213.sslip.io';
const JWT = readFileSync('/root/.openclaw/workspace/.jwt.txt', 'utf8').trim();
const b = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
const pg = await ctx.newPage();
await pg.addInitScript((jwt) => { localStorage.setItem('citadel.session', JSON.stringify({ jwt, user:{role:'owner'} })); localStorage.setItem('citadel.tutorial', JSON.stringify({off:true,done:{}})); }, JWT);
let res = {};
try {
  await pg.goto(`${BASE}/soul-trade`, { waitUntil:'networkidle', timeout:30000 });
  await pg.waitForTimeout(1500);
  const auto = pg.locator('.menu-item', { hasText:/Automato/i }); if (await auto.count()) { await auto.first().click(); await pg.waitForTimeout(1000); }
  // đảm bảo có 1 dial
  if (await pg.locator('.ord-dial-wrap').count() === 0) { const a = pg.locator('.ord-dial.add'); if (await a.count()){ await a.first().click(); await pg.waitForTimeout(2500);} }
  const d = pg.locator('.ord-dial-wrap .ord-dial').first();
  res = await d.evaluate((el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), br: s.borderRadius, css: s.getPropertyValue('background').slice(0,20) }; });
  const gear = pg.locator('.ord-dial-wrap .od-gear').first();
  const gx = await gear.evaluate((el)=>{ const s=getComputedStyle(el); return { left:s.left, right:s.right, w:s.width }; }).catch(()=>({}));
  res.gear = gx;
  await pg.screenshot({ path:'scripts/round-check.png' });
} catch(e){ res.err = String(e).slice(0,150); }
finally { await b.close(); }
writeFileSync('/tmp/round.json', JSON.stringify(res));
console.log(JSON.stringify(res));
