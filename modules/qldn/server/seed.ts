/**
 * QLDN V1A — Seed mặc định cho org mới:
 * 1 bản policy_params hiệu lực (BHXH/thuế/giảm trừ hiện hành) + kỳ hiện tại.
 */
import { periods, policyParams } from './schema.js';
import { DEFAULT_PIT_BRACKETS } from './service.js';

export async function seedQldnDefaults(db: any, orgId: string, opts?: { today?: Date }) {
  const today = opts?.today ?? new Date();
  const iso = today.toISOString().slice(0, 10);
  const code = iso.slice(0, 7); // YYYY-MM

  await db.insert(policyParams).values({
    orgId,
    effectiveFrom: `${today.getUTCFullYear()}-01-01`,
    pitBrackets: DEFAULT_PIT_BRACKETS,
    note: 'Seed mặc định — tham số BHXH/BHYT/BHTN/TNLĐ/KPCĐ + giảm trừ + biểu thuế 7 bậc hiện hành',
  }).onConflictDoNothing();

  await db.insert(periods).values({
    orgId,
    code,
    name: `Tháng ${code.slice(5)}/${code.slice(0, 4)}`,
  }).onConflictDoNothing();

  return { policySeeded: true, periodCode: code };
}
