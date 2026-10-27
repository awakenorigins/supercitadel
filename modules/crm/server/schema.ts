// CRM module schema — contacts & deals, tenant-scoped.
import { pgTable, uuid, varchar, text, timestamp, index, bigint, pgEnum } from 'drizzle-orm/pg-core';

export const dealStageEnum = pgEnum('deal_stage', ['lead', 'quote', 'negotiation', 'won', 'lost']);

export const crmContacts = pgTable(
  'crm_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 160 }),
    tag: varchar('tag', { length: 40 }),        // 'vip' | 'regular' | ...
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index('crm_contacts_org_idx').on(t.orgId) }),
);

export const crmDeals = pgTable(
  'crm_deals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull(),
    contactId: uuid('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 160 }).notNull(),
    valueVnd: bigint('value_vnd', { mode: 'number' }).notNull().default(0),
    stage: dealStageEnum('stage').notNull().default('lead'),
    ownerId: uuid('owner_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index('crm_deals_org_idx').on(t.orgId), stageIdx: index('crm_deals_stage_idx').on(t.orgId, t.stage) }),
);

export const crmSchema = { crmContacts, crmDeals };
