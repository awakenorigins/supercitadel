/**
 * SOUL-MEETING — Tiểu Tâm write-actions adapter cho host.
 *
 * Sinh action defs khớp TieuTamAction của host từ smWriteActions của module.
 * - requiredModule 'soul-meeting' · permission/securityLevel/sensitive lấy
 *   THẲNG từ tool def (host đã có dry-run→confirm: sensitive && !confirm →
 *   preview, KHÔNG gọi execute).
 * - parameters: object mở (khuôn Soul-Wallet) — normalizeParams của host cần
 *   type:'object'+properties; docs/intents cấp ngữ nghĩa cho LLM.
 * - KHÁC Soul-Wallet (nâng cấp an toàn, ghi AUDIT_REPORT): execute Zod-parse
 *   params bằng inputSchema của tool → đường Tiểu Tâm cũng được validate như
 *   đường HTTP, ZodError trả message tiếng Việt gọn thay vì lỗi DB khó hiểu.
 * - sm.export_actions_excel: trả downloadUrl trỏ GET /actions/export.xlsx của
 *   adapter (Shell thấy {downloadUrl, filename} → render nút tải).
 * - caps optional (asr/notify/contacts) tiêm lúc wiring; thiếu → degrade sạch.
 */
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { smWriteActions } from '../src/tools/index.js';
import type { SmCtx, SmCaps, EventBus } from '../src/types.js';

const noopBus: EventBus = { emit: async () => {} };

async function withOrgTx<T>(db: any, orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/** Trả action defs; host push thẳng vào defs của tieu-tam/actions.ts. */
export function soulMeetingTieuTamActions(caps?: SmCaps): any[] {
  return smWriteActions.map((a) => ({
    name: a.name,
    description: a.docs ?? a.name,
    requiredModule: 'soul-meeting',
    permission: a.permission,
    securityLevel: a.securityLevel,
    sensitive: a.sensitive,
    parameters: { type: 'object', properties: {}, additionalProperties: true },
    async execute(ctx: any, params: any) {
      const userId = ctx.userId;
      if (!userId) {
        throw new Error('soul-meeting: missing user id (ctx.userId) — refusing action (fail-closed)');
      }
      let parsed: unknown;
      try {
        parsed = a.inputSchema.parse(params ?? {});
      } catch (e) {
        if (e instanceof ZodError) {
          const need = e.issues.map((i) => i.path.join('.')).filter(Boolean).join(', ');
          return { ok: false, action: a.name, module: 'soul-meeting', message: `Thiếu/sai tham số: ${need || 'dữ liệu không hợp lệ'}. Hỏi lại người dùng rồi thử lại.` };
        }
        throw e;
      }
      const data = await withOrgTx(ctx.db, ctx.orgId, async (tx) => {
        const smCtx: SmCtx = { db: tx, orgId: ctx.orgId, userId, bus: noopBus, caps } as SmCtx;
        return a.handler(smCtx, parsed as never);
      });
      await ctx.audit?.({ action: a.name, detail: params });
      const msg = (data as { message?: string })?.message ?? `Soul-Meeting: ${a.name} xong`;

      // Excel: gắn downloadUrl để Shell render nút tải (khuôn soul-manager)
      if (a.name === 'sm.export_actions_excel') {
        const d = (data as { data?: { file_name?: string } })?.data;
        const qs = new URLSearchParams();
        for (const k of ['status', 'owner_user_id', 'meeting_id', 'overdue_only', 'limit'] as const) {
          const v = (params ?? {})[k];
          if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
        }
        return {
          ok: true, action: a.name, module: 'soul-meeting', message: msg,
          downloadUrl: `/api/v1/soul-meeting/actions/export.xlsx${qs.size ? `?${qs.toString()}` : ''}`,
          filename: d?.file_name ?? 'soul-meeting-viec.xlsx',
          data,
        };
      }
      return { ok: true, action: a.name, module: 'soul-meeting', message: msg, data };
    },
  }));
}
