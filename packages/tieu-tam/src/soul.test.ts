// soul.test.ts — V7A P2: TEST SWAP MODEL (chuẩn nghiệm thu #1) + memory store + energy/mood + beta mode.
// Chạy: tsx src/soul.test.ts (PGlite in-memory, không cần Postgres thật)
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { orgs, users, ttMemories, schema } from '@citadel/db';
import { eq } from 'drizzle-orm';
import { remember, recall, getProfile, extractFacts, learnFromMessage } from './memory.js';
import { buildWorkProfile } from './assembler.js';
import { getEngine, ENGINE_NAMES, type EngineMessage } from './adapters.js';
import { TIEU_TAM_PERSONA } from './persona.js';
import {
  getSoulState, tickEnergy, feedEnergy, rechargeFull, setEngine, statusOf, isBetaMode, STATUS_MESSAGE,
} from './energy.js';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }

const client = new PGlite();
const mig = (f: string) => readFileSync(new URL(`../../db/migrations/${f}`, import.meta.url), 'utf8')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, '');
await client.exec(mig('0001_init.sql'));
await client.exec(mig('0002_org_modules.sql'));
await client.exec(mig('0003_super_admin.sql'));
await client.exec(mig('0004_v7a_p1.sql'));
await client.exec(mig('0005_v7a_p2.sql'));
const db = drizzle(client, { schema }) as any;

const [orgA] = await db.insert(orgs).values({ name: 'Quán A', slug: 'quan-a' }).returning();
const [orgB] = await db.insert(orgs).values({ name: 'Quán B', slug: 'quan-b' }).returning();
const [an] = await db.insert(users).values({ orgId: orgA.id, displayName: 'An', role: 'owner' }).returning();
const [binh] = await db.insert(users).values({ orgId: orgB.id, displayName: 'Bình', role: 'owner' }).returning();

// ══ 1) Memory store: remember / recall / tenant isolation ══
console.log('── Memory store ──');
await remember(db, orgA.id, an.id, 'person', 'Người dùng tên là Khoa');
await remember(db, orgA.id, an.id, 'topic', 'Dự án Citadel tới bước Phase 2', 0.8);
await remember(db, orgA.id, an.id, 'preference', 'Người dùng thích cà phê sữa đá');
await remember(db, orgB.id, binh.id, 'fact', 'Quán B bán phở');
const hits = await recall(db, orgA.id, an.id, 'Citadel');
assert(hits.length === 1 && hits[0].content.includes('Phase 2'), 'recall ILIKE tìm đúng fact theo query');
const allA = await recall(db, orgA.id, an.id);
assert(allA.length === 3 && allA.every((m) => m.orgId === orgA.id), 'recall org A: 3 mảnh, KHÔNG lộ trí nhớ org B');
const allB = await recall(db, orgB.id, binh.id);
assert(allB.length === 1 && allB[0].content === 'Quán B bán phở', 'tenant isolation: org B chỉ thấy của mình');
// dedupe: remember trùng không nhân bản
await remember(db, orgA.id, an.id, 'person', 'Người dùng tên là Khoa');
const afterDup = await db.select().from(ttMemories).where(eq(ttMemories.orgId, orgA.id));
assert(afterDup.length === 3, 'remember trùng → dedupe, không nhân bản');
const profile = await getProfile(db, orgA.id, an.id);
assert(profile.total === 3 && profile.byKind['person']?.length === 1, 'getProfile tóm tắt đúng theo kind');

// ══ 2) Học chảy ngược về hồn: extract facts ══
console.log('── Learn from message ──');
const f1 = extractFacts('Chào em, tôi tên là Nấng, đang làm dự án InsideBlock nhé');
assert(f1.some((f) => f.kind === 'person' && f.content.includes('Nấng')), 'extract tên user');
assert(f1.some((f) => f.kind === 'topic' && f.content.includes('InsideBlock')), 'extract dự án');
assert(extractFacts('doanh thu hôm nay bao nhiêu').length === 0, 'câu thường → không extract gì');
await learnFromMessage(db, orgA.id, an.id, 'tôi thích trà đào cam sả');
const prefs = await recall(db, orgA.id, an.id, 'trà đào');
assert(prefs.length === 1 && prefs[0].kind === 'preference', 'learnFromMessage ghi preference vào store');

// ══ 3) TEST SWAP MODEL (chuẩn nghiệm thu #1) ══
console.log('── SWAP TEST: đổi động cơ, hồn giữ nguyên ──');
// remember facts qua flow bình thường (engine stub-a đang active mặc định)
const soul0 = await getSoulState(db, orgA.id, an.id);
assert(soul0.engine === 'stub-a', 'engine mặc định stub-a');
await learnFromMessage(db, orgA.id, an.id, 'tôi tên là Khoa nhé em');
await remember(db, orgA.id, an.id, 'topic', 'Dự án Citadel tới bước Phase 2', 0.8); // idempotent

const QUESTIONS = ['Em còn nhớ tôi tên gì không?', 'Dự án Citadel đang tới bước nào rồi?'];
const EXPECT = [/Khoa/, /Phase 2/];

async function askAll(engineName: string): Promise<string[]> {
  const engine = getEngine(engineName);
  const answers: string[] = [];
  for (const q of QUESTIONS) {
    const wp = await buildWorkProfile(db, orgA.id, an.id, { query: undefined });
    const msgs: EngineMessage[] = [{ role: 'user', content: q }];
    const reply = await engine.complete(wp, msgs);
    answers.push(reply.text);
  }
  return answers;
}

// hỏi qua engine A
const answersA = await askAll('stub-a');
assert(EXPECT[0].test(answersA[0]), `engine stub-a nhớ tên: "${answersA[0].slice(0, 60)}…"`);
assert(EXPECT[1].test(answersA[1]), `engine stub-a nhớ dự án: "${answersA[1].slice(0, 60)}…"`);

// GẠT CÔNG TẮC → stub-b
const swapped = await setEngine(db, orgA.id, an.id, 'stub-b');
assert(swapped.engine === 'stub-b', 'setEngine: gạt công tắc sang stub-b');
const soulAfter = await getSoulState(db, orgA.id, an.id);
assert(soulAfter.engine === 'stub-b', 'engine persist trong tt_soul_state');

// hỏi lại CÙNG bộ câu qua engine B
const answersB = await askAll('stub-b');
assert(EXPECT[0].test(answersB[0]), `engine stub-b vẫn nhớ tên: "${answersB[0].slice(0, 60)}…"`);
assert(EXPECT[1].test(answersB[1]), `engine stub-b vẫn nhớ dự án: "${answersB[1].slice(0, 60)}…"`);

// facts NHẤT QUÁN giữa 2 engine (cùng trí nhớ nguyên văn)
for (let i = 0; i < QUESTIONS.length; i++) {
  const factA = EXPECT[i].exec(answersA[i])?.[0];
  const factB = EXPECT[i].exec(answersB[i])?.[0];
  assert(!!factA && factA === factB, `fact "${factA}" NHẤT QUÁN tuyệt đối giữa stub-a và stub-b`);
}

// persona không đổi: cả 2 engine cùng xưng "em" (persona.selfRef), cùng nhân cách
const wpA = await buildWorkProfile(db, orgA.id, an.id);
assert(wpA.persona === TIEU_TAM_PERSONA, 'WorkProfile luôn mang CÙNG persona object (hồn không đổi)');
assert(answersA[0].includes('em') && answersB[0].includes('em'), 'persona giữ nguyên: cả 2 engine xưng "em"');

// trí nhớ không bị engine ghi đè format riêng — vẫn text thuần trong DB
const rawMems = await db.select().from(ttMemories).where(eq(ttMemories.orgId, orgA.id));
assert(rawMems.every((m: any) => typeof m.content === 'string' && !m.content.startsWith('{')), 'trí nhớ vẫn text thuần — không format provider nào');

// engine không hợp lệ → reject
let badEngine = false; try { getEngine('gpt-100'); } catch { badEngine = true; }
assert(badEngine, 'getEngine tên lạ → throw (validate)');
assert(ENGINE_NAMES.includes('openai') && ENGINE_NAMES.includes('anthropic'), 'registry có openai + anthropic (key từ env)');

// ══ 4) Energy/mood — BETA_MODE=false (enforce thật) ══
console.log('── Energy (BETA_MODE=false — enforce) ──');
process.env.BETA_MODE = 'false';
assert(!isBetaMode(), 'BETA_MODE=false nhận diện đúng');
const [chi] = await db.insert(users).values({ orgId: orgA.id, displayName: 'Chi', role: 'staff' }).returning();
let s = await getSoulState(db, orgA.id, chi.id);
assert(s.energy === 100 && s.status === 'tran_day', 'khởi tạo: energy 100, Tràn đầy');
let t = await tickEnergy(db, orgA.id, chi.id, 'light');
assert(t.state.energy === 98 && !t.refused, 'lượt nhẹ trừ 2 → 98');
t = await tickEnergy(db, orgA.id, chi.id, 'heavy');
assert(t.state.energy === 93, 'lượt nặng trừ 5 → 93');
// kéo xuống Mệt (10-30)
for (let i = 0; i < 13; i++) t = await tickEnergy(db, orgA.id, chi.id, 'heavy');
assert(t.state.energy === 28 && t.state.status === 'met', `28 → trạng thái Mệt`);
assert(!!t.note && t.note.includes('nghỉ'), 'Mệt → gợi ý nhẹ nhàng sắp cần nghỉ');
// kéo xuống Kiệt sức (<10)
for (let i = 0; i < 4; i++) t = await tickEnergy(db, orgA.id, chi.id, 'heavy');
assert(t.state.energy === 8 && t.state.status === 'kiet_suc', '8 → Kiệt sức');
// kiệt sức: từ chối việc nặng, message dễ thương
t = await tickEnergy(db, orgA.id, chi.id, 'heavy');
assert(t.refused && !!t.note && /em mệt rồi/i.test(t.note), 'kiệt sức + việc nặng → TỪ CHỐI, message tiếng Việt dễ thương');
assert(t.state.energy === 8, 'từ chối → không trừ thêm energy');
// vẫn trò chuyện nhẹ được
t = await tickEnergy(db, orgA.id, chi.id, 'light');
assert(!t.refused && t.state.energy === 6, 'kiệt sức vẫn trò chuyện nhẹ (trừ 2)');
// cho ăn hồi năng lượng (hook P3)
const fed = await feedEnergy(db, orgA.id, chi.id, 30);
assert(fed.energy === 36 && fed.status === 'on_dinh', 'feedEnergy +30 → 36, Ổn định');
// nạp gói hồi đầy (hook P3)
const full = await rechargeFull(db, orgA.id, chi.id);
assert(full.energy === 100 && full.status === 'tran_day' && full.mood === 'vui', 'rechargeFull → 100, Tràn đầy, mood vui');
// statusOf biên
assert(statusOf(71) === 'tran_day' && statusOf(70) === 'on_dinh' && statusOf(30) === 'on_dinh' && statusOf(29.9) === 'met' && statusOf(10) === 'met' && statusOf(9.9) === 'kiet_suc', '4 ngưỡng trạng thái đúng biên');

// ══ 5) Energy — BETA_MODE=true (default): không bao giờ cạn ══
console.log('── Energy (BETA_MODE=true — không cạn) ──');
process.env.BETA_MODE = 'true';
assert(isBetaMode(), 'BETA_MODE=true');
const [dung] = await db.insert(users).values({ orgId: orgA.id, displayName: 'Dũng', role: 'staff' }).returning();
for (let i = 0; i < 30; i++) await tickEnergy(db, orgA.id, dung.id, 'heavy');
const sBeta = await getSoulState(db, orgA.id, dung.id);
assert(sBeta.energy === 100 && sBeta.status === 'tran_day', 'beta: 30 lượt nặng vẫn 100 — không bao giờ cạn');
const tBeta = await tickEnergy(db, orgA.id, dung.id, 'heavy');
assert(!tBeta.refused, 'beta: không bao giờ từ chối việc nặng');
delete process.env.BETA_MODE;
assert(isBetaMode(), 'BETA_MODE unset → default true');

// ══ 6) Context Assembler — một cổng duy nhất ══
console.log('── Context Assembler ──');
const wp = await buildWorkProfile(db, orgA.id, an.id);
assert(wp.persona.name === 'Tiểu Tâm' && Array.isArray(wp.memories) && wp.memories.length >= 3, 'buildWorkProfile: persona + memories');
assert(typeof wp.mood === 'string' && typeof wp.energy === 'number' && Array.isArray(wp.moduleMap), 'buildWorkProfile: mood/energy/moduleMap trung lập');
assert(wp.engine === 'stub-b', 'buildWorkProfile mang engine hiện tại (sau swap)');

console.log('[tieu-tam/soul] PASSED — swap test nhất quán, energy/mood đúng đặc tả');
