// V7A P4 test — Excel connect kế toán (G7) + giáo trình module = Tiểu Tâm (G6).
// Export xlsx thật (content-type + parse lại + đúng số dòng) · import validate tại cửa (dòng lỗi báo
// đúng số dòng, không tạo rác; dòng hợp lệ tạo invoice + GL cân) · org isolation · Tiểu Tâm trả lời từ docs.
// Chạy: tsx src/v7a-p4.test.ts (PGlite in-memory, không cần Postgres thật)
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { Hono } from 'hono';
import * as XLSX from 'xlsx';
import { AppError, type JwtPayload } from '@citadel/core';
import { auditLogs, users, orgs, schema } from '@citadel/db';
import { buildAccountingRoutes } from '@citadel/module-accounting/server/routes.js';
import { seedChart, createJournal, createInvoice } from '@citadel/module-accounting/server/service.js';
import { accInvoices, accGlEntries } from '@citadel/module-accounting/server/schema.js';
import { trialBalance } from '@citadel/module-accounting/server/reports.js';
import { XLSX_MIME } from '@citadel/module-accounting/server/excel.js';
import { loadModuleDocs, answerFromDocs, clearDocsCache, buildWorkProfile, getEngine } from '@citadel/tieu-tam';
import { makeAudit } from './audit/service.js';
import { buildTieuTamRoutes } from './tieu-tam/routes.js';

function assert(c: unknown, m: string) { if (!c) { console.error('  ✗', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); }

const client = new PGlite();
const mig = (f: string) => readFileSync(new URL(`../../../packages/db/migrations/${f}`, import.meta.url), 'utf8')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;\s*/i, '');
for (const f of ['0001_init.sql', '0002_org_modules.sql', '0003_super_admin.sql', '0004_v7a_p1.sql', '0005_v7a_p2.sql', '0006_v7a_p3.sql']) await client.exec(mig(f));
await client.exec(readFileSync(new URL('../../../modules/accounting/migrations/0001_accounting.sql', import.meta.url), 'utf8'));
const db = drizzle(client, { schema }) as any;

// seed 2 org + 2 user (org isolation)
const [orgA] = await db.insert(orgs).values({ name: 'Org A', slug: 'org-a' }).returning();
const [orgB] = await db.insert(orgs).values({ name: 'Org B', slug: 'org-b' }).returning();
const [userA] = await db.insert(users).values({ orgId: orgA.id, displayName: 'An', role: 'owner' }).returning();
const [userB] = await db.insert(users).values({ orgId: orgB.id, displayName: 'Bình', role: 'owner' }).returning();
const authA: JwtPayload = { sub: userA.id, orgId: orgA.id, role: 'owner' as any };
const authB: JwtPayload = { sub: userB.id, orgId: orgB.id, role: 'owner' as any };

const fakeAuth = (auth: JwtPayload) => async (c: any, next: any) => { c.set('auth', auth); await next(); };
const mkApp = (auth: JwtPayload) => {
  const app = new Hono();
  app.onError((e, c) => e instanceof AppError ? c.json(e.toJSON(), e.status as 400) : (console.error(e), c.json({ error: { code: 'INTERNAL' } }, 500)));
  app.route('/accounting', buildAccountingRoutes({ db, requireAuth: fakeAuth(auth) as any, audit: makeAudit(db) }));
  app.route('/tieu-tam', buildTieuTamRoutes({ db, requireAuth: fakeAuth(auth) as any, audit: makeAudit(db) }));
  return app;
};
const appA = mkApp(authA);
const appB = mkApp(authB);
const D = '2026-06-15';

// ── seed data kế toán org A: chart + 1 journal + 2 invoice ──
await seedChart(db, orgA.id);
await seedChart(db, orgB.id);
await createJournal(db, orgA.id, { postingDate: D, remarks: 'Góp vốn', lines: [{ accountNumber: '111', debit: 10_000_000 }, { accountNumber: '411', credit: 10_000_000 }] });
await createInvoice(db, orgA.id, { invoiceType: 'sales', partyName: 'Cô Hoa', postingDate: D, lines: [{ description: 'Tiệc', qty: 1, rate: 5_000_000 }] });
await createInvoice(db, orgA.id, { invoiceType: 'purchase', partyName: 'NCC Sữa', postingDate: D, lines: [{ description: 'Sữa', qty: 100, rate: 20_000 }] });
// GL org A: 2 dòng journal + 2 dòng/invoice × 2 = 6 dòng

// ══ A) EXPORT XLSX ══
console.log('── Export Excel ──');
let r = await appA.request('/accounting/export/general-ledger.xlsx');
assert(r.status === 200 && r.headers.get('content-type') === XLSX_MIME, 'export GL: 200 + content-type xlsx đúng');
assert((r.headers.get('content-disposition') ?? '').includes('so-cai-gl.xlsx'), 'export GL: content-disposition kèm filename');
let buf = new Uint8Array(await r.arrayBuffer());
let wb = XLSX.read(buf, { type: 'buffer' });
let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
assert(rows.length === 7, `export GL: parse lại được — 1 header + 6 dòng GL (=${rows.length - 1})`);
assert(rows[0].join('|') === 'Số CT|Ngày|TK Nợ|TK Có|Số tiền|Đối tác|Diễn giải', 'export GL: header tiếng Việt đúng chuẩn');
const glSum = rows.slice(1).reduce((s, rr) => s + Number(rr[4] ?? 0), 0);
assert(glSum === 10_000_000 + 5_000_000 + 2_000_000 + 10_000_000 + 5_000_000 + 2_000_000, 'export GL: tổng số tiền các dòng chính xác tuyệt đối');

r = await appA.request('/accounting/export/invoices.xlsx');
buf = new Uint8Array(await r.arrayBuffer());
wb = XLSX.read(buf, { type: 'buffer' });
rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
assert(r.status === 200 && rows.length === 3 && rows[0][0] === 'Loại', 'export invoices: header + 2 hóa đơn');

r = await appA.request('/accounting/export/trial-balance.xlsx');
buf = new Uint8Array(await r.arrayBuffer());
wb = XLSX.read(buf, { type: 'buffer' });
rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
const totalRow = rows.at(-1)!;
assert(totalRow[0] === 'TỔNG' && totalRow[1].includes('SỔ CÂN') && totalRow[2] === totalRow[3], 'export trial-balance: dòng TỔNG — Σ Nợ = Σ Có (sổ cân)');

r = await appA.request('/accounting/export/profit-loss.xlsx');
buf = new Uint8Array(await r.arrayBuffer());
wb = XLSX.read(buf, { type: 'buffer' });
rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
const lastPL = rows.at(-1)!;
assert(r.status === 200 && lastPL[0] === 'LÃI RÒNG' && lastPL[1] === 3_000_000, 'export P&L: lãi ròng 5tr − 2tr = 3tr đúng');

// JSON machine-friendly cho AI
r = await appA.request('/accounting/export/general-ledger.json');
let d = await r.json() as any;
assert(r.status === 200 && d.entries.length === 6 && d.balanced === true && d.sumDebit === d.sumCredit, 'export GL.json: 6 entries + balanced (cầu cho AI trên bảng tính)');
assert(Array.isArray(d.columns) && d.columns.includes('Số CT'), 'export GL.json: kèm columns tiếng Việt');

// org isolation: org B export → không thấy data org A
r = await appB.request('/accounting/export/general-ledger.json');
d = await r.json() as any;
assert(d.entries.length === 0, 'org isolation: org B export GL → 0 dòng (không thấy data org A)');
r = await appB.request('/accounting/export/invoices.xlsx');
buf = new Uint8Array(await r.arrayBuffer());
wb = XLSX.read(buf, { type: 'buffer' });
rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
assert(rows.length === 1, 'org isolation: org B export invoices.xlsx → chỉ header');

// ══ B) IMPORT XLSX ══
console.log('── Import Excel ──');
function mkXlsx(aoa: any[][]): string {
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(aoa), 'HD');
  return Buffer.from(XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' })).toString('base64');
}
const H = { 'Content-Type': 'application/json' };

// file hợp lệ: 2 hóa đơn
const okFile = mkXlsx([
  ['Loại', 'Đối tác', 'Ngày', 'Diễn giải', 'Số lượng', 'Đơn giá'],
  ['bán', 'Anh Tú', '2026-06-16', 'Tiệc 20 người', 1, 8_000_000],
  ['mua', 'NCC Cà Phê', '16/06/2026', 'Cà phê hạt', 10, 150_000],
]);
const invBefore = (await db.select().from(accInvoices).where(eq(accInvoices.orgId, orgA.id))).length;
r = await appA.request('/accounting/import/invoices.xlsx', { method: 'POST', headers: H, body: JSON.stringify({ fileBase64: okFile }) });
d = await r.json() as any;
assert(r.status === 200 && d.created === 2 && d.errors.length === 0, 'import hợp lệ: 2/2 hóa đơn tạo thành công');
assert(/2 hóa đơn thành công, 0 lỗi/.test(d.message), 'import: message tiếng Việt kèm count');
const invAfter = await db.select().from(accInvoices).where(eq(accInvoices.orgId, orgA.id));
assert(invAfter.length === invBefore + 2, 'import: DB thêm đúng 2 invoice');
const tú = invAfter.find((i: any) => i.partyName === 'Anh Tú');
assert(tú && Number(tú.grandTotal) === 8_000_000 && tú.postingDate === '2026-06-16', 'import: hóa đơn Anh Tú 8tr đúng ngày ISO');
const cf = invAfter.find((i: any) => i.partyName === 'NCC Cà Phê');
assert(cf && Number(cf.grandTotal) === 1_500_000 && cf.postingDate === '2026-06-16', 'import: ngày DD/MM/YYYY kiểu VN parse đúng 16/06');
const tb = await trialBalance(db, orgA.id, '2026-01-01', '2026-12-31');
assert(tb.balanced === true, 'import: GL VẪN CÂN sau import (Σ Nợ = Σ Có — postGL tự động)');

// file có dòng lỗi: báo đúng dòng, dòng hợp lệ vẫn vào, dòng lỗi không tạo rác
const mixedFile = mkXlsx([
  ['Loại', 'Đối tác', 'Ngày', 'Diễn giải', 'Số lượng', 'Đơn giá'],
  ['bán', 'Chị Mai', '2026-06-17', 'Bánh kem', 2, 500_000],   // dòng 2: OK
  ['thuê', 'X', '2026-06-17', 'x', 1, 100],                    // dòng 3: loại sai
  ['bán', '', '2026-06-17', 'x', 1, 100],                      // dòng 4: thiếu đối tác
  ['mua', 'Y', 'ngày-mai', 'x', 1, 100],                       // dòng 5: ngày sai
  ['bán', 'Z', '2026-06-17', 'x', -3, 100],                    // dòng 6: qty âm
]);
const glCountBefore = (await db.select().from(accGlEntries).where(eq(accGlEntries.orgId, orgA.id))).length;
r = await appA.request('/accounting/import/invoices.xlsx', { method: 'POST', headers: H, body: JSON.stringify({ fileBase64: mixedFile }) });
d = await r.json() as any;
assert(d.created === 1 && d.errors.length === 4, 'import mixed: 1 thành công + 4 lỗi');
assert(d.errors.some((e: string) => e.startsWith('Dòng 3:') && e.includes('Loại')), 'lỗi báo ĐÚNG dòng 3 (loại sai) tiếng Việt');
assert(d.errors.some((e: string) => e.startsWith('Dòng 4:') && e.includes('đối tác')), 'lỗi báo đúng dòng 4 (thiếu đối tác)');
assert(d.errors.some((e: string) => e.startsWith('Dòng 5:') && e.includes('Ngày')), 'lỗi báo đúng dòng 5 (ngày không hợp lệ)');
assert(d.errors.some((e: string) => e.startsWith('Dòng 6:') && e.includes('Số lượng')), 'lỗi báo đúng dòng 6 (số lượng > 0)');
const glCountAfter = (await db.select().from(accGlEntries).where(eq(accGlEntries.orgId, orgA.id))).length;
assert(glCountAfter === glCountBefore + 2, 'dòng lỗi KHÔNG tạo rác — GL chỉ thêm 2 dòng của 1 hóa đơn hợp lệ');
assert((await trialBalance(db, orgA.id, '2026-01-01', '2026-12-31')).balanced, 'GL vẫn cân sau import mixed');

// file rác + thiếu file
r = await appA.request('/accounting/import/invoices.xlsx', { method: 'POST', headers: H, body: JSON.stringify({ fileBase64: Buffer.from('không phải excel').toString('base64') }) });
d = await r.json() as any;
assert(r.status === 200 && d.created === 0 && d.errors.length >= 1, 'file rác → 0 tạo + lỗi tiếng Việt, không crash');
r = await appA.request('/accounting/import/invoices.xlsx', { method: 'POST', headers: H, body: JSON.stringify({}) });
assert(r.status === 400, 'thiếu file → 400 validate tại cửa');

// audit acc.import_invoices kèm count
const impLogs = await db.select().from(auditLogs).where(and(eq(auditLogs.orgId, orgA.id), eq(auditLogs.action, 'acc.import_invoices')));
assert(impLogs.length === 3 && impLogs.some((l: any) => l.detail?.created === 2 && l.detail?.errors === 0), 'audit acc.import_invoices ghi vết kèm count created/errors');

// ══ C) GIÁO TRÌNH MODULE = TIỂU TÂM ══
console.log('── Giáo trình Tiểu Tâm ──');
clearDocsCache();
const docs = loadModuleDocs(['accounting', 'chat', 'crm', 'hr', 'inventory', 'notification', 'om']);
assert(docs.length === 7, 'loadModuleDocs: đọc đủ 7/7 giáo trình module');
const accDoc = docs.find((x) => x.id === 'accounting')!;
assert(accDoc.steps.length >= 5 && accDoc.examples.length >= 2 && accDoc.summary.includes('sổ cái kép'), 'GUIDE accounting parse đủ: steps + examples + summary');
assert(loadModuleDocs(['module-không-tồn-tại']).length === 0, 'module không có GUIDE → bỏ qua an toàn');

// answerFromDocs trực tiếp
const ans = answerFromDocs('làm sao tạo hóa đơn?', docs);
assert(!!ans && ans.moduleId === 'accounting', 'answerFromDocs: câu hỏi hóa đơn → module accounting');
assert(/Công nợ/.test(ans!.text) && /Tạo hóa đơn/.test(ans!.text), 'câu trả lời chứa BƯỚC THẬT từ GUIDE (tab Công nợ → Tạo hóa đơn)');

// buildWorkProfile mang moduleDocs (accounting luôn có — M0 mặc định)
const wp = await buildWorkProfile(db, orgA.id, userA.id);
assert(wp.moduleDocs.some((x) => x.id === 'accounting'), 'buildWorkProfile: moduleDocs luôn có accounting (M0 mặc định)');

// qua engine (stub) — trả lời help từ docs
const engine = getEngine('stub-a');
const reply = await engine.complete(wp, [{ role: 'user', content: 'làm sao tạo hóa đơn?' }]);
assert(/Công nợ/.test(reply.text) && /hóa đơn/i.test(reply.text), 'engine stub: hỏi "làm sao tạo hóa đơn" → bước từ docs thật');

// qua HTTP endpoint /tieu-tam/chat (full flow)
r = await appA.request('/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'làm sao tạo hóa đơn?' }) });
d = await r.json() as any;
assert(r.status === 200 && /Công nợ/.test(d.text) && /Tạo hóa đơn/.test(d.text), 'Tiểu Tâm qua HTTP: trả lời tạo hóa đơn từ giáo trình');
r = await appA.request('/tieu-tam/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'hướng dẫn cách xuất Excel sổ sách' }) });
d = await r.json() as any;
assert(/Xuất Excel/.test(d.text) || /xlsx/i.test(d.text), 'Tiểu Tâm: hỏi xuất Excel → hướng dẫn nút Xuất Excel từ docs');

console.log('[api/v7a-p4] PASSED');
