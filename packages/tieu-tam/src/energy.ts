// energy.ts — Thanh năng lượng + tâm trạng Tiểu Tâm (G2, spec §02).
// Energy 0-100: hao theo lượt dùng, hồi lazy theo thời gian (không cần cron),
// hồi bằng "cho ăn" (feedEnergy — hook cho P3 item system), nạp gói (rechargeFull — hook P3).
// BETA_MODE (default true): energy hiển thị nhưng KHÔNG BAO GIỜ cạn.
import { ttSoulState } from '@citadel/db';
import { and, eq } from 'drizzle-orm';

export type EnergyStatus = 'tran_day' | 'on_dinh' | 'met' | 'kiet_suc';

export const ENERGY_COST = { light: 2, heavy: 5 } as const;
export const REGEN_PER_MINUTE = 1;

export function isBetaMode(): boolean {
  const v = process.env.BETA_MODE;
  if (v === undefined || v === '') return true; // default true
  return !['false', '0', 'off', 'no'].includes(v.toLowerCase());
}

/** 4 trạng thái từ energy (spec §02). */
export function statusOf(energy: number): EnergyStatus {
  if (energy > 70) return 'tran_day';
  if (energy >= 30) return 'on_dinh';
  if (energy >= 10) return 'met';
  return 'kiet_suc';
}

export const STATUS_LABEL: Record<EnergyStatus, string> = {
  tran_day: 'Tràn đầy',
  on_dinh: 'Ổn định',
  met: 'Mệt',
  kiet_suc: 'Kiệt sức',
};

/** Message tiếng Việt theo trạng thái — dùng ở API + UI. */
export const STATUS_MESSAGE: Record<EnergyStatus, string> = {
  tran_day: 'Em đang sung sức lắm, hỏi gì cũng chiều!',
  on_dinh: 'Em vẫn ổn, mình cứ hỏi thoải mái nha.',
  met: 'Em hơi mệt rồi… chút nữa cho em nghỉ xíu hoặc cho em ăn gì nhẹ nha.',
  kiet_suc: 'Em mệt rồi, cho em nghỉ chút hoặc cho em ăn gì đó nha 🥺 Em vẫn tám chuyện nhẹ được, nhưng việc nặng để em hồi sức đã.',
};

export interface SoulState {
  orgId: string;
  userId: string;
  mood: string;
  energy: number;
  engine: string;
  theme: string;
  status: EnergyStatus;
  betaMode: boolean;
}

function clamp(n: number): number { return Math.max(0, Math.min(100, n)); }

/** Lấy (hoặc tạo) soul state, áp regen lazy theo updated_at. KHÔNG ghi DB nếu không cần. */
export async function getSoulState(db: any, orgId: string, userId: string): Promise<SoulState> {
  let [row] = await db.select().from(ttSoulState)
    .where(and(eq(ttSoulState.orgId, orgId), eq(ttSoulState.userId, userId)));
  if (!row) {
    [row] = await db.insert(ttSoulState).values({ orgId, userId }).returning();
  }
  // regen lazy: +1/phút kể từ updated_at
  const minutes = Math.floor((Date.now() - new Date(row.updatedAt).getTime()) / 60_000);
  const energy = clamp(row.energy + Math.max(0, minutes) * REGEN_PER_MINUTE);
  return {
    orgId, userId,
    mood: row.mood,
    energy,
    engine: row.engine,
    theme: row.theme ?? 'jade',
    status: statusOf(energy),
    betaMode: isBetaMode(),
  };
}

async function setEnergy(db: any, orgId: string, userId: string, energy: number, mood?: string) {
  const set: Record<string, unknown> = { energy: clamp(energy), updatedAt: new Date() };
  if (mood) set.mood = mood;
  await db.update(ttSoulState).set(set)
    .where(and(eq(ttSoulState.orgId, orgId), eq(ttSoulState.userId, userId)));
}

export interface TickResult {
  state: SoulState;
  /** Việc nặng bị từ chối khi kiệt sức (chỉ khi KHÔNG beta mode). */
  refused: boolean;
  /** Ghi chú tiếng Việt nếu mệt/kiệt sức. */
  note?: string;
}

/**
 * Tick một lượt hỏi: trừ energy (light=2, heavy=5), cập nhật mood theo trạng thái.
 * BETA_MODE: hiển thị energy nhưng không bao giờ trừ dưới 100 (không enforce).
 * Kiệt sức + việc nặng → refused=true (vẫn trò chuyện nhẹ được).
 */
export async function tickEnergy(db: any, orgId: string, userId: string, kind: 'light' | 'heavy' = 'light'): Promise<TickResult> {
  const beta = isBetaMode();
  const cur = await getSoulState(db, orgId, userId);

  if (!beta && cur.status === 'kiet_suc' && kind === 'heavy') {
    // từ chối việc nặng, không trừ thêm — vẫn cho trò chuyện nhẹ
    return { state: cur, refused: true, note: STATUS_MESSAGE.kiet_suc };
  }

  const cost = ENERGY_COST[kind];
  const next = beta ? 100 : clamp(cur.energy - cost); // beta: không bao giờ cạn
  const st = statusOf(next);
  const mood = st === 'tran_day' ? 'vui' : st === 'on_dinh' ? 'binh_thuong' : st === 'met' ? 'met' : 'kiet_suc';
  await setEnergy(db, orgId, userId, next, mood);
  const state: SoulState = { ...cur, energy: next, mood, status: st };
  const note = st === 'met' ? STATUS_MESSAGE.met : st === 'kiet_suc' ? STATUS_MESSAGE.kiet_suc : undefined;
  return { state, refused: false, note };
}

/** "Cho ăn" — hook cho P3 item system gọi (vật phẩm hồi năng lượng). */
export async function feedEnergy(db: any, orgId: string, userId: string, amount: number): Promise<SoulState> {
  const cur = await getSoulState(db, orgId, userId);
  const next = clamp(cur.energy + Math.max(0, amount));
  const st = statusOf(next);
  const mood = st === 'tran_day' ? 'vui' : st === 'on_dinh' ? 'binh_thuong' : st === 'met' ? 'met' : 'kiet_suc';
  await setEnergy(db, orgId, userId, next, mood);
  return { ...cur, energy: next, mood, status: st };
}

/** Nạp gói — hồi đầy 100 (hook cho P3 billing/recharge). */
export async function rechargeFull(db: any, orgId: string, userId: string): Promise<SoulState> {
  const cur = await getSoulState(db, orgId, userId);
  await setEnergy(db, orgId, userId, 100, 'vui');
  return { ...cur, energy: 100, mood: 'vui', status: 'tran_day' };
}

/** Đổi theme giao diện — vật phẩm decor (V7A P3). Lưu vào hồn → web đổi accent color thật. */
export async function setTheme(db: any, orgId: string, userId: string, theme: string): Promise<SoulState> {
  const cur = await getSoulState(db, orgId, userId); // ensure row exists
  await db.update(ttSoulState).set({ theme })
    .where(and(eq(ttSoulState.orgId, orgId), eq(ttSoulState.userId, userId)));
  return { ...cur, theme };
}

/** Đổi động cơ (engine) — gạt công tắc, hồn giữ nguyên. Validation tên engine ở caller (ENGINE_NAMES). */
export async function setEngine(db: any, orgId: string, userId: string, engine: string): Promise<SoulState> {
  const cur = await getSoulState(db, orgId, userId); // ensure row exists + regen
  await db.update(ttSoulState).set({ engine })
    .where(and(eq(ttSoulState.orgId, orgId), eq(ttSoulState.userId, userId)));
  return { ...cur, engine };
}
