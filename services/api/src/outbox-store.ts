import { sql } from 'drizzle-orm';
import type { OutboxRecord, OutboxStore } from '@citadel/core';

type DB = any;
const rows = (result: any): any[] => Array.isArray(result) ? result : (result?.rows ?? []);
const map = (r: any): OutboxRecord => ({
  id: r.id, orgId: r.org_id, topic: r.topic, payload: r.payload, attempts: Number(r.attempts ?? 0),
  status: r.status, dispatchedAt: r.dispatched_at, lastError: r.last_error,
  nextAttemptAt: r.next_attempt_at, failedAt: r.failed_at,
});

/** PostgreSQL-backed store. The UPDATE/CTE makes claiming atomic across API replicas. */
export function createPostgresOutboxStore(db: DB): OutboxStore {
  return {
    async claim(limit, now) {
      const nowIso = now.toISOString();
      const result = await db.execute(sql`
        WITH candidates AS (
          SELECT id FROM outbox_events
          WHERE dispatched_at IS NULL
            AND status = 'pending'
            AND (next_attempt_at IS NULL OR next_attempt_at <= ${nowIso}::timestamptz)
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE outbox_events e
        SET status = 'processing'
        FROM candidates c
        WHERE e.id = c.id
        RETURNING e.*
      `);
      return rows(result).map(map);
    },
    async dispatched(id, at) {
      await db.execute(sql`UPDATE outbox_events SET status='dispatched', dispatched_at=${at.toISOString()}::timestamptz, last_error=NULL, next_attempt_at=NULL WHERE id=${id}::uuid AND status='processing'`);
    },
    async retry(id, attempts, error, nextAttemptAt) {
      await db.execute(sql`UPDATE outbox_events SET status='pending', attempts=${attempts}, last_error=${error}, next_attempt_at=${nextAttemptAt.toISOString()}::timestamptz WHERE id=${id}::uuid AND status='processing'`);
    },
    async failed(id, attempts, error, at) {
      await db.execute(sql`UPDATE outbox_events SET status='failed', attempts=${attempts}, last_error=${error}, failed_at=${at.toISOString()}::timestamptz, next_attempt_at=NULL WHERE id=${id}::uuid AND status='processing'`);
    },
  };
}
