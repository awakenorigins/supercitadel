/**
 * SOUL-RESTAURANT — settings.service
 * Cấu hình per-org: phí phục vụ, VAT (gộp/cộng ngoài), trừ kho lúc nào,
 * tự chuyển bàn sang "dọn dẹp". Fetch-or-default: chưa có dòng → trả mặc định
 * (không insert ngầm — chỉ ghi khi user chủ động cập nhật).
 */
import { eq } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { restoSettings } from '../db/schema.js';

export interface RestoSettingsView {
  service_charge_pct: string;
  tax_pct: string;
  price_includes_tax: boolean;
  currency: string;
  auto_deduct_stock: boolean;
  deduct_on: 'paid' | 'served';
  table_auto_clean: boolean;
  loyalty_enabled: boolean;
  loyalty_earn_pct: string;
  loyalty_min_redeem: string;
}

export const DEFAULT_SETTINGS: RestoSettingsView = {
  service_charge_pct: '0.00',
  tax_pct: '8.00',
  price_includes_tax: true,
  currency: 'VND',
  auto_deduct_stock: true,
  deduct_on: 'paid',
  table_auto_clean: false,
  loyalty_enabled: false,
  loyalty_earn_pct: '0.00',
  loyalty_min_redeem: '0.00',
};

export async function getSettings(ctx: RestoCtx): Promise<RestoSettingsView> {
  const rows = await ctx.db.select().from(restoSettings)
    .where(eq(restoSettings.orgId, ctx.orgId)).limit(1);
  const r = rows[0];
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    service_charge_pct: r.serviceChargePct,
    tax_pct: r.taxPct,
    price_includes_tax: r.priceIncludesTax,
    currency: r.currency,
    auto_deduct_stock: r.autoDeductStock,
    deduct_on: r.deductOn as 'paid' | 'served',
    table_auto_clean: r.tableAutoClean,
    loyalty_enabled: r.loyaltyEnabled,
    loyalty_earn_pct: r.loyaltyEarnPct,
    loyalty_min_redeem: r.loyaltyMinRedeem,
  };
}

export interface SettingsUpdateInput {
  service_charge_pct?: string;
  tax_pct?: string;
  price_includes_tax?: boolean;
  auto_deduct_stock?: boolean;
  deduct_on?: 'paid' | 'served';
  table_auto_clean?: boolean;
  loyalty_enabled?: boolean;
  loyalty_earn_pct?: string;
  loyalty_min_redeem?: string;
}

export async function updateSettings(ctx: RestoCtx, input: SettingsUpdateInput): Promise<RestoSettingsView> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.service_charge_pct !== undefined) set.serviceChargePct = input.service_charge_pct;
  if (input.tax_pct !== undefined) set.taxPct = input.tax_pct;
  if (input.price_includes_tax !== undefined) set.priceIncludesTax = input.price_includes_tax;
  if (input.auto_deduct_stock !== undefined) set.autoDeductStock = input.auto_deduct_stock;
  if (input.deduct_on !== undefined) set.deductOn = input.deduct_on;
  if (input.table_auto_clean !== undefined) set.tableAutoClean = input.table_auto_clean;
  if (input.loyalty_enabled !== undefined) set.loyaltyEnabled = input.loyalty_enabled;
  if (input.loyalty_earn_pct !== undefined) set.loyaltyEarnPct = input.loyalty_earn_pct;
  if (input.loyalty_min_redeem !== undefined) set.loyaltyMinRedeem = input.loyalty_min_redeem;

  await ctx.db.insert(restoSettings)
    .values({ orgId: ctx.orgId, ...set })
    .onConflictDoUpdate({ target: restoSettings.orgId, set });

  const view = await getSettings(ctx);
  await ctx.bus.emit('resto.settings.updated', { org_id: ctx.orgId, ...view });
  return view;
}
