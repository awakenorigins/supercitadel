// Chat module schema — tenant-scoped messaging tables.
import { pgTable, uuid, varchar, text, timestamp, index, boolean, primaryKey, integer } from 'drizzle-orm/pg-core';

export const chatRooms = pgTable(
  'chat_rooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull(),
    name: varchar('name', { length: 120 }),
    isGroup: boolean('is_group').notNull().default(false),
    /** direct | group | department | announcement */
    kind: varchar('kind', { length: 20 }).notNull().default('group'),
    departmentId: uuid('department_id'),
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
    /** member | admin (admin phòng: quản thành viên/ghim/đổi tên) */
    role: varchar('role', { length: 12 }).notNull().default('member'),
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
    /** text | file | system */
    kind: varchar('kind', { length: 16 }).notNull().default('text'),
    replyToId: uuid('reply_to_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
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

export const chatPins = pgTable(
  'chat_pins',
  {
    roomId: uuid('room_id').notNull().references(() => chatRooms.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').notNull(),
    pinnedBy: uuid('pinned_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.roomId, t.messageId] }), orgIdx: index('chat_pins_org_idx').on(t.orgId) }),
);

export const chatAttachments = pgTable(
  'chat_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').notNull(),
    fileName: varchar('file_name', { length: 200 }).notNull(),
    mime: varchar('mime', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    dataB64: text('data_b64').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    msgIdx: index('chat_attachments_msg_idx').on(t.messageId),
    orgIdx: index('chat_attachments_org_idx').on(t.orgId),
  }),
);

export const chatSchema = { chatRooms, chatRoomMembers, chatMessages, chatReactions };
