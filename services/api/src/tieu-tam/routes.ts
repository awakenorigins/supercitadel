// Tiểu Tâm HTTP routes — chat (JSON) and chat/stream (SSE token streaming).
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getProvider, type ChatContext } from '@citadel/tieu-tam';
import { requireAuth, orgOf } from '../auth/middleware.js';
import { AppError } from '@citadel/core';

export const tieuTam = new Hono();

// Self-contained error handling so the sub-app returns correct status even when mounted/tested alone.
tieuTam.onError((err, c) => {
  if (err instanceof AppError) return c.json(err.toJSON(), err.status as 400);
  console.error('[tieu-tam] unhandled', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500);
});

tieuTam.use('*', requireAuth);

/** Non-streaming reply. */
tieuTam.post('/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ctx: ChatContext = { orgName: body.orgName, userName: body.userName, facts: body.facts };
  const reply = await getProvider().reply(String(body.message ?? ''), ctx);
  return c.json({ ...reply, orgId: orgOf(c) });
});

/** Streaming reply (SSE). In stub mode we chunk the canned text to simulate token stream. */
tieuTam.post('/chat/stream', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ctx: ChatContext = { orgName: body.orgName, userName: body.userName, facts: body.facts };
  const reply = await getProvider().reply(String(body.message ?? ''), ctx);

  return streamSSE(c, async (stream) => {
    // stream text word-by-word
    const words = reply.text.split(' ');
    for (const w of words) {
      await stream.writeSSE({ event: 'token', data: w + ' ' });
      await stream.sleep(35);
    }
    // then tool calls (generative UI) + suggestions + done
    if (reply.toolCalls?.length)
      await stream.writeSSE({ event: 'tool', data: JSON.stringify(reply.toolCalls) });
    if (reply.suggestions?.length)
      await stream.writeSSE({ event: 'suggestions', data: JSON.stringify(reply.suggestions) });
    await stream.writeSSE({ event: 'done', data: JSON.stringify({ mode: reply.mode }) });
  });
});
