// Item system service (V7A P3 — G3/G4): vòng kinh tế khép kín.
// Ví Om → Cửa hàng (buyItem, transaction, trừ Om THẬT) → Kho chứa (listOwned, tenant isolation)
// → Sử dụng (useItem → hiệu ứng THẬT: feed_energy / recharge_full / decor theme).
import { and, eq, asc } from 'drizzle-orm';
import { itemCatalog, userItems } from '@citadel/db';
import { spend } from '@citadel/module-om/server/service.js';
import { feedEnergy, rechargeFull, setTheme, getSoulState, type SoulState } from '@citadel/tieu-tam';
import { Errors } from '@citadel/core';

type DB = any;

export interface ItemEffect {
  type: 'feed_energy' | 'recharge_full' | 'decor';
  amount?: number;
  theme?: string;
}

export const ITEM_THEMES = ['jade', 'gold', 'sage'] as const;

/** R7.7: map theme id → item_code (theme mua trong Kho). jade = Cơ Bản, luôn miễn phí. */
const THEME_ITEM_CODE: Record<string, string> = { gold: 'theme-ho-phach', sage: 'theme-sage' };

/** Danh sách theme user DÙNG ĐƯỢC: jade (Cơ Bản, free) + các theme decor đã sở hữu trong kho. */
export async function listOwnedThemes(db: DB, orgId: string, userId: string): Promise<string[]> {
  const owned = await listOwned(db, orgId, userId);
  const themes = new Set<string>(['jade']); // Cơ Bản luôn có
  for (const it of owned) {
    const eff = it.effect as ItemEffect;
    if (eff?.type === 'decor' && eff.theme) themes.add(String(eff.theme));
  }
  return [...themes];
}

/** R7.7: chọn theme đã sở hữu (hoặc jade Cơ Bản) — KHÔNG tiêu hao. Chặn theme chưa mua. */
export async function selectTheme(db: DB, orgId: string, userId: string, theme: string): Promise<{ theme: string; soul: SoulState }> {
  const allowed = await listOwnedThemes(db, orgId, userId);
  if (!allowed.includes(theme)) throw Errors.forbidden(theme === 'jade' ? 'Theme Cơ Bản luôn có sẵn' : 'Bạn chưa sở hữu theme này — mua trong Cửa hàng Vật phẩm trước nha');
  const soul = await setTheme(db, orgId, userId, theme);
  return { theme, soul };
}

/** Catalog đang bán (active) — toàn cục, không tenant data. */
export async function listCatalog(db: DB) {
  return db.select().from(itemCatalog).where(eq(itemCatalog.active, true)).orderBy(asc(itemCatalog.price));
}

export async function getCatalogItem(db: DB, code: string) {
  const [row] = await db.select().from(itemCatalog)
    .where(and(eq(itemCatalog.code, code), eq(itemCatalog.active, true)));
  return row ?? null;
}

/**
 * Mua vật phẩm: trừ Om THẬT qua ledger (chặn thiếu tiền) + cộng vào kho — 1 transaction (hiến pháp #5).
 * Kho gộp theo (org, user, item_code): mua lại → qty cộng dồn.
 * R5: hỗ trợ mua NHIỀU (qty 1..99) trong 1 giao dịch — trừ Om đúng tổng qty × giá.
 */
export async function buyItem(db: DB, orgId: string, userId: string, code: string, qty = 1) {
  const item = await getCatalogItem(db, code);
  if (!item) throw Errors.notFound('Vật phẩm không tồn tại hoặc đã ngừng bán');
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n < 1 || n > 99) throw Errors.validation('Số lượng mua phải từ 1 đến 99', 'qty');
  const total = item.price * n;
  return db.transaction(async (tx: DB) => {
    // trừ Om thật ĐÚNG TỔNG — throw conflict "Không đủ Om (cần X, có Y)" nếu thiếu
    const pay = await spend(tx, orgId, total, n > 1 ? `Mua ${n} × ${item.name}` : `Mua vật phẩm ${item.name}`, 'store');
    const [existing] = await tx.select().from(userItems)
      .where(and(eq(userItems.orgId, orgId), eq(userItems.userId, userId), eq(userItems.itemCode, code)));
    let owned;
    if (existing) {
      [owned] = await tx.update(userItems).set({ qty: existing.qty + n })
        .where(and(eq(userItems.id, existing.id), eq(userItems.orgId, orgId))).returning();
    } else {
      [owned] = await tx.insert(userItems).values({ orgId, userId, itemCode: code, qty: n }).returning();
    }
    return { item, owned, paidOm: total, qtyBought: n, balance: pay.balance };
  });
}

/** Kho của user — LUÔN filter org + user (hiến pháp #1), join info đầy đủ từ catalog. */
export async function listOwned(db: DB, orgId: string, userId: string) {
  const rows = await db.select({
    id: userItems.id,
    itemCode: userItems.itemCode,
    qty: userItems.qty,
    acquiredAt: userItems.acquiredAt,
    name: itemCatalog.name,
    description: itemCatalog.description,
    category: itemCatalog.category,
    price: itemCatalog.price,
    effect: itemCatalog.effect,
    icon: itemCatalog.icon,
  }).from(userItems)
    .innerJoin(itemCatalog, eq(userItems.itemCode, itemCatalog.code))
    .where(and(eq(userItems.orgId, orgId), eq(userItems.userId, userId)))
    .orderBy(asc(userItems.acquiredAt));
  return rows;
}

export interface UseResult {
  item: { code: string; name: string; category: string };
  effect: ItemEffect;
  /** Kết quả thấy được — tiếng Việt, hiển thị toast ngay. */
  message: string;
  energyBefore?: number;
  energyAfter?: number;
  theme?: string;
  soul: SoulState;
  qtyLeft: number;
}

/**
 * Sử dụng vật phẩm: hiệu ứng THẬT (mắt xích cuối của vòng kinh tế — spec §04).
 * feed_energy → feedEnergy(); recharge_full → rechargeFull(); decor → setTheme().
 * Trừ qty, hết thì xóa row. 404 nếu không sở hữu (hoặc của org/user khác — tenant isolation).
 */
export async function useItem(db: DB, orgId: string, userId: string, ownedId: string): Promise<UseResult> {
  const [row] = await db.select({
    id: userItems.id, itemCode: userItems.itemCode, qty: userItems.qty,
    name: itemCatalog.name, category: itemCatalog.category, effect: itemCatalog.effect,
  }).from(userItems)
    .innerJoin(itemCatalog, eq(userItems.itemCode, itemCatalog.code))
    .where(and(eq(userItems.id, ownedId), eq(userItems.orgId, orgId), eq(userItems.userId, userId)));
  if (!row) throw Errors.notFound('Vật phẩm không có trong kho của bạn');

  const effect = row.effect as ItemEffect;
  let soul: SoulState;
  let message: string;
  let energyBefore: number | undefined;
  let energyAfter: number | undefined;
  let theme: string | undefined;

  switch (effect.type) {
    case 'feed_energy': {
      const amount = Number(effect.amount ?? 0);
      const before = await getSoulState(db, orgId, userId); // energy hiện tại (đã regen lazy)
      energyBefore = Math.round(before.energy);
      soul = await feedEnergy(db, orgId, userId, amount);
      energyAfter = Math.round(soul.energy);
      message = `Tiểu Tâm ăn ${row.name}, năng lượng +${energyAfter - energyBefore} (${energyBefore}→${energyAfter}) 🦊`;
      break;
    }
    case 'recharge_full': {
      const before = await getSoulState(db, orgId, userId);
      energyBefore = Math.round(before.energy);
      soul = await rechargeFull(db, orgId, userId);
      energyAfter = 100;
      message = `${row.name} kích hoạt — Tiểu Tâm hồi đầy 100% năng lượng ⚡ (${energyBefore}→100)`;
      break;
    }
    case 'decor': {
      theme = String(effect.theme ?? 'jade');
      soul = await setTheme(db, orgId, userId, theme);
      message = `Đã khoác ${row.name} — giao diện đổi màu ngay ✨`;
      // R7.7: theme là vật phẩm BỀN — dùng KHÔNG tiêu hao, giữ trong kho để bật/tắt lại bất kỳ lúc nào
      return { item: { code: row.itemCode, name: row.name, category: row.category }, effect, message, theme, soul, qtyLeft: row.qty };
    }
    default:
      throw Errors.validation(`Hiệu ứng vật phẩm không hợp lệ: ${(effect as any)?.type ?? '?'}`);
  }

  // trừ qty — hết thì xóa row (luôn kèm org filter)
  let qtyLeft = row.qty - 1;
  if (qtyLeft <= 0) {
    await db.delete(userItems).where(and(eq(userItems.id, ownedId), eq(userItems.orgId, orgId)));
    qtyLeft = 0;
  } else {
    await db.update(userItems).set({ qty: qtyLeft }).where(and(eq(userItems.id, ownedId), eq(userItems.orgId, orgId)));
  }

  return { item: { code: row.itemCode, name: row.name, category: row.category }, effect, message, energyBefore, energyAfter, theme, soul, qtyLeft };
}
