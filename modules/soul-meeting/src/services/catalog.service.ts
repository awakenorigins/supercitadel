/**
 * SOUL-MEETING 1A — catalog.service
 * Settings org + Loại họp (template agenda/checklist/quorum). Seed idempotent.
 * Loại "Họp HĐTV/HĐQT" mang quorum capital_pct 65/65 (mặc định theo Luật DN 2020,
 * NGƯỠNG CONFIG ĐƯỢC vì điều lệ từng công ty khác nhau — không hardcode luật).
 */
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { SmCtx } from '../types.js';
import { SmError } from '../types.js';
import { smSettings, smMeetingTypes } from '../db/schema.js';
import { writeAudit, getType } from './common.js';
import type { settingsUpsertSchema, typeUpsertSchema } from '../validation/schemas.js';

export async function getSettings(ctx: SmCtx) {
  const [row] = await ctx.db.select().from(smSettings).where(eq(smSettings.orgId, ctx.orgId)).limit(1);
  if (row) return row;
  const inserted = await ctx.db.insert(smSettings)
    .values({ orgId: ctx.orgId, createdBy: ctx.userId })
    .onConflictDoNothing({ target: smSettings.orgId }).returning();
  if (inserted[0]) return inserted[0];
  const [again] = await ctx.db.select().from(smSettings).where(eq(smSettings.orgId, ctx.orgId)).limit(1);
  return again!;
}

export async function updateSettings(ctx: SmCtx, input: z.infer<typeof settingsUpsertSchema>) {
  const before = await getSettings(ctx);
  const rows = await ctx.db.update(smSettings).set({
    hourlyCost: input.hourly_cost !== undefined ? String(input.hourly_cost) : before.hourlyCost,
    costEnabled: input.cost_enabled ?? before.costEnabled,
    hygieneRequireAgenda: input.hygiene_require_agenda ?? before.hygieneRequireAgenda,
    remindHours1: input.remind_hours_1 ?? before.remindHours1,
    remindHours2: input.remind_hours_2 ?? before.remindHours2,
    audioRetentionDays: input.audio_retention_days ?? before.audioRetentionDays,
    asrEngine: input.asr_engine ?? before.asrEngine,
    updatedAt: new Date(),
  }).where(eq(smSettings.orgId, ctx.orgId)).returning();
  await writeAudit(ctx, { action: 'sm.settings.update', entity: 'smeet_settings', entityId: before.id, before, after: input });
  return rows[0]!;
}

/** Template mặc định — 6 loại họp SME VN */
const SYSTEM_TYPES: Array<{ name: string; description: string; template: Record<string, unknown> }> = [
  {
    name: 'Giao ban tuần',
    description: 'Họp giao ban định kỳ đầu tuần: điểm tin, rà việc kỳ trước, KPI, phân việc.',
    template: {
      agenda: [
        { title: 'Điểm tin tuần', timebox_minutes: 10 },
        { title: 'Rà soát việc kỳ trước', timebox_minutes: 15 },
        { title: 'KPI & số liệu', timebox_minutes: 15 },
        { title: 'Vấn đề & quyết định', timebox_minutes: 15 },
        { title: 'Phân việc tuần tới', timebox_minutes: 5 },
      ],
      checklist: ['Chốt agenda & gửi trước 1 ngày', 'Chuẩn bị số liệu KPI'],
      quorum_mode: 'none', quorum_threshold: 50, pass_threshold: 50, pass_basis: 'attending',
      requires_minutes_approval: false,
    },
  },
  {
    name: 'Họp dự án',
    description: 'Rà tiến độ, rủi ro/blocker, chốt quyết định, phân việc.',
    template: {
      agenda: [
        { title: 'Tiến độ', timebox_minutes: 15 },
        { title: 'Rủi ro & blocker', timebox_minutes: 15 },
        { title: 'Quyết định cần chốt', timebox_minutes: 15 },
        { title: 'Việc tiếp theo', timebox_minutes: 10 },
      ],
      checklist: ['Cập nhật bảng tiến độ trước họp'],
      quorum_mode: 'none', quorum_threshold: 50, pass_threshold: 50, pass_basis: 'attending',
      requires_minutes_approval: false,
    },
  },
  {
    name: 'Họp khách hàng',
    description: 'Họp với khách/đối tác bên ngoài — gắn được contact Soul-Sale.',
    template: {
      agenda: [
        { title: 'Giới thiệu & mục tiêu', timebox_minutes: 5 },
        { title: 'Nội dung chính', timebox_minutes: 30 },
        { title: 'Thống nhất bước tiếp theo', timebox_minutes: 10 },
      ],
      checklist: ['Chuẩn bị tài liệu gửi khách', 'Xác nhận lịch với khách'],
      quorum_mode: 'none', quorum_threshold: 50, pass_threshold: 50, pass_basis: 'attending',
      requires_minutes_approval: false,
    },
  },
  {
    name: 'Họp HĐTV/HĐQT',
    description: 'Họp formal có biểu quyết theo %% vốn góp. Quorum/pass mặc định 65/65 — chỉnh theo Điều lệ công ty.',
    template: {
      agenda: [
        { title: 'Khai mạc & kiểm tra tư cách dự họp', timebox_minutes: 10 },
        { title: 'Báo cáo', timebox_minutes: 30 },
        { title: 'Thảo luận & biểu quyết', timebox_minutes: 45 },
        { title: 'Thông qua biên bản tại chỗ', timebox_minutes: 10 },
      ],
      checklist: ['Gửi thông báo mời họp + tài liệu đúng hạn theo Điều lệ', 'Chuẩn bị mẫu biên bản & danh sách tỷ lệ vốn'],
      quorum_mode: 'capital_pct', quorum_threshold: 65, pass_threshold: 65, pass_basis: 'attending',
      requires_minutes_approval: true,
    },
  },
  {
    name: 'Họp đột xuất',
    description: 'Vấn đề nóng cần chốt nhanh.',
    template: {
      agenda: [
        { title: 'Vấn đề', timebox_minutes: 10 },
        { title: 'Phương án', timebox_minutes: 15 },
        { title: 'Quyết định', timebox_minutes: 5 },
      ],
      checklist: [],
      quorum_mode: 'none', quorum_threshold: 50, pass_threshold: 50, pass_basis: 'attending',
      requires_minutes_approval: false,
    },
  },
  {
    name: '1-1',
    description: 'Trao đổi định kỳ 1-1: cập nhật, feedback hai chiều, hỗ trợ.',
    template: {
      agenda: [
        { title: 'Cập nhật', timebox_minutes: 10 },
        { title: 'Feedback hai chiều', timebox_minutes: 10 },
        { title: 'Hỗ trợ cần thiết', timebox_minutes: 10 },
      ],
      checklist: [],
      quorum_mode: 'none', quorum_threshold: 50, pass_threshold: 50, pass_basis: 'attending',
      requires_minutes_approval: false,
    },
  },
];

/** Idempotent: chạy bao nhiêu lần cũng chỉ có đúng 6 loại system/org */
export async function seedDefaultTypes(ctx: SmCtx) {
  for (const t of SYSTEM_TYPES) {
    await ctx.db.insert(smMeetingTypes).values({
      orgId: ctx.orgId, name: t.name, description: t.description,
      template: t.template, isSystem: true, createdBy: ctx.userId,
    }).onConflictDoNothing();
  }
  return listTypes(ctx);
}

export async function listTypes(ctx: SmCtx, includeArchived = false) {
  const conds = [eq(smMeetingTypes.orgId, ctx.orgId)];
  if (!includeArchived) conds.push(eq(smMeetingTypes.isArchived, false));
  return ctx.db.select().from(smMeetingTypes).where(and(...conds)).orderBy(smMeetingTypes.createdAt);
}

export async function upsertType(ctx: SmCtx, input: z.infer<typeof typeUpsertSchema>) {
  if (input.id) {
    const before = await getType(ctx, input.id);
    const rows = await ctx.db.update(smMeetingTypes).set({
      name: input.name ?? before.name,
      description: input.description ?? before.description,
      template: input.template ?? before.template,
      isArchived: input.is_archived ?? before.isArchived,
      updatedAt: new Date(),
    }).where(and(eq(smMeetingTypes.orgId, ctx.orgId), eq(smMeetingTypes.id, input.id))).returning();
    await writeAudit(ctx, { action: 'sm.type.update', entity: 'smeet_meeting_types', entityId: input.id, before, after: input });
    return rows[0]!;
  }
  const rows = await ctx.db.insert(smMeetingTypes).values({
    orgId: ctx.orgId, name: input.name, description: input.description,
    template: input.template ?? {}, createdBy: ctx.userId,
  }).returning();
  await writeAudit(ctx, { action: 'sm.type.create', entity: 'smeet_meeting_types', entityId: rows[0]!.id, after: input });
  return rows[0]!;
}

/** Đọc template đã chuẩn hóa từ 1 type (null-safe cho type tự tạo template rỗng) */
export function typeTemplateOf(t: { template: unknown }): {
  agenda: Array<{ title: string; timebox_minutes?: number }>;
  checklist: string[];
  quorum_mode: 'none' | 'headcount' | 'capital_pct';
  quorum_threshold: number; pass_threshold: number;
  pass_basis: 'attending' | 'total';
  requires_minutes_approval: boolean;
} {
  const raw = (t.template ?? {}) as Record<string, unknown>;
  return {
    agenda: Array.isArray(raw.agenda) ? raw.agenda as never : [],
    checklist: Array.isArray(raw.checklist) ? raw.checklist as never : [],
    quorum_mode: (raw.quorum_mode as never) ?? 'none',
    quorum_threshold: Number(raw.quorum_threshold ?? 50),
    pass_threshold: Number(raw.pass_threshold ?? 50),
    pass_basis: (raw.pass_basis as never) ?? 'attending',
    requires_minutes_approval: Boolean(raw.requires_minutes_approval ?? false),
  };
}
export { SmError };
