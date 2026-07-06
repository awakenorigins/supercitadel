// Chat service v2 (R11.5 enterprise) — room management, reactions, pins,
// attachments, reply/recall/edit, unread counts, read-all (compliance).
// Mọi hàm enforce org scope + membership như service.ts gốc.
import { eq, and, desc, inArray, sql, isNull, gt, ne } from 'drizzle-orm';
import { chatRooms, chatRoomMembers, chatMessages, chatReactions, chatPins, chatAttachments } from './schema.js';
import { Errors } from '@citadel/core';

type DB = any;

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const BLOCKED_EXT = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll', '.scr', '.ps1', '.vbs', '.js'];

async function member(db: DB, roomId: string, userId: string, orgId: string) {
  const m = await db.select().from(chatRoomMembers)
    .where(and(eq(chatRoomMembers.roomId, roomId), eq(chatRoomMembers.userId, userId), eq(chatRoomMembers.orgId, orgId)));
  if (!m.length) throw Errors.forbidden('Bạn không thuộc phòng này');
  return m[0];
}

async function assertRoomAdmin(db: DB, roomId: string, userId: string, orgId: string, userRole?: string) {
  if (userRole === 'owner' || userRole === 'super_admin') { await member(db, roomId, userId, orgId).catch(() => {}); return; }
  const m = await member(db, roomId, userId, orgId);
  if (m.role !== 'admin') throw Errors.forbidden('Chỉ admin phòng mới làm được việc này');
}

// ── Quản lý phòng ───────────────────────────────────────────────

export async function renameRoom(db: DB, orgId: string, userId: string, roomId: string, name: string, userRole?: string) {
  if (!name.trim()) throw Errors.validation('Tên phòng trống', 'name');
  await assertRoomAdmin(db, roomId, userId, orgId, userRole);
  const [room] = await db.update(chatRooms).set({ name: name.trim() })
    .where(and(eq(chatRooms.id, roomId), eq(chatRooms.orgId, orgId))).returning();
  return room;
}

export async function addMembers(db: DB, orgId: string, userId: string, roomId: string, memberIds: string[], userRole?: string) {
  await assertRoomAdmin(db, roomId, userId, orgId, userRole);
  const existing = await db.select().from(chatRoomMembers).where(and(eq(chatRoomMembers.roomId, roomId), eq(chatRoomMembers.orgId, orgId)));
  const have = new Set(existing.map((m: any) => m.userId));
  const fresh = [...new Set(memberIds)].filter((id) => !have.has(id));
  if (fresh.length) await db.insert(chatRoomMembers).values(fresh.map((uid) => ({ roomId, userId: uid, orgId })));
  return { added: fresh.length };
}

export async function removeMember(db: DB, orgId: string, userId: string, roomId: string, targetId: string, userRole?: string) {
  if (targetId !== userId) await assertRoomAdmin(db, roomId, userId, orgId, userRole); // tự rời thì không cần admin
  await db.delete(chatRoomMembers)
    .where(and(eq(chatRoomMembers.roomId, roomId), eq(chatRoomMembers.userId, targetId), eq(chatRoomMembers.orgId, orgId)));
  return { ok: true };
}

export async function listMembers(db: DB, orgId: string, userId: string, roomId: string) {
  await member(db, roomId, userId, orgId);
  return db.select().from(chatRoomMembers)
    .where(and(eq(chatRoomMembers.roomId, roomId), eq(chatRoomMembers.orgId, orgId)));
}

export async function setMemberRole(db: DB, orgId: string, userId: string, roomId: string, targetId: string, role: 'member' | 'admin', userRole?: string) {
  await assertRoomAdmin(db, roomId, userId, orgId, userRole);
  await db.update(chatRoomMembers).set({ role })
    .where(and(eq(chatRoomMembers.roomId, roomId), eq(chatRoomMembers.userId, targetId), eq(chatRoomMembers.orgId, orgId)));
  return { ok: true };
}

// ── Unread ──────────────────────────────────────────────────────

/** Số tin chưa đọc per-room cho user (dựa last_read_at đã có sẵn). */
export async function unreadCounts(db: DB, orgId: string, userId: string) {
  const rows = await db.execute(sql`
    SELECT m.room_id, count(msg.id)::int AS unread
    FROM chat_room_members m
    JOIN chat_messages msg ON msg.room_id = m.room_id AND msg.org_id = ${orgId}
      AND msg.deleted_at IS NULL AND msg.sender_id <> ${userId}
      AND (m.last_read_at IS NULL OR msg.created_at > m.last_read_at)
    WHERE m.user_id = ${userId} AND m.org_id = ${orgId}
    GROUP BY m.room_id
  `);
  const list = ('rows' in rows ? (rows as any).rows : rows) as Array<{ room_id: string; unread: number }>;
  return Object.fromEntries(list.map((r) => [r.room_id, r.unread]));
}

// ── Reaction ────────────────────────────────────────────────────

export async function toggleReaction(db: DB, orgId: string, userId: string, roomId: string, messageId: string, emoji: string) {
  await member(db, roomId, userId, orgId);
  const cleaned = String(emoji).slice(0, 16);
  const existing = await db.select().from(chatReactions)
    .where(and(eq(chatReactions.messageId, messageId), eq(chatReactions.userId, userId), eq(chatReactions.emoji, cleaned)));
  if (existing.length) {
    await db.delete(chatReactions)
      .where(and(eq(chatReactions.messageId, messageId), eq(chatReactions.userId, userId), eq(chatReactions.emoji, cleaned)));
    return { toggled: 'off' as const };
  }
  await db.insert(chatReactions).values({ messageId, userId, emoji: cleaned });
  return { toggled: 'on' as const };
}

export async function reactionsForMessages(db: DB, messageIds: string[]) {
  if (!messageIds.length) return {};
  const rows = await db.select().from(chatReactions).where(inArray(chatReactions.messageId, messageIds));
  const out: Record<string, Array<{ emoji: string; userId: string }>> = {};
  for (const r of rows) { (out[r.messageId] ??= []).push({ emoji: r.emoji, userId: r.userId }); }
  return out;
}

// ── Pin ─────────────────────────────────────────────────────────

export async function pinMessage(db: DB, orgId: string, userId: string, roomId: string, messageId: string) {
  await member(db, roomId, userId, orgId);
  await db.insert(chatPins).values({ roomId, messageId, orgId, pinnedBy: userId }).onConflictDoNothing();
  return { ok: true };
}

export async function unpinMessage(db: DB, orgId: string, userId: string, roomId: string, messageId: string) {
  await member(db, roomId, userId, orgId);
  await db.delete(chatPins).where(and(eq(chatPins.roomId, roomId), eq(chatPins.messageId, messageId), eq(chatPins.orgId, orgId)));
  return { ok: true };
}

export async function listPins(db: DB, orgId: string, userId: string, roomId: string) {
  await member(db, roomId, userId, orgId);
  const pins = await db.select().from(chatPins)
    .where(and(eq(chatPins.roomId, roomId), eq(chatPins.orgId, orgId))).orderBy(desc(chatPins.createdAt));
  const ids = pins.map((p: any) => p.messageId);
  if (!ids.length) return [];
  const msgs = await db.select().from(chatMessages).where(inArray(chatMessages.id, ids));
  const byId = new Map(msgs.map((m: any) => [m.id, m]));
  return pins.map((p: any) => ({ ...p, message: byId.get(p.messageId) ?? null }));
}

// ── Sửa / thu hồi tin ───────────────────────────────────────────

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export async function editMessage(db: DB, orgId: string, userId: string, roomId: string, messageId: string, body: string) {
  if (!body.trim()) throw Errors.validation('Nội dung trống', 'body');
  await member(db, roomId, userId, orgId);
  const [msg] = await db.select().from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.orgId, orgId), eq(chatMessages.roomId, roomId)));
  if (!msg) throw Errors.notFound('Không thấy tin nhắn');
  if (msg.senderId !== userId) throw Errors.forbidden('Chỉ sửa được tin của mình');
  if (msg.deletedAt) throw Errors.validation('Tin đã thu hồi', 'messageId');
  if (Date.now() - new Date(msg.createdAt).getTime() > EDIT_WINDOW_MS) throw Errors.validation('Quá 15 phút, không sửa được nữa', 'messageId');
  const [updated] = await db.update(chatMessages).set({ body, editedAt: new Date() })
    .where(eq(chatMessages.id, messageId)).returning();
  return updated;
}

export async function recallMessage(db: DB, orgId: string, userId: string, roomId: string, messageId: string, userRole?: string) {
  await member(db, roomId, userId, orgId);
  const [msg] = await db.select().from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.orgId, orgId), eq(chatMessages.roomId, roomId)));
  if (!msg) throw Errors.notFound('Không thấy tin nhắn');
  const isElevated = userRole === 'owner' || userRole === 'super_admin';
  if (msg.senderId !== userId && !isElevated) throw Errors.forbidden('Chỉ thu hồi được tin của mình');
  // chuẩn kiểm toán: giữ vệt "tin đã thu hồi", không xóa trắng
  const [updated] = await db.update(chatMessages)
    .set({ body: '', deletedAt: new Date() })
    .where(eq(chatMessages.id, messageId)).returning();
  await db.delete(chatAttachments).where(eq(chatAttachments.messageId, messageId));
  return updated;
}

// ── File đính kèm ───────────────────────────────────────────────

export async function sendFileMessage(
  db: DB, orgId: string, userId: string, roomId: string,
  file: { fileName: string; mime: string; dataB64: string }, caption?: string,
) {
  await member(db, roomId, userId, orgId);
  const name = String(file.fileName ?? '').trim().slice(0, 200);
  if (!name) throw Errors.validation('Thiếu tên file', 'fileName');
  const lower = name.toLowerCase();
  if (BLOCKED_EXT.some((e) => lower.endsWith(e))) throw Errors.validation('Loại file này bị chặn vì an toàn', 'fileName');
  const size = Math.floor((file.dataB64?.length ?? 0) * 3 / 4);
  if (!size) throw Errors.validation('File trống', 'dataB64');
  if (size > MAX_FILE_BYTES) throw Errors.validation('File vượt 5MB', 'dataB64');
  const [msg] = await db.insert(chatMessages)
    .values({ roomId, orgId, senderId: userId, body: caption?.trim() || name, kind: 'file' }).returning();
  const [att] = await db.insert(chatAttachments)
    .values({ messageId: msg.id, orgId, fileName: name, mime: String(file.mime ?? 'application/octet-stream').slice(0, 120), sizeBytes: size, dataB64: file.dataB64 })
    .returning({ id: chatAttachments.id, fileName: chatAttachments.fileName, mime: chatAttachments.mime, sizeBytes: chatAttachments.sizeBytes });
  await db.update(chatRooms).set({ lastMessageAt: new Date() }).where(eq(chatRooms.id, roomId));
  return { ...msg, attachment: att };
}

export async function getAttachment(db: DB, orgId: string, userId: string, attachmentId: string) {
  const [att] = await db.select().from(chatAttachments)
    .where(and(eq(chatAttachments.id, attachmentId), eq(chatAttachments.orgId, orgId)));
  if (!att) throw Errors.notFound('Không thấy file');
  await member(db, (await db.select().from(chatMessages).where(eq(chatMessages.id, att.messageId)))[0]?.roomId, userId, orgId);
  return att;
}

export async function attachmentsForMessages(db: DB, messageIds: string[]) {
  if (!messageIds.length) return {};
  const rows = await db.select({
    id: chatAttachments.id, messageId: chatAttachments.messageId,
    fileName: chatAttachments.fileName, mime: chatAttachments.mime, sizeBytes: chatAttachments.sizeBytes,
  }).from(chatAttachments).where(inArray(chatAttachments.messageId, messageIds));
  const out: Record<string, any> = {};
  for (const r of rows) out[r.messageId] = r;
  return out;
}

// ── Channel phòng ban (sync Soul-Manager) ───────────────────────

/** Đảm bảo mỗi phòng ban active có 1 channel; sync thành viên theo sm_employees.user_id (nếu gán). */
export async function syncDepartmentChannels(db: DB, orgId: string, actorId: string) {
  const deps = await db.execute(sql`
    SELECT d.id, d.name FROM sm_departments d WHERE d.org_id = ${orgId} AND d.active = true
  `).then((r: any) => ('rows' in r ? r.rows : r)).catch(() => [] as any[]);
  let created = 0, syncedMembers = 0;
  for (const d of deps) {
    let [room] = await db.select().from(chatRooms)
      .where(and(eq(chatRooms.orgId, orgId), eq(chatRooms.departmentId, d.id), eq(chatRooms.kind, 'department')));
    if (!room) {
      [room] = await db.insert(chatRooms)
        .values({ orgId, name: `# ${d.name}`, isGroup: true, kind: 'department', departmentId: d.id, createdBy: actorId }).returning();
      created++;
    }
    // thành viên = user khớp nhân viên thuộc phòng ban (map qua display_name — best effort,
    // vì sm_employees chưa có cột user_id; khi nào Soul-Manager thêm link thì đổi join)
    const empUsers = await db.execute(sql`
      SELECT DISTINCT u.id AS user_id
      FROM sm_employees e
      JOIN users u ON u.org_id = ${orgId} AND lower(u.display_name) = lower(e.full_name)
      WHERE e.org_id = ${orgId} AND e.department_id = ${d.id} AND e.status IN ('active','probation')
    `).then((r: any) => ('rows' in r ? r.rows : r)).catch(() => [] as any[]);
    const have = new Set((await db.select().from(chatRoomMembers)
      .where(and(eq(chatRoomMembers.roomId, room.id), eq(chatRoomMembers.orgId, orgId)))).map((m: any) => m.userId));
    const fresh = empUsers.map((r: any) => r.user_id).filter((id: string) => id && !have.has(id));
    if (fresh.length) {
      await db.insert(chatRoomMembers).values(fresh.map((uid: string) => ({ roomId: room.id, userId: uid, orgId })));
      syncedMembers += fresh.length;
    }
  }
  return { departments: deps.length, channelsCreated: created, membersAdded: syncedMembers };
}

// ── Read-all (compliance, chỉ owner/super_admin) ────────────────

/** Đọc tin của MỌI phòng nhóm trong org (không gồm chat 1-1 riêng tư). Mọi lượt gọi PHẢI đi kèm audit ở tầng route. */
export async function readAllRooms(db: DB, orgId: string, opts?: { includeDirect?: boolean; limit?: number }) {
  const rooms = await db.select().from(chatRooms).where(and(
    eq(chatRooms.orgId, orgId),
    ...(opts?.includeDirect ? [] : [ne(chatRooms.kind, 'direct')]),
  )).orderBy(desc(chatRooms.lastMessageAt)).limit(opts?.limit ?? 50);
  return rooms;
}

export async function readAllMessages(db: DB, orgId: string, roomId: string, limit = 100) {
  return db.select().from(chatMessages)
    .where(and(eq(chatMessages.roomId, roomId), eq(chatMessages.orgId, orgId)))
    .orderBy(desc(chatMessages.createdAt)).limit(limit);
}
