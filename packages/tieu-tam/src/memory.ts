// memory.ts — Memory Store TRUNG LẬP (nguyên tắc 1+2, spec §03).
// Trí nhớ là text thuần trong Postgres — không embedding riêng, không format của provider nào.
// Đổi động cơ → trí nhớ này giữ nguyên, chỉ cần đọc lại qua Context Assembler.
import { ttMemories } from '@citadel/db';
import { and, eq, desc, ilike, sql } from 'drizzle-orm';

export type MemoryKind = 'fact' | 'person' | 'topic' | 'summary' | 'preference';
export const MEMORY_KINDS: MemoryKind[] = ['fact', 'person', 'topic', 'summary', 'preference'];

export interface Memory {
  id: string;
  orgId: string;
  userId: string | null;
  kind: MemoryKind;
  content: string;
  salience: number;
  createdAt: Date;
}

/** Ghi một mảnh trí nhớ. org_id BẮT BUỘC (hiến pháp #1). */
export async function remember(
  db: any,
  orgId: string,
  userId: string | null,
  kind: MemoryKind,
  content: string,
  salience = 0.5,
): Promise<Memory> {
  if (!MEMORY_KINDS.includes(kind)) throw new Error(`kind không hợp lệ: ${kind}`);
  const trimmed = content.trim();
  if (!trimmed) throw new Error('content rỗng');
  // dedupe nhẹ: cùng org+user+kind+content → update salience/updated_at thay vì nhân bản
  const existing = await db.select().from(ttMemories).where(and(
    eq(ttMemories.orgId, orgId),
    userId ? eq(ttMemories.userId, userId) : sql`${ttMemories.userId} IS NULL`,
    eq(ttMemories.kind, kind),
    eq(ttMemories.content, trimmed),
  )).limit(1);
  if (existing.length) {
    const [row] = await db.update(ttMemories)
      .set({ salience: Math.max(existing[0].salience, salience), updatedAt: new Date() })
      .where(eq(ttMemories.id, existing[0].id)).returning();
    return row as Memory;
  }
  const [row] = await db.insert(ttMemories)
    .values({ orgId, userId, kind, content: trimmed, salience })
    .returning();
  return row as Memory;
}

/** Truy hồi trí nhớ — SQL ILIKE là đủ (không cần vector). Luôn filter org (tenant isolation). */
export async function recall(
  db: any,
  orgId: string,
  userId: string | null,
  query?: string,
  limit = 20,
): Promise<Memory[]> {
  const conds = [eq(ttMemories.orgId, orgId)] as any[];
  if (userId) conds.push(sql`(${ttMemories.userId} = ${userId} OR ${ttMemories.userId} IS NULL)`);
  if (query?.trim()) conds.push(ilike(ttMemories.content, `%${query.trim()}%`));
  return await db.select().from(ttMemories)
    .where(and(...conds))
    .orderBy(desc(ttMemories.salience), desc(ttMemories.updatedAt))
    .limit(Math.min(limit, 100)) as Memory[];
}

/** Quên một mảnh trí nhớ (V7A P5 — người dùng chủ động xóa). Luôn ràng org; user chỉ xóa được
 *  trí nhớ của chính mình hoặc trí nhớ cấp org (userId NULL) trong org mình. */
export async function forget(db: any, orgId: string, userId: string | null, id: string): Promise<Memory | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const conds = [eq(ttMemories.id, id), eq(ttMemories.orgId, orgId)] as any[];
  if (userId) conds.push(sql`(${ttMemories.userId} = ${userId} OR ${ttMemories.userId} IS NULL)`);
  const [row] = await db.delete(ttMemories).where(and(...conds)).returning();
  return (row as Memory) ?? null;
}

/** Tóm tắt hồ sơ trí nhớ của một người dùng trong org — cho Context Assembler. */
export async function getProfile(db: any, orgId: string, userId: string | null) {
  const memories = await recall(db, orgId, userId, undefined, 50);
  const byKind: Record<string, string[]> = {};
  for (const m of memories) (byKind[m.kind] ??= []).push(m.content);
  return {
    total: memories.length,
    byKind,
    top: memories.slice(0, 10).map((m) => ({ kind: m.kind, content: m.content, salience: m.salience })),
  };
}

// ─── Học chảy ngược về hồn: extract fact đơn giản từ hội thoại ───
// Heuristic tiếng Việt: tên user ("tôi tên X" / "tôi là X"), dự án/chủ đề đang bàn.
const NAME_RE = /(?:tôi tên(?: là)?|tôi là|mình tên(?: là)?|em tên(?: là)?|tên tôi là)\s+([^\n.,!?;]{1,40})/i;
const PROJECT_RE = /(?:dự án|project)\s+([^\n.,!?;]{1,60})/i;
const LIKE_RE = /(?:tôi thích|mình thích|tôi hay|tôi thường)\s+([^\n.!?;]{1,60})/i;

export interface ExtractedFact { kind: MemoryKind; content: string; salience: number }

/** Trích fact đơn giản từ một câu người dùng — trả về [] nếu không có gì đáng nhớ. */
export function extractFacts(message: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const name = NAME_RE.exec(message)?.[1]?.trim();
  if (name) facts.push({ kind: 'person', content: `Người dùng tên là ${name}`, salience: 0.9 });
  const project = PROJECT_RE.exec(message)?.[1]?.trim();
  if (project) facts.push({ kind: 'topic', content: `Đang quan tâm dự án ${project}`, salience: 0.7 });
  const like = LIKE_RE.exec(message)?.[1]?.trim();
  if (like) facts.push({ kind: 'preference', content: `Người dùng thích ${like}`, salience: 0.6 });
  return facts;
}

/** Học sau mỗi lượt hội thoại: extract → remember. Best-effort, không throw để không gãy chat. */
export async function learnFromMessage(db: any, orgId: string, userId: string | null, message: string): Promise<ExtractedFact[]> {
  try {
    const facts = extractFacts(message);
    for (const f of facts) await remember(db, orgId, userId, f.kind, f.content, f.salience);
    return facts;
  } catch (e) {
    console.error('[tieu-tam/memory] learn failed', (e as Error).message);
    return [];
  }
}
