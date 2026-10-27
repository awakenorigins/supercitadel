/**
 * SOUL-WALLET 1A — SMOKE CORE (Beat 1–3)
 * Chạy trên PGlite (Postgres in-process) + role citadel_app KHÔNG superuser → RLS thật.
 * Chứng minh:
 *   1. Migrations sạch, seed danh mục idempotent
 *   2. Accounts: tạo, số dư derive, đóng ví chặn khi còn tiền
 *   3. Transactions đủ kind: income/expense/transfer/refund/fee + splits + doc_no tuần tự
 *   4. LEDGER INTEGRITY: balance == opening + Σdelta sau mọi thao tác kể cả ĐẢO
 *   5. Đảo bút toán: không DELETE, số dư về đúng, đảo 2 lần bị chặn
 *   6. ORG ISOLATION (RLS tầng DB) + OWNER ISOLATION (app-level)
 *   7. Audit log ghi mọi mutation; event payload luôn mang org_id
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { EventBus, SwCtx, SwEventPayload } from '../src/types.js';
import { SwError, money } from '../src/types.js';
import { seedDefaultCategories, listCategories, upsertContact, upsertTag } from '../src/services/catalog.service.js';
import { createAccount, closeAccount, listAccounts } from '../src/services/account.service.js';
import { createTx, reverseTx, searchTx } from '../src/services/transaction.service.js';
import { accountBalance, ledgerSum, listAudit } from '../src/services/ledger.service.js';

const __dir = dirname(fileURLToPath(import.meta.url));
let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, String(actual) === String(expected), `(actual=${actual}, expected=${expected})`);
}
async function expectErr(name: string, code: string, fn: () => Promise<unknown>) {
  try { await fn(); check(name, false, '(không ném lỗi)'); }
  catch (e) { check(name, e instanceof SwError && e.code === code, `(nhận ${e instanceof SwError ? e.code : e})`); }
}

const events: Array<{ name: string; payload: SwEventPayload }> = [];
const bus: EventBus = { emit: (n, p) => { events.push({ name: n, payload: p }); } };

async function main() {
  console.log('— SOUL-WALLET SMOKE CORE — Postgres in-process —');
  const client = new PGlite();
  const db = drizzle(client);

  for (const f of ['0000_init.sql', '0001_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }
  check('0. migrations chạy sạch', true);

  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);

  const ORG_A = randomUUID();
  const ORG_B = randomUUID();
  const USER_1 = 'user-from';
  const USER_2 = 'user-hai';

  /** Transaction chuẩn tenant: SET ROLE app (RLS thật) + SET LOCAL org */
  async function withTenant<T>(orgId: string, ownerId: string, fn: (ctx: SwCtx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      return fn({ db: tx as unknown as SwCtx['db'], orgId, ownerId, bus });
    });
  }

  // ============================================================
  console.log('\n— A. SEED + CATALOG —');
  // ============================================================
  const seed1 = await withTenant(ORG_A, USER_1, (ctx) => seedDefaultCategories(ctx));
  check('1. seed danh mục VN > 20 mục', seed1.seeded > 20, `(seeded=${seed1.seeded})`);
  const seed2 = await withTenant(ORG_A, USER_1, (ctx) => seedDefaultCategories(ctx));
  eq('2. seed idempotent (lần 2 = 0)', seed2.seeded, 0);
  const cats = await withTenant(ORG_A, USER_1, (ctx) => listCategories(ctx, 'expense'));
  const catServerAI = cats.find((c) => c.name === 'Server & AI');
  check('3. có danh mục con "Server & AI" (parent Công việc & Dự án)', !!catServerAI?.parentId);
  const contact = await withTenant(ORG_A, USER_1, (ctx) => upsertContact(ctx, { name: 'Khách A', kind: 'customer' }));
  check('4. tạo contact Khách A', !!contact.id);
  await withTenant(ORG_A, USER_1, (ctx) => upsertTag(ctx, { name: 'OUM Studio' }));

  // ============================================================
  console.log('\n— B. ACCOUNTS + SỐ DƯ DERIVE —');
  // ============================================================
  const cash = await withTenant(ORG_A, USER_1, (ctx) =>
    createAccount(ctx, { name: 'Tiền mặt', type: 'cash', opening_balance: '5000000' } as never));
  const bank = await withTenant(ORG_A, USER_1, (ctx) =>
    createAccount(ctx, { name: 'VCB', type: 'bank', opening_balance: '20000000' } as never));
  eq('5. số dư ban đầu = opening', await withTenant(ORG_A, USER_1, (c) => accountBalance(c, cash.id)), '5000000');

  // ============================================================
  console.log('\n— C. TRANSACTIONS ĐỦ KIND + DOC_NO —');
  // ============================================================
  const catAn = cats.find((c) => c.name === 'Ăn uống')!;
  const tx1 = await withTenant(ORG_A, USER_1, (ctx) => createTx(ctx, {
    kind: 'expense', occurred_at: '2026-07-01T09:00:00Z', account_id: cash.id,
    category_id: catAn.id, amount: '320000', memo: 'Cafe tiếp khách', status: 'posted',
  } as never));
  check('6. doc_no dạng SW-TX-2026-000001', tx1.docNo === 'SW-TX-2026-000001', `(=${tx1.docNo})`);
  eq('7. expense trừ tiền: 5tr − 320k', await withTenant(ORG_A, USER_1, (c) => accountBalance(c, cash.id)), '4680000');

  await withTenant(ORG_A, USER_1, (ctx) => createTx(ctx, {
    kind: 'income', occurred_at: '2026-07-02T10:00:00Z', account_id: bank.id,
    amount: '15000000', memo: 'Lương tháng 7', status: 'posted',
  } as never));
  eq('8. income cộng tiền: 20tr + 15tr', await withTenant(ORG_A, USER_1, (c) => accountBalance(c, bank.id)), '35000000');

  const tf = await withTenant(ORG_A, USER_1, (ctx) => createTx(ctx, {
    kind: 'transfer', occurred_at: '2026-07-03T08:00:00Z', account_id: bank.id,
    counter_account_id: cash.id, amount: '2000000', memo: 'Rút về ví', status: 'posted',
  } as never));
  eq('9. transfer: bank 35tr − 2tr', await withTenant(ORG_A, USER_1, (c) => accountBalance(c, bank.id)), '33000000');
  eq('10. transfer: cash 4.68tr + 2tr', await withTenant(ORG_A, USER_1, (c) => accountBalance(c, cash.id)), '6680000');
  const tfSum = await withTenant(ORG_A, USER_1, async (c) =>
    money.add(await ledgerSum(c, bank.id), await ledgerSum(c, cash.id)));
  // Σ ledger toàn hệ = tổng biến động ròng (thu − chi), transfer tự triệt tiêu
  eq('11. Σdelta transfer triệt tiêu (net = −320k + 15tr)', tfSum, '14680000');

  await withTenant(ORG_A, USER_1, (ctx) => createTx(ctx, {
    kind: 'fee', occurred_at: '2026-07-03T08:01:00Z', account_id: bank.id,
    amount: '11000', memo: 'Phí chuyển', status: 'posted',
  } as never));
  await withTenant(ORG_A, USER_1, (ctx) => createTx(ctx, {
    kind: 'refund', occurred_at: '2026-07-04T12:00:00Z', account_id: cash.id,
    category_id: catAn.id, amount: '100000', memo: 'Quán hoàn tiền', status: 'posted',
  } as never));
  eq('12. fee trừ: 33tr − 11k', await withTenant(ORG_A, USER_1, (c) => accountBalance(c, bank.id)), '32989000');
  eq('13. refund cộng: 6.68tr + 100k', await withTenant(ORG_A, USER_1, (c) => accountBalance(c, cash.id)), '6780000');

  // splits
  const catXe = cats.find((c) => c.name === 'Di chuyển')!;
  await withTenant(ORG_A, USER_1, (ctx) => createTx(ctx, {
    kind: 'expense', occurred_at: '2026-07-05T09:00:00Z', account_id: cash.id, amount: '500000',
    memo: 'Siêu thị + đổ xăng',
    splits: [
      { category_id: catAn.id, amount: '300000' },
      { category_id: catXe.id, amount: '200000' },
    ],
  } as never));
  await expectErr('14. splits lệch tổng → SPLIT_SUM_MISMATCH', 'SPLIT_SUM_MISMATCH', () =>
    withTenant(ORG_A, USER_1, (ctx) => createTx(ctx, {
      kind: 'expense', occurred_at: '2026-07-05T10:00:00Z', account_id: cash.id, amount: '500000',
      splits: [{ category_id: catAn.id, amount: '999' }],
    } as never)));
  await expectErr('15. transfer cùng ví → TRANSFER_SAME_ACCOUNT', 'TRANSFER_SAME_ACCOUNT', () =>
    withTenant(ORG_A, USER_1, (ctx) => createTx(ctx, {
      kind: 'transfer', occurred_at: '2026-07-05T11:00:00Z', account_id: cash.id,
      counter_account_id: cash.id, amount: '1000',
    } as never)));

  // ============================================================
  console.log('\n— D. ĐẢO BÚT TOÁN (không DELETE) —');
  // ============================================================
  const balBefore = await withTenant(ORG_A, USER_1, (c) => accountBalance(c, cash.id));
  const bigTx = await withTenant(ORG_A, USER_1, (ctx) => createTx(ctx, {
    kind: 'expense', occurred_at: '2026-07-05T14:00:00Z', account_id: cash.id,
    amount: '1000000', memo: 'Nhập nhầm', status: 'posted',
  } as never));
  const rev = await withTenant(ORG_A, USER_1, (ctx) => reverseTx(ctx, bigTx.id, 'gõ nhầm số'));
  check('16. đảo sinh giao dịch mới reversal_of', rev.reversalOf === bigTx.id);
  eq('17. số dư về đúng sau đảo', await withTenant(ORG_A, USER_1, (c) => accountBalance(c, cash.id)), balBefore);
  await expectErr('18. đảo lần 2 → TX_ALREADY_REVERSED', 'TX_ALREADY_REVERSED', () =>
    withTenant(ORG_A, USER_1, (ctx) => reverseTx(ctx, bigTx.id)));
  const found = await withTenant(ORG_A, USER_1, (ctx) => searchTx(ctx, { status: 'reversed', limit: 10 } as never));
  check('19. giao dịch gốc vẫn tồn tại status=reversed (không DELETE)', found.some((t) => t.id === bigTx.id));

  // ============================================================
  console.log('\n— E. ISOLATION: ORG (RLS tầng DB) + OWNER (app-level) —');
  // ============================================================
  const accsB = await withTenant(ORG_B, USER_1, (ctx) => listAccounts(ctx));
  eq('20. ORG_B không thấy ví ORG_A (RLS)', accsB.length, 0);
  await expectErr('21. ORG_B với tay sang account ORG_A → ACCOUNT_NOT_FOUND', 'ACCOUNT_NOT_FOUND', () =>
    withTenant(ORG_B, USER_1, (ctx) => accountBalance(ctx, cash.id)));
  const accsU2 = await withTenant(ORG_A, USER_2, (ctx) => listAccounts(ctx));
  eq('22. USER_2 cùng org không thấy ví USER_1 (owner isolation)', accsU2.length, 0);
  await expectErr('23. USER_2 ghi chi vào ví USER_1 → ACCOUNT_NOT_FOUND', 'ACCOUNT_NOT_FOUND', () =>
    withTenant(ORG_A, USER_2, (ctx) => createTx(ctx, {
      kind: 'expense', occurred_at: '2026-07-05T15:00:00Z', account_id: cash.id, amount: '1',
    } as never)));

  // ============================================================
  console.log('\n— F. ĐÓNG VÍ + AUDIT + EVENTS —');
  // ============================================================
  await expectErr('24. đóng ví còn tiền → ACCOUNT_HAS_BALANCE', 'ACCOUNT_HAS_BALANCE', () =>
    withTenant(ORG_A, USER_1, (ctx) => closeAccount(ctx, { id: cash.id, force: false })));
  const audits = await withTenant(ORG_A, USER_1, (ctx) => listAudit(ctx, 100));
  check('25. audit log ≥ 10 bản ghi mutation', audits.length >= 10, `(=${audits.length})`);
  check('26. mọi event mang org_id', events.length > 0 && events.every((e) => e.payload.org_id === ORG_A));
  check('27. có event sw.transaction.created + sw.transaction.reversed',
    events.some((e) => e.name === 'sw.transaction.created') && events.some((e) => e.name === 'sw.transaction.reversed'));

  console.log(`\n═══ SMOKE CORE: ${passed} passed, ${failed} failed ═══`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
