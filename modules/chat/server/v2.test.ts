// v2.test.ts (R11.5) — chat enterprise: room mgmt, reaction, pin, edit/recall,
// file, unread, reply, read-all permission. PGlite + Hono, giống integration.test.ts.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import * as chat from './schema.js';
import { buildChatRoutes } from './routes.js';

process.env.JWT_SECRET = 'v2_secret_long_enough_for_hs256_xx';
const SEC = new TextEncoder().encode(process.env.JWT_SECRET);
function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const MINH = '11111111-0000-0000-0000-000000000001';
const LAN = '22222222-0000-0000-0000-000000000002';
const TY = '33333333-0000-0000-0000-000000000003';
const jwt = (sub: string, role = 'staff') => new SignJWT({ orgId: ORG, role }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setIssuedAt().setExpirationTime('1h').sign(SEC);
const requireAuth = async (c: any, next: any) => { const h = c.req.header('Authorization'); if (!h?.startsWith('Bearer ')) return c.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, 401); const { payload } = await jwtVerify(h.slice(7), SEC); c.set('auth', { sub: String(payload.sub), orgId: String(payload.orgId), role: payload.role }); await next(); };

const client = new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_chat.sql', import.meta.url), 'utf8'));
await client.exec(readFileSync(new URL('../migrations/0002_chat_enterprise.sql', import.meta.url), 'utf8'));
const db = drizzle(client, { schema: chat }) as any;
const audits: any[] = [];
const app = new Hono();
app.route('/api/v1/chat', buildChatRoutes({ db, requireAuth, audit: async (_c, e) => { audits.push(e); } }));
const H = async (sub: string, role = 'staff') => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${await jwt(sub, role)}` });
const req = async (m: string, p: string, sub: string, body?: any, role = 'staff') =>
  app.request(`/api/v1/chat${p}`, { method: m, headers: await H(sub, role), ...(body ? { body: JSON.stringify(body) } : {}) });

console.log('[chat/v2] room management');
let r = await req('POST', '/rooms', MINH, { name: 'Kho vận', isGroup: true, memberIds: [LAN] });
const { room } = await r.json();
assert(room.id, 'tạo phòng');
// creator chưa là admin phòng → staff không rename được; owner rename được
r = await req('PATCH', `/rooms/${room.id}`, LAN, { name: 'Hacked' });
assert(r.status === 403, 'staff thường không đổi tên phòng');
r = await req('PATCH', `/rooms/${room.id}`, MINH, { name: 'Kho vận HN' }, 'owner');
assert(r.status === 200 && (await r.json()).room.name === 'Kho vận HN', 'owner đổi tên phòng OK');
r = await req('POST', `/rooms/${room.id}/members`, MINH, { memberIds: [TY] }, 'owner');
assert((await r.json()).added === 1, 'thêm thành viên mới');
r = await req('GET', `/rooms/${room.id}/members`, MINH);
assert((await r.json()).members.length === 3, '3 thành viên trong phòng');
r = await req('PUT', `/rooms/${room.id}/members/${LAN}/role`, MINH, { role: 'admin' }, 'owner');
assert(r.status === 200, 'owner phong Lan làm admin phòng');
r = await req('PATCH', `/rooms/${room.id}`, LAN, { name: 'Kho vận HCM' });
assert(r.status === 200, 'admin phòng (Lan) đổi tên được');

console.log('[chat/v2] messages: reply + edit + recall');
r = await req('POST', `/rooms/${room.id}/messages`, MINH, { body: 'Kiểm kho chiều nay' });
const m1 = (await r.json()).message;
r = await req('POST', `/rooms/${room.id}/messages`, LAN, { body: 'Ok anh', replyToId: m1.id });
const m2 = (await r.json()).message;
assert(m2.replyToId === m1.id, 'reply gắn đúng tin gốc');
r = await req('PATCH', `/rooms/${room.id}/messages/${m2.id}`, LAN, { body: 'Ok anh, 15h nhé' });
assert((await r.json()).message.editedAt, 'sửa tin trong 15 phút OK');
r = await req('PATCH', `/rooms/${room.id}/messages/${m2.id}`, TY, { body: 'hack' });
assert(r.status === 403, 'không sửa được tin người khác');
r = await req('DELETE', `/rooms/${room.id}/messages/${m2.id}`, LAN);
assert((await r.json()).message.deletedAt, 'thu hồi để lại vệt deletedAt');
r = await req('DELETE', `/rooms/${room.id}/messages/${m1.id}`, TY);
assert(r.status === 403, 'staff không thu hồi tin người khác');

console.log('[chat/v2] reaction + pin');
r = await req('POST', `/rooms/${room.id}/messages/${m1.id}/reactions`, LAN, { emoji: '👍' });
assert((await r.json()).toggled === 'on', 'thả reaction');
r = await req('POST', `/rooms/${room.id}/messages/${m1.id}/reactions`, LAN, { emoji: '👍' });
assert((await r.json()).toggled === 'off', 'thả lại = gỡ (toggle)');
await req('POST', `/rooms/${room.id}/messages/${m1.id}/reactions`, TY, { emoji: '🔥' });
r = await req('GET', `/rooms/${room.id}/messages/enrich?ids=${m1.id}`, MINH);
const enr = await r.json();
assert(enr.reactions[m1.id]?.length === 1 && enr.reactions[m1.id][0].emoji === '🔥', 'enrich trả reaction đúng');
r = await req('POST', `/rooms/${room.id}/pins/${m1.id}`, MINH);
assert(r.status === 201, 'ghim tin');
r = await req('GET', `/rooms/${room.id}/pins`, LAN);
assert((await r.json()).pins.length === 1, 'list pin thấy 1 tin');
r = await req('DELETE', `/rooms/${room.id}/pins/${m1.id}`, MINH);
r = await req('GET', `/rooms/${room.id}/pins`, LAN);
assert((await r.json()).pins.length === 0, 'bỏ ghim sạch');

console.log('[chat/v2] file attachment');
const b64 = Buffer.from('bang ke kho quy 3').toString('base64');
r = await req('POST', `/rooms/${room.id}/files`, MINH, { fileName: 'bang-ke.txt', mime: 'text/plain', dataB64: b64 });
const fm = (await r.json()).message;
assert(fm.kind === 'file' && fm.attachment?.id, 'gửi file thành message kind=file');
r = await req('POST', `/rooms/${room.id}/files`, MINH, { fileName: 'virus.exe', mime: 'app/x', dataB64: b64 });
assert(r.status === 400, 'chặn .exe');
r = await req('GET', `/attachments/${fm.attachment.id}`, LAN);
assert(r.status === 200 && (await r.text()) === 'bang ke kho quy 3', 'thành viên tải file đúng nội dung');

console.log('[chat/v2] unread');
await req('POST', `/rooms/${room.id}/messages`, MINH, { body: 'tin mới cho Tý' });
r = await req('GET', '/unread', TY);
const un = (await r.json()).unread;
assert((un[room.id] ?? 0) >= 1, 'Tý có unread > 0');
await req('PUT', `/rooms/${room.id}/read`, TY);
r = await req('GET', '/unread', TY);
assert(((await r.json()).unread[room.id] ?? 0) === 0, 'mark read xong unread về 0');

console.log('[chat/v2] read-all compliance');
r = await req('GET', '/admin/rooms', LAN);
assert(r.status === 403, 'staff bị chặn read-all');
audits.length = 0;
r = await req('GET', '/admin/rooms', MINH, undefined, 'owner');
assert(r.status === 200, 'owner đọc read-all rooms');
r = await req('GET', `/admin/rooms/${room.id}/messages`, MINH, undefined, 'super_admin');
assert(r.status === 200 && (await r.json()).messages.length > 0, 'super_admin đọc tin phòng bất kỳ');
assert(audits.some((a) => a.action === 'chat.admin.read_all_rooms') && audits.some((a) => a.action === 'chat.admin.read_room_messages'), 'mọi lượt read-all đều ghi audit');

console.log('[chat/v2] typing + search');
r = await req('POST', `/rooms/${room.id}/typing`, LAN);
assert(r.status === 200, 'typing endpoint OK');
r = await req('GET', `/search?q=${encodeURIComponent('Kiểm kho')}`, MINH);
assert((await r.json()).messages.length >= 1, 'search thấy tin');

console.log('[chat/v2] PASSED — enterprise chat features work');
