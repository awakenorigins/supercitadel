// user-journey.mts — AUDIT NHƯ NGƯỜI DÙNG THẬT: chuỗi hành động một chủ quán làm trong ngày đầu,
// đúng các bước Mỗ đã thử (tạo ca, xếp người, kho vượt "5", tạo deal...). Mỗi bước assert kết quả thật.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WebSocket } from 'ws';
import * as dbschema from '@citadel/db';
import { AppError } from '@citadel/core';
import { generateToken, hashToken, tokenPrefix } from './auth/token.js';
import { login as authLogin } from './auth/service.js';
import { requireAuth, orgOf } from './auth/middleware.js';
import { tieuTam } from './tieu-tam/routes.js';
import { buildChatRoutes } from '@citadel/module-chat/server/routes.js';
import { buildNotificationRoutes } from '@citadel/module-notification/server/routes.js';
import { buildCrmRoutes } from '@citadel/module-crm/server/routes.js';
import { buildOmRoutes } from '@citadel/module-om/server/routes.js';
import { buildInventoryRoutes } from '@citadel/module-inventory/server/routes.js';
import { buildHrRoutes } from '@citadel/module-hr/server/routes.js';
import { buildModuleRoutes, requireModule } from './modules/routes.js';
import { buildAccountingRoutes } from '@citadel/module-accounting/server/routes.js';
import { startWsServer } from '../../ws/src/index.js';
import { eq } from 'drizzle-orm';

process.env.JWT_SECRET = 'journey_secret_long_enough_hs256_xx';
process.env.LLM_MODE = 'stub';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let STEP = 0; let FAILED = 0;
function step(label: string, ok: boolean, detail = '') {
  STEP++;
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} [${String(STEP).padStart(2, '0')}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) FAILED++;
}

async function main() {
  const pg = new PGlite();
  for (const f of ['packages/db/migrations/0001_init.sql', 'packages/db/migrations/0002_org_modules.sql', 'modules/chat/migrations/0001_chat.sql', 'modules/crm/migrations/0001_crm.sql', 'modules/om/migrations/0001_om.sql', 'modules/notification/migrations/0001_notification.sql', 'modules/inventory/migrations/0001_inventory.sql', 'modules/hr/migrations/0001_hr.sql', 'modules/hr/migrations/0002_hr_v2.sql', 'modules/accounting/migrations/0001_accounting.sql'])
    await pg.exec(readFileSync('/home/claude/citadel-build/' + f, 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, ''));
  const db = drizzle(pg, { schema: dbschema }) as any;

  const [org] = await db.insert(dbschema.orgs).values({ name: 'Quán Của Mỗ', slug: 'mo' }).returning();
  const [owner] = await db.insert(dbschema.users).values({ orgId: org.id, displayName: 'Mỗ (Chủ quán)', role: 'owner' }).returning();
  await db.insert(dbschema.users).values({ orgId: org.id, displayName: 'Lan Phạm', role: 'manager' });
  const tok = generateToken();
  await db.insert(dbschema.tokens).values({ orgId: org.id, userId: owner.id, tokenPrefix: tokenPrefix(tok), tokenHash: await hashToken(tok), role: 'owner' });
  // seed ví 99999 như production
  await pg.exec(`INSERT INTO om_ledger (org_id, delta, reason, module) VALUES ('${org.id}', 99999, 'Cấp Om khởi tạo', 'om')`);

  const PORT = 3902;
  const wsSrv = startWsServer(PORT);
  await wait(150);
  const emit = async (ev: any) => { await fetch(`http://localhost:${PORT}/internal/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) }); };

  const app = new Hono();
  app.use('*', cors());
  app.onError((e, c) => e instanceof AppError ? c.json(e.toJSON(), e.status as 400) : (console.error(e), c.json({ error: { code: 'INTERNAL' } }, 500)));
  app.post('/api/v1/auth/login', async (c) => c.json(await authLogin(db, String((await c.req.json()).token ?? ''))));
  app.route('/api/v1/tieu-tam', tieuTam);
  app.route('/api/v1/chat', buildChatRoutes({ db, emit, requireAuth }));
  app.route('/api/v1/notifications', buildNotificationRoutes({ db, requireAuth }));
  app.route('/api/v1/crm', buildCrmRoutes({ db, requireAuth, gate: requireModule(db, 'crm') } as any));
  app.route('/api/v1/om', buildOmRoutes({ db, requireAuth }));
  app.route('/api/v1/modules', buildModuleRoutes({ db, requireAuth }));
  app.route('/api/v1/inventory', buildInventoryRoutes({ db, requireAuth, gate: requireModule(db, 'inventory') }));
  app.route('/api/v1/hr', buildHrRoutes({ db, requireAuth, gate: requireModule(db, 'hr') }));
  app.route('/api/v1/accounting', buildAccountingRoutes({ db, requireAuth, gate: requireModule(db, 'accounting') }));
  app.get('/api/v1/users', requireAuth, async (c) => {
    const rows = await db.select().from(dbschema.users).where(eq(dbschema.users.orgId, orgOf(c)));
    return c.json({ users: rows.map((u: any) => ({ id: u.id, displayName: u.displayName })) });
  });
  const J = async (r: Response) => ({ st: r.status, d: await r.json().catch(() => ({})) as any });

  console.log('\n━━━ HÀNH TRÌNH: Chủ quán dùng Citadel ngày đầu ━━━\n');

  // ── Bước 1: đăng nhập bằng token ──
  const lg = await J(await app.request('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok }) }));
  step('Đăng nhập bằng token owner', lg.st === 200 && !!lg.d.jwt);
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${lg.d.jwt}` };

  // ── Bước 2: kiểm tra ví ──
  let r = await J(await app.request('/api/v1/om/balance', { headers: H }));
  step('Mở Ví Om thấy 99.999', r.d.balance === 99999, `balance=${r.d.balance}`);

  // ── Bước 3: vào Cửa hàng, mua 3 module ──
  r = await J(await app.request('/api/v1/modules/inventory/purchase', { method: 'POST', headers: H }));
  step('Mua module Kho Hàng (−300)', r.st === 200 && r.d.balance === 99699);
  r = await J(await app.request('/api/v1/modules/hr/purchase', { method: 'POST', headers: H }));
  step('Mua module Nhân Sự (−250)', r.st === 200 && r.d.balance === 99449);
  r = await J(await app.request('/api/v1/modules/crm/purchase', { method: 'POST', headers: H }));
  step('Mua module CRM (−400)', r.st === 200 && r.d.balance === 99049);

  // ── Bước 4: KHO — đúng kịch bản Mỗ nghi "giới hạn 5" ──
  r = await J(await app.request('/api/v1/inventory/items', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Sữa tươi', unit: 'hộp', qty: 50, lowThreshold: 12 }) }));
  const milk = r.d.item;
  step('Kho: thêm "Sữa tươi" SL 50, báo ≤12', r.st === 201 && milk?.qty === 50);
  let cur = milk;
  for (let i = 0; i < 10; i++) { r = await J(await app.request(`/api/v1/inventory/items/${milk.id}/qty`, { method: 'PATCH', headers: H, body: JSON.stringify({ delta: 1 }) })); cur = r.d.item; }
  step('Bấm + mười lần liên tiếp → 60 (KHÔNG giới hạn 5)', cur?.qty === 60, `qty=${cur?.qty}`);
  r = await J(await app.request(`/api/v1/inventory/items/${milk.id}/qty`, { method: 'PATCH', headers: H, body: JSON.stringify({ delta: 940 }) }));
  step('Nhập lô lớn +940 → 1000 (vẫn không giới hạn)', r.d.item?.qty === 1000);
  r = await J(await app.request(`/api/v1/inventory/items/${milk.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ lowThreshold: 3 }) }));
  step('Chạm sửa ngưỡng cảnh báo 12 → 3', r.st === 200 && r.d.item?.lowThreshold === 3);
  r = await J(await app.request('/api/v1/inventory/low-stock', { headers: H }));
  step('1000 hộp > ngưỡng 3 → không còn cảnh báo', r.d.items?.length === 0);

  // ── Bước 5: NHÂN SỰ — đúng kịch bản "ko add dc" ──
  const todayStr = new Date().toISOString().slice(0, 10);
  r = await J(await app.request('/api/v1/hr/shifts', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Ca Tối', shiftDate: todayStr, startTime: '17:00', endTime: '22:00', staff: [] }) }));
  const shift = r.d.shift;
  step('Nhân sự: bấm "Tạo ca" → Ca Tối hôm nay', r.st === 201 && !!shift?.id);
  r = await J(await app.request(`/api/v1/hr/shifts/${shift.id}/staff`, { method: 'PUT', headers: H, body: JSON.stringify({ staff: ['Lan Phạm'] }) }));
  step('Bấm "Xếp người" → thêm Lan', r.d.shift?.staff === 'Lan Phạm');
  r = await J(await app.request(`/api/v1/hr/shifts/${shift.id}/staff`, { method: 'PUT', headers: H, body: JSON.stringify({ staff: ['Lan Phạm', 'Tú Lê', 'Mai Anh'] }) }));
  step('Xếp thêm Tú + Mai (3 người)', r.d.shift?.staff === 'Lan Phạm, Tú Lê, Mai Anh');
  r = await J(await app.request(`/api/v1/hr/shifts/${shift.id}/staff`, { method: 'PUT', headers: H, body: JSON.stringify({ staff: ['Lan Phạm', 'Mai Anh'] }) }));
  step('Chạm chip gỡ Tú khỏi ca', r.d.shift?.staff === 'Lan Phạm, Mai Anh');
  r = await J(await app.request(`/api/v1/hr/shifts?date=${todayStr}`, { headers: H }));
  step('Danh sách ca hôm nay hiện đúng 1 ca', r.d.shifts?.length === 1);

  // ── Bước 6: CRM — tạo và kéo deal qua pipeline ──
  r = await J(await app.request('/api/v1/crm/contacts', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Cô Hoa', tag: 'vip' }) }));
  step('CRM: bấm "+ Khách" → Cô Hoa (vip)', r.st === 201);
  r = await J(await app.request('/api/v1/crm/deals', { method: 'POST', headers: H, body: JSON.stringify({ title: 'HĐ Cô Hoa', valueVnd: 22000000, stage: 'lead' }) }));
  const deal = r.d.deal;
  step('Bấm "+ Deal" 22tr vào cột Liên hệ', r.st === 201 && deal?.stage === 'lead');
  for (const st2 of ['quote', 'negotiation', 'won']) {
    r = await J(await app.request(`/api/v1/crm/deals/${deal.id}/stage`, { method: 'PATCH', headers: H, body: JSON.stringify({ stage: st2 }) }));
  }
  step('Chạm deal 3 lần → lead→quote→negotiation→WON', r.d.deal?.stage === 'won');
  r = await J(await app.request('/api/v1/crm/stats', { headers: H }));
  step('Stats cập nhật: 0 deal mở sau khi won', r.d.openDeals === 0);

  // ── Bước 7: CHAT — bút chì tạo phòng + nhắn + real-time ──
  r = await J(await app.request('/api/v1/users', { headers: H }));
  const lan = r.d.users.find((u: any) => u.displayName.includes('Lan'));
  step('Bút chì: GET /users thấy Lan để chọn', !!lan);
  r = await J(await app.request('/api/v1/chat/rooms', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Trao đổi nhanh', isGroup: false, memberIds: [lan.id] }) }));
  const room = r.d.room;
  step('Tạo phòng với Lan (201)', r.st === 201 && !!room?.id);
  const sock = new WebSocket(`ws://localhost:${PORT}?token=${lg.d.jwt}`);
  await new Promise((res) => sock.once('message', res));
  let wsGot = false; sock.on('message', (d) => { if (JSON.parse(d.toString()).type === 'chat:message') wsGot = true; });
  r = await J(await app.request(`/api/v1/chat/rooms/${room.id}/messages`, { method: 'POST', headers: H, body: JSON.stringify({ body: 'Lan ơi tối nay nhớ đếm kho nhé' }) }));
  await wait(300);
  step('Gửi tin nhắn → WS đẩy real-time', r.st === 201 && wsGot);

  // ── Bước 8: NHÂN SỰ v2 — tuyển người, chấm công, nghỉ phép ──
  r = await J(await app.request('/api/v1/hr/employees', { method: 'POST', headers: H, body: JSON.stringify({ fullName: 'Tú Lê', roleTitle: 'Pha chế' }) }));
  const tu = r.d.employee;
  step('Nhân sự v2: tuyển "Tú Lê" vào làm', r.st === 201 && !!tu?.id);
  r = await J(await app.request('/api/v1/hr/attendance/check-in', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: tu.id }) }));
  step('Tú bấm Check-in đầu giờ', r.st === 201 && r.d.attendance?.status === 'present');
  r = await J(await app.request('/api/v1/hr/attendance/check-out', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: tu.id }) }));
  step('Cuối ca Check-out — hệ tính giờ công', r.st === 200 && r.d.attendance?.checkOut != null);
  r = await J(await app.request('/api/v1/hr/leave/types', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Phép năm', daysPerYear: 12 }) }));
  const pn = r.d.type;
  r = await J(await app.request('/api/v1/hr/leave/allocations', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: tu.id, leaveTypeId: pn.id, year: 2026, days: 12 }) }));
  step('Tạo "Phép năm" + cấp Tú 12 ngày', r.st === 201);
  r = await J(await app.request('/api/v1/hr/leave/applications', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: tu.id, leaveTypeId: pn.id, fromDate: '2026-07-01', toDate: '2026-07-03', reason: 'Về quê' }) }));
  const don = r.d.application;
  step('Tú nộp đơn nghỉ 3 ngày về quê', r.st === 201 && Number(don?.totalDays) === 3);
  r = await J(await app.request(`/api/v1/hr/leave/applications/${don.id}/approve`, { method: 'POST', headers: H }));
  step('Chủ quán bấm Duyệt', r.st === 200 && r.d.application?.status === 'approved');
  r = await J(await app.request(`/api/v1/hr/leave/balance?employeeId=${tu.id}&year=2026`, { headers: H }));
  step('Số dư phép của Tú: 12 − 3 = 9', r.d.balance?.[0]?.remaining === 9, `remaining=${r.d.balance?.[0]?.remaining}`);
  r = await J(await app.request('/api/v1/hr/attendance?date=2026-07-01', { headers: H }));
  step('Bảng công 1/7 tự ghi Tú nghỉ phép', r.d.attendance?.[0]?.status === 'on_leave');
  r = await J(await app.request('/api/v1/hr/leave/applications', { method: 'POST', headers: H, body: JSON.stringify({ employeeId: tu.id, leaveTypeId: pn.id, fromDate: '2026-09-01', toDate: '2026-09-15' }) }));
  step('Xin tiếp 15 ngày khi còn 9 → hệ chặn (409)', r.st === 409);

  // ── Bước 9: KẾ TOÁN — sổ sách ngày đầu ──
  r = await J(await app.request('/api/v1/modules/accounting/purchase', { method: 'POST', headers: H }));
  step('Mua module Kế Toán (−500 Om)', r.st === 200);
  r = await J(await app.request('/api/v1/accounting/chart/seed', { method: 'POST', headers: H }));
  step('Khởi tạo hệ tài khoản VN (14 TK)', r.st === 201 && r.d.accounts?.length === 14);
  r = await J(await app.request('/api/v1/accounting/invoices', { method: 'POST', headers: H, body: JSON.stringify({ invoiceType: 'sales', partyName: 'Cô Hoa', postingDate: new Date().toISOString().slice(0,10), lines: [{ description: 'Tiệc 20 người', qty: 1, rate: 22000000 }] }) }));
  const hd = r.d.invoice;
  step('Xuất hóa đơn bán 22tr cho Cô Hoa', r.st === 201 && Number(hd?.outstanding) === 22000000);
  r = await J(await app.request('/api/v1/accounting/payments', { method: 'POST', headers: H, body: JSON.stringify({ paymentType: 'receive', partyName: 'Cô Hoa', amount: 10000000, invoiceId: hd.id, postingDate: new Date().toISOString().slice(0,10) }) }));
  step('Cô Hoa trả trước 10tr — phiếu thu', r.st === 201);
  r = await J(await app.request('/api/v1/accounting/reports/outstanding?type=sales', { headers: H }));
  step('Sổ công nợ: Cô Hoa còn nợ 12tr', r.d.grandTotal === 12000000);
  r = await J(await app.request('/api/v1/accounting/reports/profit-loss', { headers: H }));
  step('Báo cáo lãi lỗ: doanh thu 22tr ghi nhận', r.d.totalIncome === 22000000);
  r = await J(await app.request('/api/v1/accounting/reports/trial-balance', { headers: H }));
  step('Bảng cân đối thử: SỔ CÂN', r.d.balanced === true);

  // ── Bước 10: hỏi Tiểu Tâm ──
  r = await J(await app.request('/api/v1/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'kho còn gì sắp hết không', userName: 'Mỗ' }) }));
  step('Hỏi Tiểu Tâm về kho → trả lời', r.st === 200 && r.d.text?.length > 0);
  r = await J(await app.request('/api/v1/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'có đơn nghỉ phép nào chờ duyệt không' }) }));
  step('Hỏi Tiểu Tâm về nghỉ phép → intent leave', r.st === 200 && r.d.text?.includes('nghỉ'));
  r = await J(await app.request('/api/v1/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'tháng này lãi lỗ thế nào' }) }));
  step('Hỏi Tiểu Tâm lãi lỗ → intent finance', r.st === 200 && r.d.text?.includes('lãi'));

  sock.close(); await wait(80); await wsSrv.close();
  console.log(`\n━━━ KẾT QUẢ HÀNH TRÌNH: ${STEP - FAILED}/${STEP} bước PASS ${FAILED === 0 ? '— DÙNG ĐƯỢC THẬT TỪ ĐẦU TỚI CUỐI' : '— CÓ BƯỚC GÃY!'} ━━━\n`);
  if (FAILED) process.exit(1);
}
main().catch((e) => { console.error('JOURNEY CRASH:', e); process.exit(1); });
