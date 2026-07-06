// Chat routes v2 (R11.5 enterprise) — mount thêm vào chat app gốc.
// Quyền: thao tác thường theo membership; read-all chỉ owner/super_admin + audit.
import { Hono } from 'hono';
import { WsEventType, type WsEvent, type JwtPayload } from '@citadel/core';
import {
  renameRoom, addMembers, removeMember, listMembers, setMemberRole,
  unreadCounts, toggleReaction, reactionsForMessages,
  pinMessage, unpinMessage, listPins,
  editMessage, recallMessage,
  sendFileMessage, getAttachment, attachmentsForMessages,
  syncDepartmentChannels, readAllRooms, readAllMessages,
} from './service-v2.js';
import { searchMessages } from './service.js';

type Emit = (ev: WsEvent) => Promise<void> | void;
type AuditFn = (c: any, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void>;

const orgOf = (c: any): string => (c.get('auth') as JwtPayload).orgId;
const meOf = (c: any): JwtPayload => c.get('auth') as JwtPayload;

export function mountChatV2Routes(chat: Hono, deps: { db: any; emit?: Emit; audit?: AuditFn }) {
  const emitRoom = async (c: any, roomId: string, type: WsEventType, payload: any) => {
    if (!deps.emit) return;
    await deps.emit({ type, orgId: orgOf(c), payload: { roomId, ...payload }, ts: Date.now() } as WsEvent);
  };

  // ── unread badge ──
  chat.get('/unread', async (c) => c.json({ unread: await unreadCounts(deps.db, orgOf(c), meOf(c).sub) }));

  // ── search FE ──
  chat.get('/search', async (c) => {
    const q = c.req.query('q') ?? '';
    if (!q.trim()) return c.json({ messages: [] });
    return c.json({ messages: await searchMessages(deps.db, orgOf(c), q, 25) });
  });

  // ── quản lý phòng ──
  chat.patch('/rooms/:id', async (c) => {
    const me = meOf(c);
    const body = await c.req.json().catch(() => ({}));
    const room = await renameRoom(deps.db, orgOf(c), me.sub, c.req.param('id'), String(body.name ?? ''), me.role);
    await emitRoom(c, room.id, WsEventType.DATA_CHANGED, { what: 'room_renamed', name: room.name });
    return c.json({ room });
  });
  chat.get('/rooms/:id/members', async (c) =>
    c.json({ members: await listMembers(deps.db, orgOf(c), meOf(c).sub, c.req.param('id')) }));
  chat.post('/rooms/:id/members', async (c) => {
    const me = meOf(c);
    const body = await c.req.json().catch(() => ({}));
    const r = await addMembers(deps.db, orgOf(c), me.sub, c.req.param('id'), body.memberIds ?? [], me.role);
    await emitRoom(c, c.req.param('id'), WsEventType.DATA_CHANGED, { what: 'members_added', count: r.added });
    return c.json(r, 201);
  });
  chat.delete('/rooms/:id/members/:userId', async (c) => {
    const me = meOf(c);
    const r = await removeMember(deps.db, orgOf(c), me.sub, c.req.param('id'), c.req.param('userId'), me.role);
    await emitRoom(c, c.req.param('id'), WsEventType.DATA_CHANGED, { what: 'member_removed', userId: c.req.param('userId') });
    return c.json(r);
  });
  chat.put('/rooms/:id/members/:userId/role', async (c) => {
    const me = meOf(c);
    const body = await c.req.json().catch(() => ({}));
    return c.json(await setMemberRole(deps.db, orgOf(c), me.sub, c.req.param('id'), c.req.param('userId'), body.role === 'admin' ? 'admin' : 'member', me.role));
  });

  // ── reaction ──
  chat.post('/rooms/:id/messages/:msgId/reactions', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const r = await toggleReaction(deps.db, orgOf(c), meOf(c).sub, c.req.param('id'), c.req.param('msgId'), String(body.emoji ?? '👍'));
    await emitRoom(c, c.req.param('id'), WsEventType.DATA_CHANGED, { what: 'reaction', messageId: c.req.param('msgId'), emoji: body.emoji, toggled: r.toggled, userId: meOf(c).sub });
    return c.json(r);
  });
  chat.get('/rooms/:id/messages/enrich', async (c) => {
    // reactions + attachments cho list message ids (FE gọi sau khi load messages)
    const ids = (c.req.query('ids') ?? '').split(',').filter(Boolean).slice(0, 100);
    const [reactions, attachments] = await Promise.all([
      reactionsForMessages(deps.db, ids), attachmentsForMessages(deps.db, ids),
    ]);
    return c.json({ reactions, attachments });
  });

  // ── pin ──
  chat.get('/rooms/:id/pins', async (c) =>
    c.json({ pins: await listPins(deps.db, orgOf(c), meOf(c).sub, c.req.param('id')) }));
  chat.post('/rooms/:id/pins/:msgId', async (c) => {
    const r = await pinMessage(deps.db, orgOf(c), meOf(c).sub, c.req.param('id'), c.req.param('msgId'));
    await emitRoom(c, c.req.param('id'), WsEventType.DATA_CHANGED, { what: 'pin', messageId: c.req.param('msgId') });
    return c.json(r, 201);
  });
  chat.delete('/rooms/:id/pins/:msgId', async (c) => {
    const r = await unpinMessage(deps.db, orgOf(c), meOf(c).sub, c.req.param('id'), c.req.param('msgId'));
    await emitRoom(c, c.req.param('id'), WsEventType.DATA_CHANGED, { what: 'unpin', messageId: c.req.param('msgId') });
    return c.json(r);
  });

  // ── sửa / thu hồi ──
  chat.patch('/rooms/:id/messages/:msgId', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const msg = await editMessage(deps.db, orgOf(c), meOf(c).sub, c.req.param('id'), c.req.param('msgId'), String(body.body ?? ''));
    await emitRoom(c, c.req.param('id'), WsEventType.DATA_CHANGED, { what: 'edited', message: msg });
    return c.json({ message: msg });
  });
  chat.delete('/rooms/:id/messages/:msgId', async (c) => {
    const me = meOf(c);
    const msg = await recallMessage(deps.db, orgOf(c), me.sub, c.req.param('id'), c.req.param('msgId'), me.role);
    await emitRoom(c, c.req.param('id'), WsEventType.DATA_CHANGED, { what: 'recalled', messageId: msg.id });
    return c.json({ message: msg });
  });

  // ── file ──
  chat.post('/rooms/:id/files', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const msg = await sendFileMessage(deps.db, orgOf(c), meOf(c).sub, c.req.param('id'),
      { fileName: String(body.fileName ?? ''), mime: String(body.mime ?? ''), dataB64: String(body.dataB64 ?? '') },
      body.caption ? String(body.caption) : undefined);
    await emitRoom(c, c.req.param('id'), WsEventType.CHAT_MESSAGE, { message: msg });
    return c.json({ message: msg }, 201);
  });
  chat.get('/attachments/:attId', async (c) => {
    const att = await getAttachment(deps.db, orgOf(c), meOf(c).sub, c.req.param('attId'));
    const buf = Buffer.from(att.dataB64, 'base64');
    return new Response(buf, {
      headers: {
        'Content-Type': att.mime,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
        'Content-Length': String(buf.length),
      },
    });
  });

  // ── typing indicator (WS broadcast, không lưu DB) ──
  chat.post('/rooms/:id/typing', async (c) => {
    await emitRoom(c, c.req.param('id'), WsEventType.PRESENCE, { what: 'typing', userId: meOf(c).sub });
    return c.json({ ok: true });
  });

  // ── channel phòng ban (sync từ Soul-Manager) ──
  chat.post('/departments/sync', async (c) => {
    const me = meOf(c);
    if (!['owner', 'super_admin', 'manager'].includes(me.role)) return c.json({ error: { code: 'FORBIDDEN', message: 'Cần quyền manager trở lên' } }, 403);
    const r = await syncDepartmentChannels(deps.db, orgOf(c), me.sub);
    await deps.audit?.(c, { action: 'chat.departments.sync', detail: r });
    return c.json(r);
  });

  // ── read-all (compliance): CHỈ owner/super_admin, mọi lượt xem ghi audit ──
  chat.get('/admin/rooms', async (c) => {
    const me = meOf(c);
    if (!['owner', 'super_admin'].includes(me.role)) return c.json({ error: { code: 'FORBIDDEN', message: 'Chỉ owner/super_admin' } }, 403);
    const includeDirect = c.req.query('includeDirect') === 'true';
    const rooms = await readAllRooms(deps.db, orgOf(c), { includeDirect });
    await deps.audit?.(c, { action: 'chat.admin.read_all_rooms', detail: { includeDirect, count: rooms.length } });
    return c.json({ rooms });
  });
  chat.get('/admin/rooms/:id/messages', async (c) => {
    const me = meOf(c);
    if (!['owner', 'super_admin'].includes(me.role)) return c.json({ error: { code: 'FORBIDDEN', message: 'Chỉ owner/super_admin' } }, 403);
    const msgs = await readAllMessages(deps.db, orgOf(c), c.req.param('id'));
    await deps.audit?.(c, { action: 'chat.admin.read_room_messages', resource: 'chat_room', resourceId: c.req.param('id'), detail: { count: msgs.length } });
    return c.json({ messages: msgs });
  });
}
