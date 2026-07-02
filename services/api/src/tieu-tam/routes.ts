// Tiểu Tâm HTTP routes — V7A P2: hồn tách động cơ + mood/energy.
// buildTieuTamRoutes: chat qua Context Assembler (một cổng) → EngineAdapter (đổi model = gạt công tắc),
// energy tick mỗi lượt, học chảy ngược về hồn sau mỗi hội thoại.
// Legacy export `tieuTam` (stub không DB) giữ cho các script audit cũ.
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  getProvider, type ChatContext,
  buildWorkProfile, getEngine, ENGINE_NAMES, type EngineMessage,
  getSoulState, tickEnergy, setEngine, learnFromMessage,
  detectIntent, STATUS_LABEL, STATUS_MESSAGE, isBetaMode,
} from '@citadel/tieu-tam';
import { requireAuth as defaultRequireAuth, orgOf } from '../auth/middleware.js';
import { AppError, Errors } from '@citadel/core';
import type { AuditFn } from '../audit/service.js';

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
      betaMode: s.betaMode,
    });
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
    const messages: EngineMessage[] = [{ role: 'user', content: message }];
    const reply = await engine.complete(profile, messages);
    // học chảy ngược về hồn (best-effort, không gãy chat)
    await learnFromMessage(db, orgId, auth.sub, message);
    // Mệt → nhắc nhẹ sắp cần nghỉ (không chặn)
    const text = tick.note && tick.state.status === 'met' && !isBetaMode()
      ? `${reply.text}\n\n(${tick.note})`
      : reply.text;
    return { reply: { ...reply, text }, tick, refused: false };
  }

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
      const words = reply.text.split(' ');
      for (const w of words) {
        await stream.writeSSE({ event: 'token', data: w + ' ' });
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
