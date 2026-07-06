export interface OutboxEventInput { orgId: string; topic: string; payload: unknown }
export const OUTBOX_TOPIC_RE = /^[a-z][a-z0-9-]*(?:\.\*|\.[a-z][a-z0-9-]*\.(?:[a-z][a-z0-9_-]*|\*))$/;
export function validateOutboxTopic(topic: string): boolean { return OUTBOX_TOPIC_RE.test(topic); }
export function outboxEventValues(input: OutboxEventInput) {
  if (!input.orgId) throw new Error('emitEvent thiếu orgId');
  if (!validateOutboxTopic(input.topic)) throw new Error(`Topic outbox sai format module.entity.verb: ${input.topic}`);
  return { orgId: input.orgId, topic: input.topic, payload: input.payload ?? {} };
}
export async function emitEvent(tx: any, input: OutboxEventInput) {
  if (!tx || typeof tx.insert !== 'function') throw new Error('emitEvent yêu cầu transaction tx hợp lệ');
  const table = (globalThis as any).__citadelOutboxEventsTable;
  if (!(globalThis as any).__citadelOutboxEnabled || !table) return null;
  if (!table) throw new Error('outboxEvents table chưa được đăng ký');
  try {
    const [row] = await tx.insert(table).values(outboxEventValues(input)).returning();
    return row;
  } catch (e: any) {
    if (String(e?.message ?? e).includes('outbox_events')) return null;
    throw e;
  }
}
