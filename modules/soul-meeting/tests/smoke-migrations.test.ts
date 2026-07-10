/**
 * SOUL-MEETING 1A — SMOKE MIGRATIONS (Beat 0)
 * PGlite: migrations sạch · drizzle schema khớp SQL · RLS org isolation thật ·
 * recurrence engine deterministic (daily/weekly/monthly, until/count, +07:00).
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql, eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { smSettings, smMeetings, smMeetingTypes } from '../src/db/schema.js';
import { occurrencesBetween, describeRule, validateRule } from '../src/services/recurrence.js';

const __dir = dirname(fileURLToPath(import.meta.url));
let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
const iso = (d: Date) => d.toISOString();

async function main() {
  console.log('— SOUL-MEETING SMOKE MIGRATIONS (Beat 0) —');
  const client = new PGlite();
  const db = drizzle(client);

  for (const f of ['0000_init.sql', '0001_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }
  check('0. migrations 0000+0001 chạy sạch', true);

  const { rows: cnt } = await client.query<{ n: string }>(
    `SELECT count(*)::text n FROM information_schema.tables WHERE table_name LIKE 'sm\\_%'`,
  );
  check('1. đủ 20 bảng smeet_*', cnt[0]?.n === '20', `(có ${cnt[0]?.n})`);

  const { rows: rls } = await client.query<{ n: string }>(
    `SELECT count(*)::text n FROM pg_tables WHERE tablename LIKE 'sm\\_%' AND rowsecurity`,
  );
  check('2. RLS bật trên cả 20 bảng', rls[0]?.n === '20', `(có ${rls[0]?.n})`);

  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);
  const ORG_A = randomUUID(); const ORG_B = randomUUID();

  async function asTenant<T>(orgId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      return fn(tx as unknown as typeof db);
    });
  }

  // 3. Drizzle insert/select khớp schema
  await asTenant(ORG_A, async (tx) => {
    await tx.insert(smSettings).values({ orgId: ORG_A, hourlyCost: '150000', createdBy: 'user-from' });
    await tx.insert(smMeetingTypes).values({ orgId: ORG_A, name: 'Giao ban tuần', template: { agenda: [{ title: 'Điểm tin', timebox_minutes: 10 }] } });
    await tx.insert(smMeetings).values({
      orgId: ORG_A, title: 'Họp thử', startAt: new Date('2026-07-13T01:00:00Z'), endAt: new Date('2026-07-13T02:00:00Z'), createdBy: 'user-from',
    });
  });
  const rowsA = await asTenant(ORG_A, (tx) => tx.select().from(smMeetings));
  check('3. drizzle insert/select khớp', rowsA.length === 1 && rowsA[0]!.title === 'Họp thử');

  // 4. RLS: ORG_B không thấy dữ liệu ORG_A
  const rowsB = await asTenant(ORG_B, (tx) => tx.select().from(smMeetings));
  check('4. RLS org isolation: B không thấy của A', rowsB.length === 0, `(thấy ${rowsB.length})`);

  // 5. RLS WITH CHECK: B không chèn được dữ liệu giả org A
  let blocked = false;
  try {
    await asTenant(ORG_B, (tx) => tx.insert(smMeetings).values({
      orgId: ORG_A, title: 'hack', startAt: new Date(), endAt: new Date(Date.now() + 3_600_000),
    }));
  } catch { blocked = true; }
  check('5. RLS WITH CHECK chặn chèn chéo org', blocked);

  // 6. CHECK constraint end_at > start_at
  let timeBlocked = false;
  try {
    await asTenant(ORG_A, (tx) => tx.insert(smMeetings).values({
      orgId: ORG_A, title: 'ngược giờ', startAt: new Date('2026-07-13T02:00:00Z'), endAt: new Date('2026-07-13T01:00:00Z'),
    }));
  } catch { timeBlocked = true; }
  check('6. CHECK end_at > start_at hoạt động', timeBlocked);

  // ── RECURRENCE ENGINE ──────────────────────────────────────────
  console.log('\n— RECURRENCE (+07:00, không DST) —');
  // anchor: Thứ 2 13/07/2026 08:00 VN = 01:00Z
  const anchor = new Date('2026-07-13T01:00:00Z');

  // 7. weekly MO,WE ×5 occurrence đầu
  const w = occurrencesBetween(anchor, { freq: 'weekly', interval: 1, byDays: ['MO', 'WE'], maxCount: 5 },
    new Date('2026-07-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'));
  check('7. weekly MO,WE count=5 → đúng 5 mốc', w.length === 5, `(${w.length})`);
  check('8. mốc #0 = anchor', iso(w[0]!) === '2026-07-13T01:00:00.000Z', iso(w[0]!));
  check('9. mốc #1 = Thứ 4 15/07 08:00 VN', iso(w[1]!) === '2026-07-15T01:00:00.000Z', iso(w[1]!));
  check('10. mốc #4 = Thứ 2 27/07', iso(w[4]!) === '2026-07-27T01:00:00.000Z', iso(w[4]!));

  // 11. weekly interval=2 (cách tuần)
  const w2 = occurrencesBetween(anchor, { freq: 'weekly', interval: 2, byDays: ['MO'] },
    anchor, new Date('2026-08-15T00:00:00Z'));
  check('11. weekly interval=2: 13/07, 27/07, 10/08', 
    w2.length === 3 && iso(w2[1]!).startsWith('2026-07-27') && iso(w2[2]!).startsWith('2026-08-10'), `(${w2.map(iso).join(', ')})`);

  // 12. daily until
  const d1 = occurrencesBetween(anchor, { freq: 'daily', interval: 1, untilDate: '2026-07-16' },
    anchor, new Date('2026-08-01T00:00:00Z'));
  check('12. daily until 16/07 → 4 mốc (13..16)', d1.length === 4, `(${d1.length})`);

  // 13. monthly ngày 28
  const m1 = occurrencesBetween(new Date('2026-07-28T02:30:00Z'), { freq: 'monthly', interval: 1, byMonthday: 28, maxCount: 3 },
    new Date('2026-07-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'));
  check('13. monthly d28 ×3: 28/07, 28/08, 28/09', 
    m1.length === 3 && iso(m1[2]!).startsWith('2026-09-28'), `(${m1.map(iso).join(', ')})`);

  // 14. edge nửa đêm VN: 00:30 VN = 17:30Z hôm trước — thứ phải tính theo VN
  // Thứ 3 14/07/2026 00:30 VN = 13/07 17:30Z (UTC vẫn là Thứ 2) → byDays TU phải khớp anchor
  const mid = occurrencesBetween(new Date('2026-07-13T17:30:00Z'), { freq: 'weekly', interval: 1, byDays: ['TU'], maxCount: 2 },
    new Date('2026-07-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z'));
  check('14. edge nửa đêm: thứ theo giờ VN, anchor TU 00:30 khớp', 
    mid.length === 2 && iso(mid[0]!) === '2026-07-13T17:30:00.000Z' && iso(mid[1]!) === '2026-07-20T17:30:00.000Z', `(${mid.map(iso).join(', ')})`);

  // 15. validate + describe
  check('15. validateRule chặn byMonthday=31', validateRule({ freq: 'monthly', interval: 1, byMonthday: 31 }) !== null);
  check('16. describeRule tiếng Việt', describeRule({ freq: 'weekly', interval: 1, byDays: ['MO'], maxCount: 4 }) === 'mỗi tuần vào T2 (4 kỳ)',
    describeRule({ freq: 'weekly', interval: 1, byDays: ['MO'], maxCount: 4 }));

  console.log(`\nKẾT QUẢ: ${passed} pass / ${failed} fail`);
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
