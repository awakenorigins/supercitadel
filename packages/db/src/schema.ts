// @citadel/db — Drizzle schema (Postgres + pgvector)
// Multi-tenant: every tenant-scoped table carries org_id. Single source of truth for DB shape.
import { pgTable, uuid, varchar, text, timestamp, pgEnum, index, jsonb, char, boolean, integer, real, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── enums ──────────────────────────────────────────────────────
export const roleEnum = pgEnum('role', ['super_admin', 'owner', 'manager', 'staff']);
export const avatarColorEnum = pgEnum('avatar_color', ['mint', 'violet', 'amber', 'rose', 'sky']);

// ─── orgs (tenant root) ─────────────────────────────────────────
export const orgs = pgTable('orgs', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 60 }).notNull().unique(),
  logoEmoji: varchar('logo_emoji', { length: 16 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── users ──────────────────────────────────────────────────────
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    role: roleEnum('role').notNull().default('staff'),
    avatarColor: avatarColorEnum('avatar_color').notNull().default('mint'),
    // Progressive security lớp 2 (V7A P1): gắn email/SĐT → security_level 2
    email: varchar('email', { length: 160 }),
    phone: varchar('phone', { length: 24 }),
    securityLevel: integer('security_level').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index('users_org_idx').on(t.orgId) }),
);

// ─── tokens (V2.1 auth — 13-char access token, argon2 hashed) ───
export const tokens = pgTable(
  'tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    // tokenPrefix = first 4 chars (for display/lookup hint), tokenHash = argon2id(full token)
    tokenPrefix: char('token_prefix', { length: 4 }).notNull(),
    tokenHash: text('token_hash').notNull(),
    role: roleEnum('role').notNull().default('staff'),
    securityLevel: varchar('security_level', { length: 8 }).notNull().default('1'),
    label: varchar('label', { length: 80 }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index('tokens_org_idx').on(t.orgId),
    prefixIdx: index('tokens_prefix_idx').on(t.tokenPrefix),
  }),
);

// ─── audit_logs (V7A P1 — G8: ai làm gì lúc nào, tenant-isolated) ──
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'),
    action: varchar('action', { length: 80 }).notNull(),
    resource: varchar('resource', { length: 120 }),
    resourceId: varchar('resource_id', { length: 80 }),
    detail: jsonb('detail'),
    ip: varchar('ip', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index('audit_org_idx').on(t.orgId) }),
);

// ─── Tiểu Tâm — hồn tách động cơ (V7A P2 — G1) ──────────────────
// tt_memories: trí nhớ TRUNG LẬP (text thuần / JSON có cấu trúc) — không phụ thuộc provider nào.
export const ttMemories = pgTable(
  'tt_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'),
    kind: varchar('kind', { length: 16 }).notNull(), // 'fact'|'person'|'topic'|'summary'|'preference'
    content: text('content').notNull(),
    salience: real('salience').notNull().default(0.5),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgUserIdx: index('tt_memories_org_user_idx').on(t.orgId, t.userId) }),
);

// tt_chat_messages: hội thoại Tiểu Tâm bền vững (R7.6) — mở lại còn nguyên, multi-turn context.
export const ttChatMessages = pgTable(
  'tt_chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: varchar('role', { length: 12 }).notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgUserIdx: index('tt_chat_org_user_idx').on(t.orgId, t.userId, t.createdAt) }),
);

// tt_files: file người dùng tải lên cho Tiểu Tâm; chỉ lưu dữ liệu đã parse, không lưu binary.
export const ttFiles = pgTable(
  'tt_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    filename: varchar('filename', { length: 180 }).notNull(),
    mime: varchar('mime', { length: 120 }),
    kind: varchar('kind', { length: 16 }).notNull(),
    rowsJson: jsonb('rows_json').notNull(),
    summary: text('summary').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgUserIdx: index('tt_files_org_user_idx').on(t.orgId, t.userId, t.createdAt) }),
);

// tt_soul_state: mood + energy + engine per (org, user) — đổi model = gạt công tắc, hồn giữ nguyên.
export const ttSoulState = pgTable(
  'tt_soul_state',
  {
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    mood: varchar('mood', { length: 24 }).notNull().default('vui'),
    energy: real('energy').notNull().default(100),
    engine: varchar('engine', { length: 24 }).notNull().default('sonnet-4.6'),
    // V7A P3: vật phẩm decor đổi giao diện — theme lưu vào hồn (hiệu ứng thật)
    theme: varchar('theme', { length: 24 }).notNull().default('jade'),
    personaMode: varchar('persona_mode', { length: 24 }).notNull().default('friendly'),
    proactive: boolean('proactive').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.userId] }) }),
);

// ─── Item system (V7A P3 — G3/G4: vòng kinh tế khép kín) ───────
// item_catalog: danh mục TOÀN CỤC (không org_id — catalog bán, không phải dữ liệu tenant).
export const itemCatalog = pgTable('item_catalog', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  name: varchar('name', { length: 80 }).notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 12 }).notNull(), // 'food' | 'decor' | 'boost'
  price: integer('price').notNull(),
  effect: jsonb('effect').notNull(), // {"type":"feed_energy","amount":20} | {"type":"recharge_full"} | {"type":"decor","theme":"gold"}
  icon: varchar('icon', { length: 24 }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// user_items: sở hữu per (org, user) — tenant isolation bắt buộc (hiến pháp #1).
export const userItems = pgTable(
  'user_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    itemCode: varchar('item_code', { length: 40 }).notNull().references(() => itemCatalog.code),
    qty: integer('qty').notNull().default(1),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgUserIdx: index('user_items_org_user_idx').on(t.orgId, t.userId) }),
);

// ─── R7 · Module Company forge requests ─────────────────────────
export const companyModuleRequests = pgTable(
  'company_module_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    companyName: text('company_name').notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('received'),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index('company_module_requests_org_idx').on(t.orgId) }),
);

// ─── R10 · Transactional outbox ─────────────────────────────────
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    topic: varchar('topic', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => ({
    orgIdx: index('outbox_events_org_idx').on(t.orgId),
    pendingIdx: index('outbox_events_pending_idx').on(t.dispatchedAt, t.createdAt).where(sql`${t.dispatchedAt} IS NULL`),
  }),
);

export const schema = { orgs, users, tokens, auditLogs, ttMemories, ttChatMessages, ttFiles, ttSoulState, itemCatalog, userItems, companyModuleRequests, outboxEvents };
export type DB = typeof schema;

// ── Module registry (v6) ──
export const orgModules = pgTable('org_modules', {
  orgId: uuid('org_id').notNull(),
  moduleId: varchar('module_id', { length: 40 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('inactive'),
  purchased: boolean('purchased').notNull().default(false),
  rentedUntil: timestamp('rented_until', { withTimezone: true }),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.moduleId] }) }));
