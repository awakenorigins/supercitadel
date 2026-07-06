import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
export const omLedger = pgTable('om_ledger', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  delta: integer('delta').notNull(),
  reason: varchar('reason', { length: 120 }).notNull(),
  module: varchar('module', { length: 40 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ orgIdx: index('om_ledger_org_idx').on(t.orgId, t.createdAt) }));
export const omSchema = { omLedger };
