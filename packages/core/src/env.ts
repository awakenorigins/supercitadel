// Env validation — fail fast at boot with a clear message instead of cryptic runtime errors.
import { z } from 'zod';

const apiEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL bắt buộc'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET phải ≥16 ký tự'),
  REDIS_URL: z.string().optional(),
  LLM_MODE: z.enum(['stub', 'live']).default('stub'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  WS_INTERNAL_URL: z.string().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Validate process.env for the API service. Throws with readable message if invalid. */
export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = apiEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`[env] Cấu hình không hợp lệ:\n${issues}`);
  }
  // live mode but no key → warn (app still boots; provider falls back to stub)
  if (parsed.data.LLM_MODE === 'live' && !parsed.data.OPENAI_API_KEY && !parsed.data.ANTHROPIC_API_KEY) {
    console.warn('[env] LLM_MODE=live nhưng thiếu API key — Tiểu Tâm sẽ chạy stub.');
  }
  return parsed.data;
}
