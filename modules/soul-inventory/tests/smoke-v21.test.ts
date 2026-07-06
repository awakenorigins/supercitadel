/**
 * SOUL-INVENTORY v2.1 — Smoke test AUTOMATION LAYER
 * Cover: demand stats (avg/stddev/cv), forecast MA+SES, safety stock,
 * reorder point động, EOQ, smart replenish, projected inventory,
 * ABC-XYZ matrix, dead stock, runScheduledTasks orchestrator + log,
 * RLS cross-tenant 4 bảng automation, tools/actions v2.1 qua registry.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { EventBus, KhoCtx, KhoEventPayload } from '../src/types.js';
import { getKhoTool, khoReadTools, khoWriteActions } from '../src/tools/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));
let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function eqNum(name: string, actual: unknown, expected: number, tol = 0.01) {
  check(name, Math.abs(Number.parseFloat(String(actual)) - expected) < tol,
    `(actual=${actual}, expected≈${expected})`);
}

const events: Array<{ name: string; payload: KhoEventPayload }> = [];
const bus: EventBus = { emit: (n, p) => { events.push({ name: n, payload: p }); } };

async function main() {
  console.log('— SOUL-INVENTORY v2.1 AUTOMATION SMOKE —');
  const client = new PGlite();
  const db = drizzle(client);
  for (const f of ['0000_init.sql','0001_rls.sql','0002_backfill_legacy.sql',
    '0003_v2_final.sql','0004_v2_rls.sql','0005_v2_1_automation.sql','0006_v2_1_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }
  await client.exec(`CREATE ROLE citadel_app LOGIN; GRANT USAGE ON SCHEMA public TO citadel_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;`);

  const ORG = randomUUID(); const ORG_B = randomUUID(); const USER = randomUUID();
  async function withTenant<T>(orgId: string, fn: (ctx: KhoCtx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      return fn({ db: tx as unknown as KhoCtx['db'], orgId, userId: USER, bus });
    });
  }
  async function run(orgId: string, name: string, input: unknown) {
    const t = getKhoTool(name);
    if (!t) throw new Error(`tool missing: ${name}`);
    const res = await withTenant(orgId, (ctx) => t.handler(ctx, input));
    if (res && typeof res === 'object' && 'ok' in res && 'data' in res) {
      return (res as unknown as { data: unknown }).data;
    }
    return res;
  }
  async function runFull(orgId: string, name: string, input: unknown) {
    const t = getKhoTool(name)!;
    return withTenant(orgId, (ctx) => t.handler(ctx, input)) as Promise<{ ok: boolean; message: string; data: unknown }>;
  }

  // ── SEED: 3 loại hàng qua registry (test cả tools nền lẫn automation) ──
  await run(ORG, 'kho.item.upsert', { sku: 'DEU-01', name: 'Hàng bán đều', unit: 'cái' });
  await run(ORG, 'kho.item.upsert', { sku: 'LOAN-01', name: 'Hàng thất thường', unit: 'cái' });
  await run(ORG, 'kho.item.upsert', { sku: 'CHET-01', name: 'Hàng chết', unit: 'cái' });
  await run(ORG, 'kho.stock.receive', { sku: 'DEU-01', quantity: '500', unit_cost: '10000' });
  await run(ORG, 'kho.stock.receive', { sku: 'LOAN-01', quantity: '300', unit_cost: '50000' });
  await run(ORG, 'kho.stock.receive', { sku: 'CHET-01', quantity: '100', unit_cost: '99000' });

  // Backdate lịch sử: đều 5/ngày × 20 ngày; thất thường 3 cú lớn; chết 0 xuất
  await withTenant(ORG, async (ctx) => {
    for (let i = 1; i <= 20; i++) {
      await ctx.db.execute(sql`
        INSERT INTO kho_movements (org_id, item_id, location_id, type, delta, created_at)
        SELECT ${ORG}, i.id, l.id, 'issue', -5, now() - (${i}::int || ' days')::interval
        FROM kho_items i, kho_locations l
        WHERE i.org_id=${ORG} AND i.sku='DEU-01' AND l.org_id=${ORG} LIMIT 1`);
    }
    for (const [day, q] of [[5, 60], [25, 90], [55, 30]] as const) {
      await ctx.db.execute(sql`
        INSERT INTO kho_movements (org_id, item_id, location_id, type, delta, created_at)
        SELECT ${ORG}, i.id, l.id, 'issue', ${-q}, now() - (${day}::int || ' days')::interval
        FROM kho_items i, kho_locations l
        WHERE i.org_id=${ORG} AND i.sku='LOAN-01' AND l.org_id=${ORG} LIMIT 1`);
    }
  });

  // ── A. REPLENISH PARAMS: safety stock + ROP + EOQ ──
  console.log('\n— A. Tham số bổ hàng động (safety stock / ROP / EOQ) —');
  const rp = await runFull(ORG, 'kho.replenish.params_set', {
    sku: 'DEU-01', service_level: '0.95', lead_time_days: 7,
    order_cost: '100000', holding_cost_pct: '0.20',
  });
  const rpd = rp.data as { reorder_point: string; safety_stock: string; eoq: string; avg_daily_demand: string };
  // 100 xuất / 90 ngày cửa sổ = 1.111/ngày; ROP = 1.111×7 + z×0×√7 = 7.778
  eqNum('avg_daily = 100/90 ≈ 1.1111', rpd.avg_daily_demand, 1.1111, 0.001);
  eqNum('ROP = 1.111×7 ≈ 7.778 (SS=0 vì bán đều tuyệt đối)', rpd.reorder_point, 7.778, 0.01);
  eqNum('safety_stock = 0 (stddev=0)', rpd.safety_stock, 0);
  // EOQ = sqrt(2×(1.111×365)×100000 / (10000×0.20)) = sqrt(405.55×100000/2000) ≈ 201.38
  eqNum('EOQ ≈ 201.38 đúng công thức', rpd.eoq, 201.383, 0.01);
  check('message tiếng Việt có điểm đặt lại', rp.message.includes('điểm đặt lại'));

  // LOAN-01: stddev lớn → safety stock phải > 0
  const rp2 = await runFull(ORG, 'kho.replenish.params_set', {
    sku: 'LOAN-01', service_level: '0.95', lead_time_days: 7,
  });
  const rp2d = rp2.data as { safety_stock: string };
  check('hàng thất thường: safety_stock > 0', Number.parseFloat(rp2d.safety_stock) > 0, rp2d.safety_stock);

  // ── B. FORECAST MA + SES ──
  console.log('\n— B. Forecast MA + SES —');
  const fMa = await runFull(ORG, 'kho.automation.run', { forecast_method: 'moving_avg' });
  const fMaD = fMa.data as { forecast_items: number; demand_stats_items: number };
  check('automation.run: demand stats >= 2 items', fMaD.demand_stats_items >= 2, String(fMaD.demand_stats_items));
  check('automation.run: forecast >= 2 items', fMaD.forecast_items >= 2, String(fMaD.forecast_items));
  const fSes = await runFull(ORG, 'kho.automation.run', { forecast_method: 'ses' });
  check('SES chạy sạch (WITH RECURSIVE)', (fSes.data as { forecast_items: number }).forecast_items >= 2);

  // ── C. PROJECTED INVENTORY ──
  console.log('\n— C. Chiếu tồn tương lai —');
  const pi = await run(ORG, 'kho.forecast.projected', {}) as Array<Record<string, unknown>>;
  check('projected: có items với daily_rate > 0', pi.length >= 2, String(pi.length));
  const deu = pi.find(r => r.sku === 'DEU-01');
  check('DEU-01 có days_to_stockout hữu hạn', Number(deu?.days_to_stockout) < 9999, String(deu?.days_to_stockout));
  check('DEU-01 risk được phân loại', ['high','medium','low'].includes(String(deu?.risk)));

  // ── E. ABC-XYZ ──
  console.log('\n— D. ABC-XYZ matrix (trên lịch sử nguyên bản, TRƯỚC cú xuất lớn) —');
  await runFull(ORG, 'kho.abc.run', {});
  const xyz = await runFull(ORG, 'kho.xyz.run', {});
  const xyzD = xyz.data as { matrix: Record<string, number>; items: Array<{ sku: string; xyz_class: string; strategy: string }> };
  const deuX = xyzD.items.find(i => i.sku === 'DEU-01');
  const loanX = xyzD.items.find(i => i.sku === 'LOAN-01');
  check('hàng bán đều → X (cv thấp)', deuX?.xyz_class === 'X', deuX?.xyz_class);
  check('hàng thất thường → Z (cv cao)', loanX?.xyz_class === 'Z', loanX?.xyz_class);
  check('mỗi item có strategy gợi ý', xyzD.items.every(i => i.strategy.length > 5));
  check('message có ma trận', xyz.message.includes('Ma trận'));

  // ── D. SMART REPLENISH: chưa dưới ROP thì không gợi ý; xuất mạnh → xuất hiện ──
  console.log('\n— E. Smart replenish theo ROP động —');
  const sr0 = await run(ORG, 'kho.replenish.suggest', {}) as unknown[];
  check('tồn 400 >> ROP 7.8 → chưa cần bổ', sr0.length === 0, String(sr0.length));
  // Lưu ý: 20 movements backdate là INSERT thô (tạo lịch sử demand, KHÔNG trừ level)
  // → tồn thật vẫn 500. Xuất 495 để còn 5 < ROP 7.778
  await run(ORG, 'kho.stock.issue', { sku: 'DEU-01', quantity: '495' });
  const sr1 = await run(ORG, 'kho.replenish.suggest', {}) as Array<Record<string, unknown>>;
  check('tồn 5 < ROP 7.78 → có gợi ý bổ', sr1.some(r => r.sku === 'DEU-01'));
  const deuSug = sr1.find(r => r.sku === 'DEU-01')!;
  check('  gợi ý theo EOQ (order_basis)', deuSug.order_basis === 'EOQ', String(deuSug.order_basis));
  eqNum('  suggest = EOQ ≈ 201.38', deuSug.suggest_order, 201.383, 0.01);

  // ── F. DEAD STOCK ──
  console.log('\n— F. Dead stock —');
  const dead = await run(ORG, 'kho.analytics.dead_stock', { idle_days: 30 }) as Array<Record<string, unknown>>;
  check('CHET-01 bị bắt (không xuất bao giờ)', dead.some(r => r.sku === 'CHET-01'));
  const chet = dead.find(r => r.sku === 'CHET-01')!;
  eqNum('  vốn đọng = 100 × 99000 = 9.9tr', chet.tied_value, 9900000, 1);
  check('  DEU-01 KHÔNG bị bắt (vừa xuất)', !dead.some(r => r.sku === 'DEU-01'));

  // ── G. AUTOMATION LOG + EVENT ──
  console.log('\n— G. Automation log + events —');
  const logs = await withTenant(ORG, (ctx) =>
    ctx.db.execute(sql`SELECT task, items_touched, findings FROM kho_automation_runs WHERE org_id=${ORG}`));
  const logRows = (('rows' in logs ? (logs as unknown as { rows: unknown[] }).rows : logs) as Array<Record<string, unknown>>);
  check('kho_automation_runs có log (minh bạch)', logRows.length >= 2, String(logRows.length));
  check('event kho.automation.ran phát', events.some(e => e.name === 'kho.automation.ran'));
  check('event kho.replenish.params_set phát', events.some(e => e.name === 'kho.replenish.params_set'));
  check('mọi event mang org_id', events.every(e => typeof e.payload.org_id === 'string'));

  // ── H. RLS BẢNG AUTOMATION ──
  console.log('\n— H. RLS cross-tenant bảng automation —');
  for (const tbl of ['kho_demand_stats', 'kho_forecasts', 'kho_replenish_params', 'kho_automation_runs']) {
    const leak = await withTenant(ORG_B, (ctx) =>
      ctx.db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${tbl}`)));
    const n = ((('rows' in leak ? (leak as unknown as { rows: Array<{ n: number }> }).rows : leak) as Array<{ n: number }>)[0]).n;
    check(`org B không thấy ${tbl} của org A`, n === 0, String(n));
  }

  // ── I. METADATA ──
  console.log('\n— I. Metadata tools v2.1 —');
  check('13 read tools', khoReadTools.length === 13, String(khoReadTools.length));
  check('16 write actions', khoWriteActions.length === 16, String(khoWriteActions.length));
  check('automation actions không sensitive (chỉ tính toán)',
    ['kho.replenish.params_set','kho.xyz.run','kho.automation.run']
      .every(n => getKhoTool(n)?.sensitive === false));

  console.log(`\n════════ SOUL-INVENTORY v2.1: ${passed} pass / ${failed} fail ════════`);
  await client.close();
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
