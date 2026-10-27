/**
 * SOUL-WALLET 1A — SMOKE BRIDGE (Beat 10)
 * Chứng minh mặt cắt Tiểu Tâm + HTTP:
 *   1. Đủ 25 defs (12 tool + 13 action), security flags đúng khai báo
 *   2. Golden path chạy HOÀN TOÀN qua getSwTool().handler (Zod biên thật)
 *   3. Input rác → ZodError chặn tại biên
 *   4. soulWalletTieuTamActions(): shape host, execute chạy thật, audit hook gọi
 *   5. createSoulWalletRoutes: đăng ký đủ route, 1 request giả lập end-to-end
 *   6. Mọi intent trỏ tới tool có thật
 *   7. runSoulWalletScheduledAll quét đúng chủ ví
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { EventBus, SwCtx, SwEventPayload } from '../src/types.js';
import { isoDay } from '../src/types.js';
import { swTools, swReadTools, swWriteActions, getSwTool } from '../src/tools/index.js';
import { swIntents } from '../src/intents.js';
import { seedDefaultCategories } from '../src/services/catalog.service.js';
import { createSoulWalletRoutes, type MinimalContext } from '../src/routes.js';
import { soulWalletTieuTamActions } from '../server/tieu-tam-actions.js';
import { runSoulWalletScheduledAll } from '../server/host-adapter.js';

const __dir = dirname(fileURLToPath(import.meta.url));
let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, String(actual) === String(expected), `(actual=${actual}, expected=${expected})`);
}

const events: Array<{ name: string; payload: SwEventPayload }> = [];
const bus: EventBus = { emit: (n, p) => { events.push({ name: n, payload: p }); } };

async function main() {
  console.log('— SOUL-WALLET SMOKE BRIDGE —');
  const client = new PGlite();
  const db = drizzle(client);
  for (const f of ['0000_init.sql', '0001_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }
  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);
  const ORG = randomUUID(); const USER = 'user-from';
  async function t<T>(fn: (ctx: SwCtx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${ORG}, true)`);
      return fn({ db: tx as unknown as SwCtx['db'], orgId: ORG, ownerId: USER, bus });
    });
  }
  async function runTool(name: string, input: unknown) {
    const tool = getSwTool(name);
    if (!tool) throw new Error(`Tool không tồn tại: ${name}`);
    return t((ctx) => tool.handler(ctx, input));
  }

  // ============================================================
  console.log('\n— A. HÌNH THÙ 25 DEFS —');
  // ============================================================
  eq('1. tổng 25 tool defs', swTools.length, 25);
  eq('2. 12 read tools', swReadTools.length, 12);
  eq('3. 13 write actions', swWriteActions.length, 13);
  check('4. read tools: kind=tool, lv1, không sensitive',
    swReadTools.every((x) => x.kind === 'tool' && x.securityLevel === 1 && !x.sensitive));
  check('5. actions đụng tiền: lv2 + sensitive (trừ rule.upsert lv1)',
    swWriteActions.every((x) => x.name === 'sw.rule.upsert'
      ? (x.securityLevel === 1 && !x.sensitive)
      : (x.securityLevel === 2 && x.sensitive)));
  check('6. mọi permission có prefix sw.', swTools.every((x) => x.permission.startsWith('sw.')));
  check('7. tên tool không trùng', new Set(swTools.map((x) => x.name)).size === 25);

  // ============================================================
  console.log('\n— B. GOLDEN PATH QUA HANDLER (Zod biên thật) —');
  // ============================================================
  await t((c) => seedDefaultCategories(c));
  const acc = await runTool('sw.account.create',
    { name: 'Tiền mặt', type: 'cash', opening_balance: '5000000' }) as { ok: boolean; data: { id: string }; message: string };
  check('8. account.create trả {ok, message VN, data}', acc.ok && acc.message.includes('Tiền mặt'));
  const accId = acc.data.id;

  const tx1 = await runTool('sw.tx.create', {
    kind: 'expense', occurred_at: '2026-07-06T09:00:00Z', account_id: accId,
    amount: '320000', memo: 'Cafe tiếp khách',
  }) as { ok: boolean; data: { docNo: string }; message: string };
  eq('9. tx.create doc_no tuần tự #1', tx1.data.docNo, 'SW-TX-2026-000001');
  check('10. message có số tiền định dạng VN', tx1.message.includes('320.000'));

  const tx2 = await runTool('sw.tx.create', {
    kind: 'income', occurred_at: '2026-07-06T10:00:00Z', account_id: accId,
    amount: '15000000', memo: 'Ứng dự án',
  }) as { data: { docNo: string } };
  eq('11. doc_no tuần tự #2', tx2.data.docNo, 'SW-TX-2026-000002');

  const jars = await runTool('sw.budget.upsert', { six_jars_income: '20000000' }) as { ok: boolean; data: { jars: unknown[] } };
  eq('12. budget.upsert nhánh 6 hũ', jars.data.jars.length, 6);

  const goal = await runTool('sw.goal.create', { name: 'Quỹ dự phòng', target: '50000000' }) as { data: { id: string } };
  const contrib = await runTool('sw.goal.contribute',
    { goal_id: goal.data.id, amount: '10000000', from_account_id: accId }) as { ok: boolean; message: string };
  check('13. goal.contribute qua handler', contrib.ok && contrib.message.includes('10.000.000'));

  const debt = await runTool('sw.debt.create', {
    contact_name: 'Anh B', direction: 'receivable', principal: '5000000',
    interest_rate: 0, start_date: isoDay(new Date()),
  }) as { data: { id: string } };
  const pay = await runTool('sw.debt.pay',
    { debt_id: debt.data.id, amount: '5000000', paid_at: isoDay(new Date()) }) as { message: string };
  check('14. debt.pay tất toán qua handler', pay.message.includes('TẤT TOÁN'));

  const found = await runTool('sw.tx.search', { kind: 'expense', limit: 50 }) as unknown[];
  check('15. tx.search thấy các khoản chi', Array.isArray(found) && found.length >= 2);
  const summary = await runTool('sw.summary', {}) as { liquid: string };
  check('16. sw.summary trả liquid', typeof summary.liquid === 'string');
  const narr = await runTool('sw.report.narrate', {}) as { text: string };
  check('17. narrate có emoji 📊 + tiếng Việt', narr.text.startsWith('📊'));

  // Zod biên chặn rác
  let zodCaught = false;
  try { await runTool('sw.tx.create', { kind: 'expense', amount: 'ba trăm k' }); }
  catch (e) { zodCaught = e instanceof ZodError || (e as Error).name === 'SwError'; }
  check('18. input rác bị chặn tại biên', zodCaught);
  let zodCaught2 = false;
  try { await runTool('sw.debt.create', { direction: 'nợ xấu', principal: '1' }); }
  catch (e) { zodCaught2 = e instanceof ZodError; }
  check('19. enum sai → ZodError', zodCaught2);

  // ============================================================
  console.log('\n— C. TIEU-TAM ACTIONS ADAPTER —');
  // ============================================================
  const defs = soulWalletTieuTamActions();
  eq('20. adapter sinh 13 action defs', defs.length, 13);
  check('21. đủ field host: requiredModule/permission/securityLevel/sensitive/parameters/execute',
    defs.every((d: any) => d.requiredModule === 'soul-wallet' && typeof d.permission === 'string'
      && [1, 2].includes(d.securityLevel) && typeof d.sensitive === 'boolean'
      && d.parameters?.type === 'object' && typeof d.execute === 'function'));
  let audited = 0;
  const hostCtx = { db, orgId: ORG, userId: USER, audit: async () => { audited++; } };
  const txDef = defs.find((d: any) => d.name === 'sw.tx.create');
  const execRes = await txDef.execute(hostCtx, {
    kind: 'expense', occurred_at: '2026-07-06T11:00:00Z', account_id: accId,
    amount: '99000', memo: 'qua host adapter',
  });
  check('22. execute qua adapter trả {ok, module, message}',
    execRes.ok === true && execRes.module === 'soul-wallet' && String(execRes.message).includes('99.000'));
  eq('23. audit hook của host được gọi', audited, 1);

  // ============================================================
  console.log('\n— D. ROUTES FACTORY —');
  // ============================================================
  const registered: Array<{ m: string; p: string; h: (c: MinimalContext) => Promise<Response> }> = [];
  createSoulWalletRoutes({
    post: (p, h) => registered.push({ m: 'post', p, h }),
    get: (p, h) => registered.push({ m: 'get', p, h }),
  });
  check('24. đăng ký ≥ 45 route', registered.length >= 45, `(=${registered.length})`);
  check('25. mọi path prefix /wallet', registered.every((r) => r.p.startsWith('/wallet')));
  // gọi thử 1 endpoint end-to-end qua fake context
  const createRoute = registered.find((r) => r.m === 'post' && r.p === '/wallet/accounts')!;
  const res = await t(async (ctx) => {
    const fakeC = {
      req: { json: async () => ({ name: 'VCB', type: 'bank', opening_balance: '1000000' }), query: () => undefined, param: () => '' },
      get: () => ctx,
      json: (data: unknown, status?: number) => ({ data, status: status ?? 200 }) as unknown as Response,
    } as unknown as MinimalContext;
    return createRoute.h(fakeC);
  }) as unknown as { data: { data: { name: string } }; status: number };
  check('26. POST /wallet/accounts end-to-end tạo ví', res.status === 200 && res.data.data.name === 'VCB');
  const badRoute = registered.find((r) => r.m === 'post' && r.p === '/wallet/debts')!;
  const bad = await t(async (ctx) => {
    const fakeC = {
      req: { json: async () => ({ direction: 'xxx' }), query: () => undefined, param: () => '' },
      get: () => ctx,
      json: (data: unknown, status?: number) => ({ data, status: status ?? 200 }) as unknown as Response,
    } as unknown as MinimalContext;
    return badRoute.h(fakeC);
  }) as unknown as { status: number; data: { error: { code: string } } };
  eq('27. route trả 400 INVALID_INPUT khi Zod fail', `${bad.status}:${bad.data.error.code}`, '400:INVALID_INPUT');

  // ============================================================
  console.log('\n— E. INTENTS + SCHEDULED —');
  // ============================================================
  check('28. mọi intent trỏ tool có thật',
    swIntents.every((i) => !!getSwTool(i.tool)), swIntents.filter((i) => !getSwTool(i.tool)).map((i) => i.tool).join(','));
  check('29. ≥ 15 intents có example tiếng Việt',
    swIntents.length >= 15 && swIntents.every((i) => i.examples.length >= 1 && i.patterns_vi.length >= 2));

  const sched = await runSoulWalletScheduledAll(db);
  check('30. scheduled quét đúng 1 chủ ví, chạy ok', sched.length === 1 && sched[0]!.ok, JSON.stringify(sched));

  console.log(`\n═══ SMOKE BRIDGE: ${passed} passed, ${failed} failed ═══`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
