// Tiểu Tâm HTTP routes — V7A P2: hồn tách động cơ + mood/energy.
// buildTieuTamRoutes: chat qua Context Assembler (một cổng) → EngineAdapter (đổi model = gạt công tắc),
// energy tick mỗi lượt, học chảy ngược về hồn sau mỗi hội thoại.
// Legacy export `tieuTam` (stub không DB) giữ cho các script audit cũ.
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  getProvider, type ChatContext,
  buildWorkProfile, getEngine, ENGINE_NAMES, type EngineMessage,
  getSoulState, tickEnergy, setEngine, setTieuTamSettings, learnFromMessage, recall, forget,
  detectIntent, STATUS_LABEL, STATUS_MESSAGE, isBetaMode,
} from '@citadel/tieu-tam';
import { ACTION_TOOLS, detectAction, executeAction } from './actions.js';
import { createItem } from '@citadel/module-inventory/server/service.js';
import { createEmployee } from '@citadel/module-hr/server/service-v2.js';
import { requireAuth as defaultRequireAuth, orgOf } from '../auth/middleware.js';
import { AppError, Errors } from '@citadel/core';
import { securityLevelOf } from '../security/service.js';
import type { AuditFn } from '../audit/service.js';
import { ttChatMessages, ttFiles } from '@citadel/db';
import * as XLSX from 'xlsx';
import { and, eq, desc } from 'drizzle-orm';

/** R7.6: lịch sử hội thoại bền vững — lấy N lượt gần nhất (cũ → mới). */
async function loadChatHistory(db: any, orgId: string, userId: string, limit = 20) {
  const rows = await db.select().from(ttChatMessages)
    .where(and(eq(ttChatMessages.orgId, orgId), eq(ttChatMessages.userId, userId)))
    .orderBy(desc(ttChatMessages.createdAt)).limit(limit);
  return rows.reverse();
}

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB (ảnh hóa đơn chụp thường 2-5MB)
const tabularExt = new Set(['.xlsx', '.csv', '.txt', '.tsv']);
const imageExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const docExt = new Set(['.pdf', '.md', '.json']);
const blockedExt = new Set(['.exe', '.bat', '.cmd', '.sh', '.com', '.msi', '.scr', '.dll', '.js', '.vbs', '.ps1']);
const imageMime: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
function extOf(filename: string) { const m = /\.[^.]+$/.exec(filename.toLowerCase()); return m?.[0] ?? ''; }
function parseDelimited(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 501);
  const sep = lines[0]?.includes(';') ? ';' : ',';
  const headers = (lines.shift() ?? '').split(sep).map((h) => h.trim());
  return lines.map((ln) => Object.fromEntries(ln.split(sep).map((v, i) => [headers[i] || `col${i+1}`, v.trim()])));
}
function parseRows(filename: string, bytes: Uint8Array, mime = '') {
  const ext = extOf(filename);
  if (blockedExt.has(ext)) throw Errors.validation('Loại file này bị chặn vì an toàn', 'file');
  // ẢNH — lưu base64, Tiểu Tâm "nhìn" bằng vision của model não.
  if (imageExt.has(ext) || (mime || '').startsWith('image/')) {
    const m = imageMime[ext] || mime || 'image/png';
    const dataB64 = Buffer.from(bytes).toString('base64');
    return { kind: 'image', rows: [], dataB64, dataMime: m, summary: `Ảnh ${ext.slice(1) || 'image'} (${Math.round(bytes.byteLength / 1024)}KB) — Tiểu Tâm đọc được nội dung/chữ trong ảnh` };
  }
  // PDF — lưu base64 (để về sau OCR/vision); trước mắt báo đã nhận.
  if (ext === '.pdf' || (mime || '') === 'application/pdf') {
    const dataB64 = Buffer.from(bytes).toString('base64');
    return { kind: 'pdf', rows: [], dataB64, dataMime: 'application/pdf', summary: `Tài liệu PDF (${Math.round(bytes.byteLength / 1024)}KB)` };
  }
  // BẢNG — xlsx/csv/txt/tsv/json/md
  if (tabularExt.has(ext) || docExt.has(ext)) {
    let rows: any[] = [];
    if (ext === '.xlsx') {
      const wb = XLSX.read(bytes, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' }).slice(0, 500) as any[];
    } else if (ext === '.json') {
      try { const j = JSON.parse(new TextDecoder().decode(bytes)); rows = Array.isArray(j) ? j.slice(0, 500) : [j]; } catch { rows = []; }
    } else rows = parseDelimited(new TextDecoder().decode(bytes)).slice(0, 500);
    const cols = Object.keys(rows[0] ?? {});
    return { kind: ext.slice(1) || 'txt', rows, summary: `${rows.length} dòng, cột: ${cols.join(', ') || 'không có'}` };
  }
  throw Errors.validation('Loại file chưa hỗ trợ — nhận: ảnh (jpg/png/webp/gif), bảng (xlsx/csv/txt/tsv/json), pdf', 'file');
}
const pick = (row:any, names:string[]) => { for (const n of names) { const k = Object.keys(row).find((x)=>x.toLowerCase().trim()===n.toLowerCase()); if (k && row[k] !== '') return row[k]; } return undefined; };
async function getFile(db:any, orgId:string, userId:string, id:string) {
  const [f] = await db.select().from(ttFiles).where(and(eq(ttFiles.id, id), eq(ttFiles.orgId, orgId), eq(ttFiles.userId, userId))).limit(1);
  if (!f) throw Errors.notFound('Không tìm thấy file'); return f;
}
async function importRows(db:any, orgId:string, userId:string, fileId:string, target:string, confirm:boolean) {
  const f = await getFile(db, orgId, userId, fileId); const rows:any[] = (f.rowsJson as any)?.rows ?? [];
  const preview = rows.map((r,i)=>({ line:i+2, name: pick(r,['Tên','Họ tên','Tên hàng','name','fullName','Khách hàng']), qty: pick(r,['SL','Số lượng','qty']), unit: pick(r,['ĐVT','unit']) })).slice(0,20);
  if (!confirm) return { ok:true, dryRun:true, message:`Xem trước nhập ${rows.length} dòng từ ${f.filename} vào ${target}. Bấm xác nhận để chạy thật.`, preview, pendingAction:{ name:'file.import_rows', params:{fileId,target} } };
  const created:any[]=[]; const errors:any[]=[];
  for (const [idx,r] of rows.entries()) try {
    if (target === 'inventory') created.push(await createItem(db, orgId, { name:String(pick(r,['Tên hàng','Tên','name'])||`Dòng ${idx+2}`), qty:Number(pick(r,['SL','Số lượng','qty'])||0), unit:String(pick(r,['ĐVT','unit'])||'cái'), lowThreshold:Number(pick(r,['Ngưỡng','threshold'])||5) }));
    else if (target === 'hr_employees') created.push(await createEmployee(db, orgId, { fullName:String(pick(r,['Họ tên','Tên','fullName','name'])||`Nhân viên ${idx+2}`), roleTitle:String(pick(r,['Vị trí','Phòng ban','roleTitle'])||''), phone:String(pick(r,['SĐT','Điện thoại','phone'])||''), joinedDate:new Date().toISOString().slice(0,10) }));
    else if (target.startsWith('k10a')) created.push({ row: idx+2, note:'K10A import preview-safe: dùng endpoint/actions K10A để ghi chứng từ sau khi map chi tiết' });
    else throw new Error('Target không hỗ trợ');
  } catch(e:any){ errors.push({ line:idx+2, message:e?.message||String(e) }); }
  return { ok: errors.length===0, message:`Đã nhập ${created.length}/${rows.length} dòng từ ${f.filename}`, created:created.length, errors };
}

async function saveChatTurn(db: any, orgId: string, userId: string, userText: string, aiText: string) {
  try {
    await db.insert(ttChatMessages).values([
      { orgId, userId, role: 'user', content: userText },
      { orgId, userId, role: 'assistant', content: aiText },
    ]);
  } catch (e) { console.warn('[tieu-tam] save chat history failed', e); }
}

/** Lượt "nặng" = câu hỏi nghiệp vụ (tool/dữ liệu); "nhẹ" = chào hỏi/tán gẫu. */
function loadOf(message: string): 'light' | 'heavy' {
  const intent = detectIntent(message);
  return intent === 'greeting' || intent === 'unknown' ? 'light' : 'heavy';
}

export interface TieuTamDeps {
  db: any;
  requireAuth?: typeof defaultRequireAuth;
  audit?: AuditFn;
}

export function buildTieuTamRoutes({ db, requireAuth = defaultRequireAuth, audit }: TieuTamDeps) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json(err.toJSON(), err.status as 400);
    console.error('[tieu-tam] unhandled', err);
    return c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500);
  });

  app.use('*', requireAuth);

  /** Trạng thái hồn: mood + energy + status + engine (G2). */
  app.get('/state', async (c) => {
    const auth = c.get('auth');
    const s = await getSoulState(db, orgOf(c), auth.sub);
    return c.json({
      mood: s.mood,
      energy: Math.round(s.energy),
      status: s.status,
      statusLabel: STATUS_LABEL[s.status],
      statusMessage: STATUS_MESSAGE[s.status],
      engine: s.engine,
      theme: s.theme,
      betaMode: s.betaMode,
      personaMode: s.personaMode,
      proactive: s.proactive,
    });
  });



  /** R11.2: Settings thật cho Tiểu Tâm — persona mode + proactive preference. */
  app.get('/settings', async (c) => {
    const auth = c.get('auth');
    const s = await getSoulState(db, orgOf(c), auth.sub);
    return c.json({ personaMode: s.personaMode, proactive: s.proactive, proactiveNote: s.proactive ? 'Gợi ý chủ động đang bật (preference đã lưu).' : 'Gợi ý chủ động đang tắt (preference đã lưu).' });
  });

  app.patch('/settings', async (c) => {
    const auth = c.get('auth');
    const b = await c.req.json().catch(() => ({}));
    const patch: { personaMode?: string; proactive?: boolean } = {};
    if (b.personaMode !== undefined) {
      const mode = String(b.personaMode);
      if (!['friendly', 'professional', 'concise', 'playful'].includes(mode)) throw Errors.validation('Chế độ tính cách không hợp lệ', 'personaMode');
      patch.personaMode = mode;
    }
    if (b.proactive !== undefined) patch.proactive = !!b.proactive;
    if (patch.personaMode === undefined && patch.proactive === undefined) throw Errors.validation('Không có setting hợp lệ để lưu', 'settings');
    const prev = await getSoulState(db, orgOf(c), auth.sub);
    const s = await setTieuTamSettings(db, orgOf(c), auth.sub, patch);
    await audit?.(c, { action: 'tieu_tam.settings_change', resource: 'tt_soul_state', resourceId: auth.sub, detail: { from: { personaMode: prev.personaMode, proactive: prev.proactive }, to: patch } });
    return c.json({ ok: true, personaMode: s.personaMode, proactive: s.proactive, message: 'Đã lưu cài đặt Tiểu Tâm' });
  });

  /** Trí nhớ — "Em nhớ gì về mình" (V7A P5 — G9). Luôn filter org + user (hiến pháp #1). */
  app.get('/memories', async (c) => {
    const auth = c.get('auth');
    const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 100);
    const rows = await recall(db, orgOf(c), auth.sub, undefined, limit);
    return c.json({
      memories: rows.map((m) => ({
        id: m.id, kind: m.kind, content: m.content, salience: m.salience, createdAt: m.createdAt,
      })),
      total: rows.length,
    });
  });

  /** Xóa một mảnh trí nhớ — người dùng làm chủ trí nhớ của mình. Audit tieu_tam.memory_delete. */
  app.delete('/memories/:id', async (c) => {
    const auth = c.get('auth');
    const id = c.req.param('id');
    const removed = await forget(db, orgOf(c), auth.sub, id);
    if (!removed) throw Errors.notFound('Không tìm thấy mảnh trí nhớ này');
    await audit?.(c, { action: 'tieu_tam.memory_delete', resource: 'tt_memories', resourceId: removed.id, detail: { kind: removed.kind, content: removed.content } });
    return c.json({ ok: true, message: 'Em đã quên chuyện đó rồi nha 🦊' });
  });

  /** Đổi động cơ — gạt công tắc (nguyên tắc 5). Hồn (trí nhớ + persona) giữ nguyên. */
  app.patch('/engine', async (c) => {
    const auth = c.get('auth');
    const body = await c.req.json().catch(() => ({}));
    const engine = String(body.engine ?? '');
    if (!ENGINE_NAMES.includes(engine))
      throw Errors.validation(`Động cơ không hợp lệ — chọn: ${ENGINE_NAMES.join(', ')}`, 'engine');
    const prev = await getSoulState(db, orgOf(c), auth.sub);
    const s = await setEngine(db, orgOf(c), auth.sub, engine);
    await audit?.(c, { action: 'tieu_tam.engine_change', resource: 'tt_soul_state', resourceId: auth.sub, detail: { from: prev.engine, to: engine } });
    return c.json({ ok: true, engine: s.engine, message: `Đã chuyển động cơ sang ${engine} — trí nhớ và tính cách của em vẫn nguyên vẹn nha.` });
  });


  app.post('/files', async (c) => {
    const auth = c.get('auth'); let filename='', mime='', bytes:Uint8Array;
    const ct = c.req.header('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      const body:any = await c.req.parseBody(); const file:any = body.file;
      if (!file) throw Errors.validation('Thiếu file upload', 'file');
      filename = file.name || 'upload.xlsx'; mime = file.type || ''; bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const b:any = await c.req.json().catch(()=>({})); filename = String(b.filename||'upload.txt'); mime = String(b.mime||'');
      if (!b.fileBase64) throw Errors.validation('Thiếu fileBase64', 'fileBase64'); bytes = new Uint8Array(Buffer.from(String(b.fileBase64), 'base64'));
    }
    if (bytes.byteLength > MAX_FILE_BYTES) throw Errors.validation('File vượt quá 5MB', 'file');
    // Caption kèm file (form field 'caption' hoặc json 'caption')
    let caption = '';
    if (ct.includes('multipart/form-data')) { try { const bb:any = await c.req.parseBody(); caption = String(bb.caption || ''); } catch {} }
    const parsed = parseRows(filename, bytes, mime);
    const rowsJson: any = (parsed as any).dataB64
      ? { rows: [], dataB64: (parsed as any).dataB64, dataMime: (parsed as any).dataMime }
      : { rows: parsed.rows };
    const [row] = await db.insert(ttFiles).values({ orgId:orgOf(c), userId:auth.sub, filename, mime: mime || (parsed as any).dataMime || '', kind:parsed.kind, rowsJson, summary:parsed.summary }).returning();
    // Ghi lượt chat: để Tiểu Tâm nhớ đã nhận file này trong lịch sử hội thoại.
    const userNote = caption ? `📎 ${filename} — ${caption}` : `📎 Đã gửi file: ${filename}`;
    const aiNote = `Đã nhận file "${filename}" (${parsed.kind}). ${parsed.summary}`;
    await saveChatTurn(db, orgOf(c), auth.sub, userNote, aiNote);
    await audit?.(c, { action:'tieu_tam.file_upload', resource:'tt_files', resourceId:row.id, detail:{ filename, summary:parsed.summary, caption } });
    return c.json({ ok:true, caption, file:{ id:row.id, filename, kind:parsed.kind, summary:parsed.summary, sample:parsed.rows.slice(0,5) } }, 201);
  });
  app.get('/files', async (c) => { const auth=c.get('auth'); const rows=await db.select().from(ttFiles).where(and(eq(ttFiles.orgId,orgOf(c)),eq(ttFiles.userId,auth.sub))).orderBy(desc(ttFiles.createdAt)).limit(Math.min(Number(c.req.query('limit')??20),50)); return c.json({ files: rows.map((f:any)=>({ id:f.id, filename:f.filename, kind:f.kind, summary:f.summary, createdAt:f.createdAt })) }); });
  app.get('/files/:id', async (c) => { const auth=c.get('auth'); const f=await getFile(db,orgOf(c),auth.sub,c.req.param('id')); return c.json({ file:f }); });
  app.delete('/files/:id', async (c) => { const auth=c.get('auth'); await db.delete(ttFiles).where(and(eq(ttFiles.id,c.req.param('id')),eq(ttFiles.orgId,orgOf(c)),eq(ttFiles.userId,auth.sub))); await audit?.(c,{ action:'tieu_tam.file_delete', resource:'tt_files', resourceId:c.req.param('id') }); return c.json({ ok:true }); });
  app.post('/files/:id/import', async (c) => { const auth=c.get('auth'); const b:any=await c.req.json().catch(()=>({})); const r=await importRows(db, orgOf(c), auth.sub, c.req.param('id'), String(b.target||'inventory'), !!b.confirm); await audit?.(c,{ action:b.confirm?'tieu_tam.file_import':'tieu_tam.file_import_dryrun', resource:'tt_files', resourceId:c.req.param('id'), detail:{ target:b.target, result:r } }); return c.json(r); });

  /** Một lượt chat: tick energy → (từ chối nếu kiệt sức + việc nặng) → assembler → engine → học ngược về hồn. */
  async function runChat(c: any, message: string, opts: { confirm?: boolean; pendingAction?: any } = {}) {
    const auth = c.get('auth');
    const orgId = orgOf(c);
    const tick = await tickEnergy(db, orgId, auth.sub, loadOf(message));
    if (tick.refused) {
      return {
        reply: { text: tick.note ?? STATUS_MESSAGE.kiet_suc, suggestions: ['Cho em ăn gì đó', 'Tám chuyện nhẹ thôi'], mode: 'stub' as const },
        tick, refused: true,
      };
    }
    // Không dùng ILIKE nguyên câu (sẽ miss) — lấy top memories, adapter tự khớp token.
    const profile = await buildWorkProfile(db, orgId, auth.sub, { memoryLimit: 30 });
    const engine = getEngine(profile.engine);
    // R7.6: multi-turn context — nạp ~10 lượt gần nhất để Tiểu Tâm nhớ câu trước
    const history = await loadChatHistory(db, orgId, auth.sub, 20).catch(() => []);
    // Ghi nhớ file vừa gửi: nạp 3 file gần nhất vào ngữ cảnh để Tiểu Tâm biết "file nào, làm gì".
    const recentFiles = await db.select().from(ttFiles)
      .where(and(eq(ttFiles.orgId, orgId), eq(ttFiles.userId, auth.sub)))
      .orderBy(desc(ttFiles.createdAt)).limit(3).catch(() => []);
    const fileCtx: EngineMessage[] = [];
    const newest = recentFiles[0];
    if (recentFiles.length) {
      fileCtx.push({ role: 'system', content: 'File người dùng đã tải lên gần đây (mới nhất trước): ' + recentFiles.map((f: any) => `"${f.filename}" (${f.kind}, id=${f.id}) — ${f.summary}`).join(' | ') + '. Khi người dùng nói "file vừa gửi/ảnh này/file trên", hiểu là file mới nhất. Bảng có thể nhập vào kho (inventory), nhân sự (hr_employees), hoặc hoá đơn K10A. Với ảnh: đọc nội dung/chữ trong ảnh (hóa đơn chụp, danh sách viết tay, số liệu…) rồi trích xuất / tạo chứng từ theo yêu cầu.' });
      // ĐỌa full NỘI DUNG bảng của file mới nhất vào context (không chỉ tóm tắt) — để Tiểu Tâm đọc được từng dòng.
      const tableFile = recentFiles.find((f: any) => Array.isArray((f.rowsJson as any)?.rows) && (f.rowsJson as any).rows.length);
      if (tableFile) {
        const rows = (tableFile.rowsJson as any).rows as any[];
        const cols = Object.keys(rows[0] ?? {});
        const MAXR = 200;
        const shown = rows.slice(0, MAXR);
        const tsv = [cols.join('\t'), ...shown.map((r) => cols.map((k) => String(r[k] ?? '')).join('\t'))].join('\n');
        const more = rows.length > MAXR ? `\n…(còn ${rows.length - MAXR} dòng nữa, tổng ${rows.length})` : '';
        // ĐẶT DATA DƯỚI DẠNG USER MESSAGE (mạnh hơn system + phá pattern "chưa đọc được" cũ trong lịch sử).
        fileCtx.push({ role: 'user', content: `[Dữ liệu file đính kèm — "${tableFile.filename}", ${rows.length} dòng, bảng TSV dòng đầu là tiêu đề cột]\n${tsv}${more}` });
        fileCtx.push({ role: 'assistant', content: `Em đã đọc xong toàn bộ ${rows.length} dòng trong "${tableFile.filename}" và nắm rõ từng dòng rồi ạ. Mình cần em liệt kê, tính tổng, lọc hay nhập vào đâu thì cứ nói nha.` });
        fileCtx.push({ role: 'system', content: `Nhắc: bạn ĐÃ CÓ đầy đủ dữ liệu bảng ở trên. TUYỆT ĐỐI KHÔNG nói "chưa đọc được"/"chỉ thấy cấu trúc/tóm tắt" hay bảo người dùng copy/chụp lại. Đọc và tính trực tiếp trên bảng đó.` });
      }
      // Đính ảnh vào message vision CHẈ KHI file mới nhất là ảnh (tránh lấn át khi vừa gửi bảng).
      const img = (newest && newest.kind === 'image' && (newest.rowsJson as any)?.dataB64) ? newest : null;
      if (img) {
        const rj = img.rowsJson as any;
        fileCtx.push({ role: 'user', content: [
          { type: 'text', text: `[Ảnh đính kèm: ${img.filename}]` },
          { type: 'image_url', image_url: { url: `data:${rj.dataMime || img.mime || 'image/png'};base64,${rj.dataB64}` } },
        ] });
      }
    }
    const messages: EngineMessage[] = [
      ...fileCtx,
      ...history.map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      // chặn lặp hành động: model thấy yêu cầu cũ trong lịch sử dễ gọi tool lần nữa → duplicate DB
      ...(history.length ? [{ role: 'system' as const, content: 'Lưu ý: mọi yêu cầu/hành động trong lịch sử hội thoại phía trên ĐÃ ĐƯỢC THỰC HIỆN XONG. Chỉ dùng lịch sử để nhớ ngữ cảnh. Chỉ thực hiện hành động (gọi tool) cho tin nhắn MỚI NHẤT dưới đây.' }] : []),
      { role: 'user', content: message },
    ];
    const actionCtx = { db, orgId, userId: auth.sub, role: auth.role, securityLevel: await securityLevelOf(db, auth), audit: audit ? (e: any) => audit(c, e) : undefined };
    const direct = opts.confirm && opts.pendingAction ? opts.pendingAction : detectAction(message);
    let actionResults: any[] = [];
    let reply: any;
    if (direct) {
      const r = await executeAction(actionCtx, direct.name, direct.params, { confirm: !!opts.confirm });
      actionResults = [r];
      reply = { text: r.message + ' ✓', mode: 'live' as const };
    } else {
      try {
        reply = await engine.complete(profile, messages, { tools: ACTION_TOOLS, toolChoice: 'auto' });
      } catch (err) {
        console.warn('[tieu-tam] live chat failed, retrying once', err);
        try {
          reply = await engine.complete(profile, messages, { tools: ACTION_TOOLS, toolChoice: 'auto' });
        } catch (err2) {
          console.error('[tieu-tam] live chat failed after retry', err2);
          reply = {
            text: 'Em đang nghẽn kết nối AI, thử lại sau nhé — các lệnh nghiệp vụ (tạo phiếu, thêm khách, nhập kho...) vẫn chạy bình thường.',
            suggestions: ['Tạo phiếu thu', 'Thêm khách hàng', 'Nhập kho'],
            mode: 'live' as const,
          };
        }
      }
      const calls = (reply as any).rawMessage?.tool_calls ?? [];
      if (Array.isArray(calls) && calls.length) {
        for (const tc of calls.slice(0, 5)) {
          const name = tc.function?.name;
          const args = JSON.parse(tc.function?.arguments || '{}');
          const r = await executeAction(actionCtx, name, args);
          actionResults.push(r);
          messages.push({ role: 'assistant', content: reply.text || '', tool_calls: [tc] } as any);
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify(r) } as any);
        }
        const final = await engine.complete(profile, messages, { toolChoice: 'none' });
        reply = { ...final, text: final.text || actionResults.map((r) => r.message).join(' · ') + ' ✓' };
      }
    }
    // học chảy ngược về hồn (best-effort, không gãy chat)
    await learnFromMessage(db, orgId, auth.sub, message);
    // R7.6: lưu lượt chat vào lịch sử bền vững (best-effort)
    await saveChatTurn(db, orgId, auth.sub, message, reply.text ?? '');
    // Mệt → nhắc nhẹ sắp cần nghỉ (không chặn)
    const text = tick.note && tick.state.status === 'met' && !isBetaMode()
      ? `${reply.text}\n\n(${tick.note})`
      : reply.text;
    return { reply: { ...reply, text, toolCalls: actionResults.length ? actionResults.map((r) => ({ tool: r.action, module: r.module, result: r })) : reply.toolCalls }, tick, refused: false };
  }

  /** R7.6: lịch sử hội thoại — FE load khi mở sheet, chat liền mạch như messenger. */
  app.get('/chat/history', async (c) => {
    const auth = c.get('auth');
    const limit = Math.min(Number(c.req.query('limit') ?? 40) || 40, 100);
    const rows = await loadChatHistory(db, orgOf(c), auth.sub, limit);
    return c.json({ messages: rows.map((m: any) => ({ role: m.role, content: m.content, at: m.createdAt })) });
  });

  /** R7.6: xóa lịch sử hội thoại — người dùng làm chủ dữ liệu. */
  app.delete('/chat/history', async (c) => {
    const auth = c.get('auth');
    await db.delete(ttChatMessages).where(and(eq(ttChatMessages.orgId, orgOf(c)), eq(ttChatMessages.userId, auth.sub)));
    await audit?.(c, { action: 'tieu_tam.chat_clear', resource: 'tt_chat_messages' });
    return c.json({ ok: true, message: 'Em đã dọn sạch hội thoại cũ rồi nha 🦊' });
  });

  /** Non-streaming reply. */
  app.post('/chat', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { reply, tick, refused } = await runChat(c, String(body.message ?? ''), { confirm: !!body.confirm, pendingAction: body.pendingAction });
    return c.json({
      ...reply,
      orgId: orgOf(c),
      refused,
      energy: Math.round(tick.state.energy),
      status: tick.state.status,
      mood: tick.state.mood,
    });
  });

  /** Streaming reply (SSE) — kèm event `energy` (tick) để UI cập nhật thanh năng lượng. */
  app.post('/chat/stream', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { reply, tick, refused } = await runChat(c, String(body.message ?? ''), { confirm: !!body.confirm, pendingAction: body.pendingAction });

    return streamSSE(c, async (stream) => {
      // energy tick trước — UI cập nhật ngay
      await stream.writeSSE({
        event: 'energy',
        data: JSON.stringify({ energy: Math.round(tick.state.energy), status: tick.state.status, statusLabel: STATUS_LABEL[tick.state.status], mood: tick.state.mood, refused }),
      });
      // R7.6: token JSON-encode — newline trong text không phá khung SSE (hết leak "data:" trên UI)
      const words = reply.text.split(' ');
      for (const w of words) {
        await stream.writeSSE({ event: 'token', data: JSON.stringify(w + ' ') });
        await stream.sleep(35);
      }
      if (reply.toolCalls?.length)
        await stream.writeSSE({ event: 'tool', data: JSON.stringify(reply.toolCalls) });
      if (reply.suggestions?.length)
        await stream.writeSSE({ event: 'suggestions', data: JSON.stringify(reply.suggestions) });
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ mode: reply.mode, refused }) });
    });
  });

  return app;
}

// ─── Legacy routes (stub, không DB) — giữ cho audit-endpoints.mts / user-journey.mts cũ ───
export const tieuTam = new Hono();
tieuTam.onError((err, c) => {
  if (err instanceof AppError) return c.json(err.toJSON(), err.status as 400);
  console.error('[tieu-tam] unhandled', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500);
});
tieuTam.use('*', defaultRequireAuth);
tieuTam.post('/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ctx: ChatContext = { orgName: body.orgName, userName: body.userName, facts: body.facts };
  const reply = await getProvider().reply(String(body.message ?? ''), ctx);
  return c.json({ ...reply, orgId: orgOf(c) });
});
tieuTam.post('/chat/stream', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ctx: ChatContext = { orgName: body.orgName, userName: body.userName, facts: body.facts };
  const reply = await getProvider().reply(String(body.message ?? ''), ctx);
  return streamSSE(c, async (stream) => {
    const words = reply.text.split(' ');
    for (const w of words) {
      await stream.writeSSE({ event: 'token', data: w + ' ' });
      await stream.sleep(35);
    }
    if (reply.toolCalls?.length)
      await stream.writeSSE({ event: 'tool', data: JSON.stringify(reply.toolCalls) });
    if (reply.suggestions?.length)
      await stream.writeSSE({ event: 'suggestions', data: JSON.stringify(reply.suggestions) });
    await stream.writeSSE({ event: 'done', data: JSON.stringify({ mode: reply.mode }) });
  });
});
