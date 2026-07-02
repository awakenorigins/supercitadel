// docs.ts — Tiểu Tâm đọc GIÁO TRÌNH module (V7A P4 — G6, quy chuẩn ⑧).
// Mỗi module có docs/GUIDE.md (Giới thiệu · Chức năng · Hướng dẫn sử dụng · Ví dụ · Changelog).
// Tiểu Tâm nạp giáo trình của các module ACTIVE thành bản đồ năng lực; intent 'help'
// trả lời từ docs THẬT — không bịa. Cache đọc file, không đọc lại mỗi request.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export interface ModuleDoc {
  id: string;
  /** Tên module — dòng H1 của GUIDE. */
  name: string;
  /** Đoạn Giới thiệu — tóm tắt năng lực cho moduleMap. */
  summary: string;
  /** Các bước ở mục "Hướng dẫn sử dụng" (giữ nguyên văn). */
  steps: string[];
  /** Ví dụ hỏi Tiểu Tâm: câu hỏi → hành động tương ứng. */
  examples: { q: string; a: string }[];
  /** Toàn văn — cho engine live render vào system prompt khi cần. */
  raw: string;
}

/** Thư mục modules/ — mặc định suy từ vị trí package (packages/tieu-tam → ../../modules). */
function modulesDir(): string {
  if (process.env.MODULES_DIR) return process.env.MODULES_DIR;
  return fileURLToPath(new URL('../../../modules/', import.meta.url));
}

function parseGuide(id: string, md: string): ModuleDoc {
  const name = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? id;
  const section = (title: string) => {
    // Tiêu đề có thể có hậu tố (vd "## Ví dụ (hỏi Tiểu Tâm)") — khớp tới cuối dòng, không chỉ sau từa đề.
    const m = md.match(new RegExp(`##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`));
    return m?.[1]?.trim() ?? '';
  };
  const summary = section('Giới thiệu').split('\n')[0]?.trim() ?? '';
  const steps = section('Hướng dẫn sử dụng').split('\n')
    .map((l) => l.trim()).filter((l) => /^\d+\./.test(l));
  const examples: { q: string; a: string }[] = [];
  for (const m of section('Ví dụ').matchAll(/-\s+\*\*"?(.+?)"?\*\*\s*→\s*(.+)/g)) {
    examples.push({ q: m[1].trim(), a: m[2].trim() });
  }
  return { id, name, summary, steps, examples, raw: md };
}

const cache = new Map<string, ModuleDoc | null>();

/** Đọc giáo trình 1 module (cached — chỉ đọc file 1 lần/process). */
export function loadModuleDoc(moduleId: string): ModuleDoc | null {
  if (cache.has(moduleId)) return cache.get(moduleId)!;
  const p = join(modulesDir(), moduleId, 'docs/GUIDE.md');
  let doc: ModuleDoc | null = null;
  try {
    if (existsSync(p)) doc = parseGuide(moduleId, readFileSync(p, 'utf8'));
  } catch { doc = null; }
  cache.set(moduleId, doc);
  return doc;
}

/** Giáo trình của các module active — bản đồ năng lực Tiểu Tâm. */
export function loadModuleDocs(moduleIds: string[]): ModuleDoc[] {
  return moduleIds.map(loadModuleDoc).filter((d): d is ModuleDoc => d !== null);
}

/** Xóa cache (dùng cho test). */
export function clearDocsCache() { cache.clear(); }

const tokenize = (s: string) => s.toLowerCase().split(/[\s.,!?;:"“”()]+/).filter((t) => t.length >= 2);
const overlap = (qTokens: string[], text: string) => {
  const t = text.toLowerCase();
  return qTokens.filter((tk) => t.includes(tk)).length;
};

/** Trả lời câu hỏi "làm sao/hướng dẫn" từ giáo trình THẬT.
 *  Ưu tiên ví dụ khớp câu hỏi; không có → các bước Hướng dẫn sử dụng của module khớp nhất. */
export function answerFromDocs(question: string, docs: ModuleDoc[]): { text: string; moduleId: string } | null {
  if (!docs.length) return null;
  const qTokens = tokenize(question);
  if (!qTokens.length) return null;
  // chọn module khớp nhất theo toàn văn
  const best = docs
    .map((d) => ({ d, score: overlap(qTokens, d.raw) }))
    .sort((a, b) => b.score - a.score)[0];
  if (!best || best.score === 0) return null;
  const doc = best.d;
  // ví dụ khớp câu hỏi → trả hành động tương ứng + bước liên quan
  const ex = doc.examples
    .map((e) => ({ e, score: overlap(qTokens, e.q) }))
    .sort((a, b) => b.score - a.score)[0];
  const relevantSteps = doc.steps
    .map((s) => ({ s, score: overlap(qTokens, s) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.s);
  const parts: string[] = [];
  if (ex && ex.score >= 2) parts.push(ex.e.a);
  if (relevantSteps.length) parts.push(...relevantSteps);
  if (!parts.length) parts.push(...doc.steps.slice(0, 3));
  if (!parts.length) return null;
  return { text: `${doc.name.replace(/\s*\(.+\)$/, '')}: ${parts.join(' ')}`, moduleId: doc.id };
}
