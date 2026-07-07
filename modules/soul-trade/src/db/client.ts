// Minimal DB client contract — pglite (tests) and the host's pg pool both satisfy it.
export interface DbClient { query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }>; exec(sql: string): Promise<unknown>; }
export const j = (v: unknown) => JSON.stringify(v ?? null);
