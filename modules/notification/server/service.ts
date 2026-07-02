// Notification service — list/create/mark-read, tenant + user scoped.
import { eq, and, desc, isNull } from 'drizzle-orm';
import { notifications } from './schema.js';
type DB = any;

export async function listNotifications(db: DB, orgId: string, userId: string, unreadOnly = false) {
  const conds = [eq(notifications.orgId, orgId), eq(notifications.userId, userId)];
  if (unreadOnly) conds.push(isNull(notifications.readAt));
  return db.select().from(notifications).where(and(...conds)).orderBy(desc(notifications.createdAt)).limit(50);
}
export async function createNotification(db: DB, orgId: string, userId: string, n: { kind: string; title: string; bodyText?: string; link?: string }) {
  const [row] = await db.insert(notifications).values({ orgId, userId, ...n }).returning();
  return row;
}
export async function markNotifRead(db: DB, orgId: string, userId: string, id: string) {
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.orgId, orgId), eq(notifications.userId, userId)));
  return { ok: true };
}
export async function markAllRead(db: DB, orgId: string, userId: string) {
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { ok: true };
}
