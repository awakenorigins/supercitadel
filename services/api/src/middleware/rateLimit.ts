// Rate limiting — in-memory sliding window. Protects against brute-force (esp. token login).
// Single-node; swap store for Redis when scaling (same interface).
import type { Context, Next } from 'hono';
import { AppError, ErrorCode } from '@citadel/core';

interface Hit { count: number; resetAt: number; }
const store = new Map<string, Hit>();

let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
}

export interface RateLimitOpts {
  windowMs: number;
  max: number;
  keyFn?: (c: Context) => string;
}

function clientKey(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

export function rateLimit(opts: RateLimitOpts) {
  const { windowMs, max, keyFn = clientKey } = opts;
  return async (c: Context, next: Next) => {
    const now = Date.now();
    sweep(now);
    const key = `${c.req.path}:${keyFn(c)}`;
    let hit = store.get(key);
    if (!hit || hit.resetAt <= now) {
      hit = { count: 0, resetAt: now + windowMs };
      store.set(key, hit);
    }
    hit.count++;
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - hit.count)));
    if (hit.count > max) {
      const retry = Math.ceil((hit.resetAt - now) / 1000);
      c.header('Retry-After', String(retry));
      throw new AppError(ErrorCode.RATE_LIMITED, `Quá nhiều yêu cầu, thử lại sau ${retry}s`, 429);
    }
    await next();
  };
}

/** test hook: reset store between tests */
export function _resetRateLimit() { store.clear(); }
