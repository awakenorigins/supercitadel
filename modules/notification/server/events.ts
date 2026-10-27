import { eq } from 'drizzle-orm';
import { users } from '@citadel/db';
import { createNotification } from './service.js';

export const eventHandlers = {
  'accounting.invoice.created': async (ev: any, { db }: { db: any }) => {
    const rows = await db.select().from(users).where(eq(users.orgId, ev.orgId)).limit(20);
    const p: any = ev.payload ?? {};
    for (const u of rows) await createNotification(db, ev.orgId, u.id, {
      kind: 'accounting',
      title: 'Hóa đơn mới',
      bodyText: `Hóa đơn mới ${Number(p.grandTotal ?? 0).toLocaleString('vi-VN')} đ cho ${p.partyName ?? 'đối tác'}`,
      link: '/accounting',
    });
  },
};
