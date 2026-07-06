// Notification module — tenant-scoped, per-user notifications.
import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull(),
    userId: uuid('user_id').notNull(),
    kind: varchar('kind', { length: 40 }).notNull(), // chat | task | crm | system
    title: varchar('title', { length: 160 }).notNull(),
    bodyText: text('body_text'),
    link: varchar('link', { length: 200 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ userIdx: index('notif_user_idx').on(t.userId, t.readAt) }),
);

export const notificationSchema = { notifications };
