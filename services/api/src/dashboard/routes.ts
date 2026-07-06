// Dashboard + Search routes — aggregate read-only endpoints for the Home screen.
import { Hono } from 'hono';
import { requireAuth, orgOf } from '../auth/middleware.js';
import { getDb, users } from '@citadel/db';
import { eq, sql } from 'drizzle-orm';
import { AppError } from '@citadel/core';

export const dashboard = new Hono();
dashboard.onError((err, c) => {
  if (err instanceof AppError) return c.json(err.toJSON(), err.status as 400);
  console.error('[dashboard] unhandled', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } }, 500);
});
dashboard.use('*', requireAuth);

// GET /summary — KPI cho Home (đếm thật từ DB; số kinh doanh là demo cho tới khi có POS module)
dashboard.get('/summary', async (c) => {
  const db = getDb();
  const orgId = orgOf(c);
  const [{ memberCount }] = await db
    .select({ memberCount: sql<number>`count(*)::int` })
    .from(users).where(eq(users.orgId, orgId));
  return c.json({
    orgId,
    kpis: {
      revenueToday: { value: '12.4tr', trend: '+18.4%' },   // demo until POS
      orders: { value: 187, trend: '+13' },
      returningRate: { value: '63.8%', trend: '+5%' },
      lowStock: { value: 3 },
    },
    team: { members: memberCount },
    pulse: { status: 'good_with_warning', note: 'Doanh thu tốt, 3 mặt hàng sắp hết' },
  });
});

// GET /search?q= — global search (hiện tại: members; mở rộng khi có module khác)
dashboard.get('/search', async (c) => {
  const db = getDb();
  const orgId = orgOf(c);
  const q = (c.req.query('q') ?? '').toLowerCase();
  if (!q) return c.json({ results: [] });
  const all = await db.select().from(users).where(eq(users.orgId, orgId));
  const results = all
    .filter((u: any) => u.displayName.toLowerCase().includes(q))
    .map((u: any) => ({ type: 'user', id: u.id, label: u.displayName }));
  return c.json({ results });
});
