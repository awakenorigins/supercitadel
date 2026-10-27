/**
 * SOUL-MEETING 1A — harvest.service (text path)
 * Bóc VIỆC + QUYẾT ĐỊNH từ ghi chú thô — heuristic DETERMINISTIC (không LLM,
 * không mạng): checkbox/bullet + từ khóa giao việc, dòng "Quyết định:"/"Chốt:".
 * KHÔNG ghi DB — trả proposal để Tiểu Tâm hiển thị dry-run; user confirm →
 * TT gọi createActionItemsBatch / addDecision. Dedup fuzzy đánh dấu duplicate_of.
 * (Trí khôn ngôn ngữ thật nằm ở tầng Tiểu Tâm/LLM; module bảo đảm baseline
 * chạy được offline + chống trùng.)
 */
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { getMeeting } from './common.js';
import { findSimilarOpen } from './action.service.js';
import type { harvestTextSchema } from '../validation/schemas.js';

const ACTION_KEYWORDS = /(giao|phụ trách|đảm nhận|deadline|hạn chót|trước ngày|todo|action|cần làm|nhiệm vụ|follow ?up)/i;
const CHECKBOX = /^\s*(?:[-*•]\s*)?\[( |x|X)\]\s*(.+)$/;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
const DECISION = /^\s*(?:[-*•]\s*)?(?:\[[^\]]+\]\s*)?(?:quyết định|chốt|kết luận)\s*[:：]\s*(.+)$/i;
const OWNER_AT = /@([\p{L}\p{N}_.-]+)/u;
const OWNER_GIAO = /(?:giao|phụ trách)\s+(?:cho\s+)?(?:anh|chị|em|bạn)?\s*([\p{L}]+(?:\s[\p{L}]+)?)/iu;
const DATE_ISO = /(\d{4}-\d{2}-\d{2})/;
const DATE_VN = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/;

export interface ProposedAction {
  title: string;
  owner_hint: string | null;
  due_hint: string | null;               // ISO nếu bóc được, không thì null
  duplicate_of?: { id: string; title: string; score: number };
}
export interface HarvestResult {
  proposed_actions: ProposedAction[];
  proposed_decisions: string[];
  stats: { lines_scanned: number; actions_found: number; duplicates_flagged: number; decisions_found: number };
}

function extractDue(line: string, refYear: number): string | null {
  const iso = line.match(DATE_ISO);
  if (iso) return iso[1]!;
  const vn = line.match(DATE_VN);
  if (vn) {
    const d = vn[1]!.padStart(2, '0'); const mo = vn[2]!.padStart(2, '0');
    const y = vn[3] ?? String(refYear);
    const dd = Number(d); const mm = Number(mo);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) return `${y}-${mo}-${d}`;
  }
  return null;
}

function extractOwner(line: string): string | null {
  const at = line.match(OWNER_AT);
  if (at) return at[1]!;
  const giao = line.match(OWNER_GIAO);
  if (giao) return giao[1]!.trim();
  return null;
}

export async function harvestFromText(ctx: SmCtx, input: z.infer<typeof harvestTextSchema>): Promise<HarvestResult> {
  await getMeeting(ctx, input.meeting_id);
  const refYear = (ctx.now ? ctx.now() : new Date()).getUTCFullYear();
  const lines = input.text.split(/\r?\n/);
  const actions: ProposedAction[] = [];
  const decisions: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const dec = line.match(DECISION);
    if (dec) { decisions.push(dec[1]!.trim()); continue; }
    let title: string | null = null;
    const cb = line.match(CHECKBOX);
    if (cb) title = cb[2]!.trim();
    else {
      const bl = line.match(BULLET);
      const body = bl ? bl[1]!.trim() : line;
      if (bl) {
        if (ACTION_KEYWORDS.test(body) || OWNER_AT.test(body)) title = body;
      } else if (ACTION_KEYWORDS.test(body) && OWNER_AT.test(body)) {
        title = body;
      }
    }
    if (!title) continue;
    actions.push({
      title,
      owner_hint: extractOwner(line),
      due_hint: extractDue(line, refYear),
    });
  }

  let dupCount = 0;
  for (const a of actions) {
    const dup = await findSimilarOpen(ctx, a.title);
    if (dup) { a.duplicate_of = dup; dupCount++; }
  }

  return {
    proposed_actions: actions,
    proposed_decisions: decisions,
    stats: {
      lines_scanned: lines.length,
      actions_found: actions.length,
      duplicates_flagged: dupCount,
      decisions_found: decisions.length,
    },
  };
}
