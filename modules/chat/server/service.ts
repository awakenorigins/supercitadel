// Chat service — all operations enforce org scope + room membership.
import { eq, and, desc, inArray } from 'drizzle-orm';
import { chatRooms, chatRoomMembers, chatMessages } from './schema.js';
import { Errors } from '@citadel/core';

type DB = any;

async function assertMember(db: DB, roomId: string, userId: string, orgId: string) {
  const m = await db.select().from(chatRoomMembers)
    .where(and(eq(chatRoomMembers.roomId, roomId), eq(chatRoomMembers.userId, userId), eq(chatRoomMembers.orgId, orgId)));
  if (!m.length) throw Errors.forbidden('Bạn không thuộc phòng này');
}

export async function createRoom(
  db: DB, orgId: string, createdBy: string,
  opts: { name?: string; isGroup?: boolean; memberIds: string[] },
) {
  const [room] = await db.insert(chatRooms).values({
    orgId, name: opts.name, isGroup: opts.isGroup ?? opts.memberIds.length > 2, createdBy,
  }).returning();
  const members = [...new Set([createdBy, ...opts.memberIds])];
  await db.insert(chatRoomMembers).values(members.map((userId) => ({ roomId: room.id, userId, orgId })));
  return room;
}

/** Rooms the user belongs to, newest activity first. */
export async function listRooms(db: DB, orgId: string, userId: string) {
  const memberRows = await db.select().from(chatRoomMembers)
    .where(and(eq(chatRoomMembers.userId, userId), eq(chatRoomMembers.orgId, orgId)));
  const ids = memberRows.map((r: any) => r.roomId);
  if (!ids.length) return [];
  return db.select().from(chatRooms)
    .where(and(eq(chatRooms.orgId, orgId), inArray(chatRooms.id, ids)))
    .orderBy(desc(chatRooms.lastMessageAt));
}

export async function listMessages(db: DB, orgId: string, userId: string, roomId: string, limit = 50) {
  await assertMember(db, roomId, userId, orgId);
  return db.select().from(chatMessages)
    .where(and(eq(chatMessages.roomId, roomId), eq(chatMessages.orgId, orgId)))
    .orderBy(desc(chatMessages.createdAt)).limit(limit);
}

export async function sendMessage(db: DB, orgId: string, userId: string, roomId: string, body: string, replyToId?: string) {
  if (!body.trim()) throw Errors.validation('Nội dung trống', 'body');
  await assertMember(db, roomId, userId, orgId);
  const [msg] = await db.insert(chatMessages).values({ roomId, orgId, senderId: userId, body, ...(replyToId ? { replyToId } : {}) }).returning();
  await db.update(chatRooms).set({ lastMessageAt: new Date() }).where(eq(chatRooms.id, roomId));
  return msg;
}

export async function markRead(db: DB, orgId: string, userId: string, roomId: string) {
  await assertMember(db, roomId, userId, orgId);
  await db.update(chatRoomMembers).set({ lastReadAt: new Date() })
    .where(and(eq(chatRoomMembers.roomId, roomId), eq(chatRoomMembers.userId, userId)));
  return { ok: true };
}

/** Tool for Tiểu Tâm: search messages in user's rooms (org-scoped). */
export async function searchMessages(db: DB, orgId: string, query: string, limit = 10) {
  const all = await db.select().from(chatMessages)
    .where(eq(chatMessages.orgId, orgId)).orderBy(desc(chatMessages.createdAt)).limit(200);
  const q = query.toLowerCase();
  return all.filter((m: any) => m.body.toLowerCase().includes(q)).slice(0, limit);
}
