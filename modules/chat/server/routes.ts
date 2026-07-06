// Chat HTTP routes — tenant-scoped; on new message, emit a WS event via the bus bridge.
import { Hono, type MiddlewareHandler } from 'hono';
import { AppError, WsEventType, type WsEvent, type JwtPayload } from '@citadel/core';
import { createRoom, listRooms, listMessages, sendMessage, markRead } from './service.js';
import { mountChatV2Routes } from './routes-v2.js';

type Emit = (ev: WsEvent) => Promise<void> | void;

/** Build chat routes. `deps.db` = drizzle instance, `deps.emit` = WS publish bridge. */
declare module 'hono' {
  interface ContextVariableMap { auth: JwtPayload; }
}

type Mw = MiddlewareHandler;
const orgOf = (c: any): string => (c.get('auth') as JwtPayload).orgId;

export function buildChatRoutes(deps: { db: any; emit?: Emit; requireAuth: Mw; audit?: (c: any, e: { action: string; resource?: string; resourceId?: string; detail?: unknown }) => Promise<void> }) {
  const chat = new Hono();

  chat.onError((err, c) => {
    if (err instanceof AppError) return c.json(err.toJSON(), err.status as 400);
    console.error('[chat] unhandled', err);
    return c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500);
  });

  chat.use('*', deps.requireAuth);

  // list my rooms
  chat.get('/rooms', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    return c.json({ rooms: await listRooms(deps.db, orgOf(c), auth.sub) });
  });

  // create room
  chat.post('/rooms', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    const body = await c.req.json().catch(() => ({}));
    const room = await createRoom(deps.db, orgOf(c), auth.sub, {
      name: body.name, isGroup: body.isGroup, memberIds: body.memberIds ?? [],
    });
    return c.json({ room }, 201);
  });

  // list messages in a room
  chat.get('/rooms/:id/messages', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    const msgs = await listMessages(deps.db, orgOf(c), auth.sub, c.req.param('id'));
    return c.json({ messages: msgs });
  });

  // send message → persist → emit WS event
  chat.post('/rooms/:id/messages', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    const roomId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const msg = await sendMessage(deps.db, orgOf(c), auth.sub, roomId, String(body.body ?? ''), body.replyToId ? String(body.replyToId) : undefined);
    const ev: WsEvent = {
      type: WsEventType.CHAT_MESSAGE,
      orgId: orgOf(c),
      payload: { roomId, message: msg },
      ts: Date.now(),
    };
    if (deps.emit) await deps.emit(ev);
    return c.json({ message: msg }, 201);
  });

  // mark room read
  chat.put('/rooms/:id/read', async (c) => {
    const auth = c.get('auth') as JwtPayload;
    return c.json(await markRead(deps.db, orgOf(c), auth.sub, c.req.param('id')));
  });

  // R11.5 enterprise: unread/search/room-mgmt/reaction/pin/edit/recall/file/typing/dept-sync/read-all
  mountChatV2Routes(chat, { db: deps.db, emit: deps.emit, audit: deps.audit });

  return chat;
}
