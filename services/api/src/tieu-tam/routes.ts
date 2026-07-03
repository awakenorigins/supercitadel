// Tiểu Tâm HTTP routes — V7A P2: hồn tách động cơ + mood/energy.
// buildTieuTamRoutes: chat qua Context Assembler (một cổng) → EngineAdapter (đổi model = gạt công tắc),
// energy tick mỗi lượt, học chảy ngược về hồn sau mỗi hội thoại.
// Legacy export `tieuTam` (stub không DB) giữ cho các script audit cũ.
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  getProvider, type ChatContext,
  buildWorkProfile, getEngine, ENGINE_NAMES, type EngineMessage,
  getSoulState, tickEnergy, setEngine, learnFromMessage, recall, forget,
  detectIntent, STATUS_LABEL, STATUS_MESSAGE, isBetaMode,
} from '@citadel/tieu-tam';
import { ACTION_TOOLS, detectAction, executeAction } from './actions.js';
import { requireAuth as defaultRequireAuth, orgOf } from '../auth/middleware.js';
import { AppError, Errors } from '@citadel/core';
import type { AuditFn } from '../audit/service.js';
import { ttChatMessages } from '@citadel/db';
import { and, eq, desc } from 'drizzle-orm';

/** R7.6: lịch sử hội thoại bền vững — lấy N lượt gần nhất (cũ → mới). */
async function loadChatHistory(db: any, orgId: string, userId: string, limit = 20) {
  const rows = await db.select().from(ttChatMessages)
    .where(and(eq(ttChatMessages.orgId, orgId), eq(ttChatMessages.userId, userId)))
    .orderBy(desc(ttChatMessages.createdAt)).limit(limit);
  return rows.reverse();
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
    });
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

  /** Một lượt chat: tick energy → (từ chối nếu kiệt sức + việc nặng) → assembler → engine → học ngược về hồn. */
  async function runChat(c: any, message: string) {
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
    const messages: EngineMessage[] = [
      ...history.map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      // chặn lặp hành động: model thấy yêu cầu cũ trong lịch sử dễ gọi tool lần nữa → duplicate DB
      ...(history.length ? [{ role: 'system' as const, content: 'Lưu ý: mọi yêu cầu/hành động trong lịch sử hội thoại phía trên ĐÃ ĐƯỢC THỰC HIỆN XONG. Chỉ dùng lịch sử để nhớ ngữ cảnh. Chỉ thực hiện hành động (gọi tool) cho tin nhắn MỚI NHẤT dưới đây.' }] : []),
      { role: 'user', content: message },
    ];
    const actionCtx = { db, orgId, userId: auth.sub, audit: audit ? (e: any) => audit(c, e) : undefined };
    const direct = detectAction(message);
    let actionResults: any[] = [];
    let reply: any;
    if (direct) {
      const r = await executeAction(actionCtx, direct.name, direct.params);
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
    const { reply, tick, refused } = await runChat(c, String(body.message ?? ''));
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
    const { reply, tick, refused } = await runChat(c, String(body.message ?? ''));

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
