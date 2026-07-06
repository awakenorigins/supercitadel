import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  unit: varchar('unit', { length: 24 }).notNull().default('cái'),
  qty: integer('qty').notNull().default(0),
  lowThreshold: integer('low_threshold').notNull().default(5),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ orgIdx: index('inv_org_idx').on(t.orgId) }));
