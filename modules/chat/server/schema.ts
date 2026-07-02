// Chat module schema — tenant-scoped messaging tables.
import { pgTable, uuid, varchar, text, timestamp, index, boolean, primaryKey, char } from 'drizzle-orm/pg-core';

export const chatRooms = pgTable(
  'chat_rooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull(),
    name: varchar('name', { length: 120 }),
    isGroup: boolean('is_group').notNull().default(false),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  },
  (t) => ({ orgIdx: index('chat_rooms_org_idx').on(t.orgId) }),
);

export const chatRoomMembers = pgTable(
  'chat_room_members',
  {
    roomId: uuid('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    orgId: uuid('org_id').notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roomId, t.userId] }),
    userIdx: index('chat_members_user_idx').on(t.userId),
  }),
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roomId: uuid('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').notNull(),
    senderId: uuid('sender_id').notNull(),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    roomIdx: index('chat_messages_room_idx').on(t.roomId, t.createdAt),
    orgIdx: index('chat_messages_org_idx').on(t.orgId),
  }),
);

export const chatReactions = pgTable(
  'chat_reactions',
  {
    messageId: uuid('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    emoji: varchar('emoji', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.messageId, t.userId, t.emoji] }) }),
);

export const chatSchema = { chatRooms, chatRoomMembers, chatMessages, chatReactions };
