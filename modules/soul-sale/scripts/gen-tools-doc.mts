/** Sinh docs/TOOLS.md từ CHÍNH registry — bảo đảm tài liệu không lệch code. */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { readTools } from '../src/registry/reads.js';
import { writeActions } from '../src/registry/writes.js';

function paramsOf(schema: unknown): string {
  const shape = (schema as z.ZodObject<z.ZodRawShape>).shape ?? {};
  return Object.entries(shape).map(([k, v]) => {
    const zv = v as z.ZodTypeAny;
    const opt = zv.isOptional() ? '?' : '';
    let t = zv._def?.typeName?.replace('Zod', '').toLowerCase() ?? 'unknown';
    if (t === 'optional') t = (zv._def.innerType?._def?.typeName ?? '').replace('Zod', '').toLowerCase();
    if (t === 'enum') t = `enum(${(zv._def.values ?? zv._def.innerType?._def?.values ?? []).join('|')})`;
    return `\`${k}${opt}: ${t}\``;
  }).join(', ') || '_(không tham số)_';
}

let md = `# Soul-Sale 1A — TOOLS.md (bề mặt Tiểu Tâm)\n\n> Sinh tự động từ \`src/registry/\` — 23 read tools + 34 write actions. Action **L2 (nhạy cảm)** theo protocol dry-run→confirm: gọi không \`confirm\` → nhận \`{dry_run:true, preview}\`; gọi lại kèm \`confirm:true\` để thực thi.\n\n## Read tools (23)\n\n`;
for (const t of readTools) {
  md += `### \`${t.name}\`\n- **Permission:** \`${t.permission}\`\n- **Mô tả:** ${t.description}\n- **Tham số:** ${paramsOf(t.params)}\n- **Câu nói mẫu:** ${(t.examples ?? []).map((e) => `“${e}”`).join(' · ')}\n\n`;
}
md += `## Write actions (34)\n\n`;
for (const a of writeActions) {
  md += `### \`${a.name}\`${a.sensitive ? ' 🔒 L2' : ''}\n- **Permission:** \`${a.permission}\` · **Security level:** ${a.securityLevel}${a.sensitive ? ' · **dry-run→confirm bắt buộc**' : ''}\n- **Mô tả:** ${a.description}\n- **Tham số:** ${paramsOf(a.params)}\n- **Câu nói mẫu:** ${(a.examples ?? []).map((e) => `“${e}”`).join(' · ')}\n\n`;
}
md += `---\n\n**Quy ước chung:** tiền VND là chuỗi số nguyên (\`"5000000"\` = 5 triệu); \`period\` dạng \`YYYY-MM\`; mọi ID là UUID lấy từ tool search/profile tương ứng.\n`;
writeFileSync(new URL('../docs/TOOLS.md', import.meta.url), md);
console.log('docs/TOOLS.md generated:', readTools.length, 'reads +', writeActions.length, 'writes');
