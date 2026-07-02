// @citadel/db — Drizzle schema (Postgres + pgvector)
// Multi-tenant: every tenant-scoped table carries org_id. Single source of truth for DB shape.
import { pgTable, uuid, varchar, text, timestamp, pgEnum, index, jsonb, char, boolean, integer, primaryKey } from 'drizzle-orm/pg-core';

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

export const schema = { orgs, users, tokens, auditLogs };
export type DB = typeof schema;

// ── Module registry (v6) ──
export const orgModules = pgTable('org_modules', {
  orgId: uuid('org_id').notNull(),
  moduleId: varchar('module_id', { length: 40 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('inactive'),
  purchased: boolean('purchased').notNull().default(false),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.moduleId] }) }));
