/**
 * SOUL-RESTAURANT — catalog.service
 * Menu (món/combo/tùy chọn), báo hết món, định lượng (recipe → Kho qua SKU).
 * Resolve tên món "nói sao hiểu vậy": khớp chính xác trước, mờ sau;
 * mờ mà trúng nhiều món → lỗi MENU_ITEM_AMBIGUOUS kèm danh sách để
 * Tiểu Tâm hỏi lại người dùng (chống bịa).
 */
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { RestoCtx } from '../types.js';
import { RestoError } from '../types.js';
import {
  restoMenuCategories, restoMenuItems, restoStations,
  restoOptionGroups, restoOptions, restoItemOptionGroups,
  restoComboItems, restoRecipes,
} from '../db/schema.js';
import { d3, f3, fmtQty, fmtVnd, mulQty } from '../lib/money.js';

type MenuItemRow = typeof restoMenuItems.$inferSelect;

async function ensureCategory(ctx: RestoCtx, name: string): Promise<string> {
  const rows = await ctx.db.select().from(restoMenuCategories)
    .where(and(eq(restoMenuCategories.orgId, ctx.orgId),
      sql`lower(${restoMenuCategories.name}) = ${name.trim().toLowerCase()}`)).limit(1);
  if (rows[0]) return rows[0].id;
  const ins = await ctx.db.insert(restoMenuCategories)
    .values({ orgId: ctx.orgId, name: name.trim() })
    .returning({ id: restoMenuCategories.id });
  return ins[0]!.id;
}

export async function ensureStation(ctx: RestoCtx, name: string): Promise<string> {
  const rows = await ctx.db.select().from(restoStations)
    .where(and(eq(restoStations.orgId, ctx.orgId),
      sql`lower(${restoStations.name}) = ${name.trim().toLowerCase()}`)).limit(1);
  if (rows[0]) return rows[0].id;
  const ins = await ctx.db.insert(restoStations)
    .values({ orgId: ctx.orgId, name: name.trim() })
    .returning({ id: restoStations.id });
  return ins[0]!.id;
}

/** Tìm món theo sku (chính xác) hoặc name (chính xác → mờ). */
export async function resolveMenuItem(
  ctx: RestoCtx,
  ref: { name?: string; sku?: string },
  opts: { forOrder?: boolean } = {},
): Promise<MenuItemRow> {
  let item: MenuItemRow | undefined;

  if (ref.sku) {
    const rows = await ctx.db.select().from(restoMenuItems)
      .where(and(eq(restoMenuItems.orgId, ctx.orgId),
        sql`lower(${restoMenuItems.sku}) = ${ref.sku.trim().toLowerCase()}`)).limit(1);
    item = rows[0];
  }

  if (!item && ref.name) {
    const q = ref.name.trim().toLowerCase();
    const exact = await ctx.db.select().from(restoMenuItems)
      .where(and(eq(restoMenuItems.orgId, ctx.orgId),
        sql`lower(${restoMenuItems.name}) = ${q}`)).limit(1);
    item = exact[0];
    if (!item) {
      const fuzzy = await ctx.db.select().from(restoMenuItems)
        .where(and(eq(restoMenuItems.orgId, ctx.orgId),
          eq(restoMenuItems.active, true),
          ilike(restoMenuItems.name, `%${q}%`)))
        .orderBy(asc(restoMenuItems.name)).limit(6);
      if (fuzzy.length === 1) item = fuzzy[0];
      else if (fuzzy.length > 1) {
        throw new RestoError('MENU_ITEM_AMBIGUOUS',
          `"${ref.name}" khớp ${fuzzy.length} món: ${fuzzy.map((f) => f.name).join(', ')}. Nói rõ tên món hơn nhé.`,
          { candidates: fuzzy.map((f) => f.name) });
      }
    }
  }

  if (!item) {
    throw new RestoError('MENU_ITEM_NOT_FOUND',
      `Không tìm thấy món "${ref.name ?? ref.sku}" trong menu`);
  }
  if (opts.forOrder) {
    if (!item.active) throw new RestoError('MENU_ITEM_INACTIVE', `Món "${item.name}" đã ngừng bán`);
    if (item.soldOut) throw new RestoError('MENU_ITEM_SOLD_OUT', `Món "${item.name}" đã báo hết hôm nay`);
  }
  return item;
}

export interface MenuUpsertInput {
  name: string; sku?: string; price?: string; cost?: string;
  category?: string; station?: string; kind?: 'single' | 'combo';
  unit?: string; description?: string; tax_rate?: string;
  sold_out?: boolean; active?: boolean;
  options?: Array<{
    group: string; min?: number; max?: number; required?: boolean;
    choices: Array<{ name: string; price_delta?: string }>;
  }>;
  combo_items?: Array<{ name: string; qty: string }>;
}

/** Tạo/sửa món + nhóm tùy chọn + thành phần combo — một lệnh trọn gói. */
export async function upsertMenuItem(ctx: RestoCtx, input: MenuUpsertInput): Promise<{
  id: string; name: string; price: string; kind: string; created: boolean;
  options_linked: number; combo_components: number;
}> {
  const kind: 'single' | 'combo' = input.kind ?? (input.combo_items?.length ? 'combo' : 'single');
  if (kind === 'single' && input.combo_items?.length) {
    throw new RestoError('COMBO_INVALID', 'Món kind=single không được khai combo_items');
  }

  const categoryId = input.category ? await ensureCategory(ctx, input.category) : undefined;
  const stationId = input.station ? await ensureStation(ctx, input.station) : undefined;

  const q = input.name.trim().toLowerCase();
  const existingRows = await ctx.db.select().from(restoMenuItems)
    .where(and(eq(restoMenuItems.orgId, ctx.orgId),
      sql`lower(${restoMenuItems.name}) = ${q}`)).limit(1);
  const existing = existingRows[0];

  let itemId: string;
  let created = false;
  if (existing) {
    const set: Record<string, unknown> = { updatedAt: new Date(), kind };
    if (input.sku !== undefined) set.sku = input.sku;
    if (input.price !== undefined) set.price = input.price;
    if (input.cost !== undefined) set.cost = input.cost;
    if (categoryId !== undefined) set.categoryId = categoryId;
    if (stationId !== undefined) set.stationId = stationId;
    if (input.unit !== undefined) set.unit = input.unit;
    if (input.description !== undefined) set.description = input.description;
    if (input.tax_rate !== undefined) set.taxRate = input.tax_rate;
    if (input.sold_out !== undefined) set.soldOut = input.sold_out;
    if (input.active !== undefined) set.active = input.active;
    await ctx.db.update(restoMenuItems).set(set)
      .where(and(eq(restoMenuItems.orgId, ctx.orgId), eq(restoMenuItems.id, existing.id)));
    itemId = existing.id;
  } else {
    const ins = await ctx.db.insert(restoMenuItems).values({
      orgId: ctx.orgId,
      name: input.name.trim(),
      sku: input.sku ?? null,
      price: input.price ?? '0',
      cost: input.cost ?? null,
      categoryId: categoryId ?? null,
      stationId: stationId ?? null,
      kind,
      unit: input.unit ?? 'phần',
      description: input.description ?? null,
      taxRate: input.tax_rate ?? null,
      soldOut: input.sold_out ?? false,
      active: input.active ?? true,
    }).returning({ id: restoMenuItems.id });
    itemId = ins[0]!.id;
    created = true;
  }

  // ── Nhóm tùy chọn: upsert nhóm + lựa chọn theo TÊN, link vào món ──
  let optionsLinked = 0;
  if (input.options?.length) {
    for (const g of input.options) {
      const gq = g.group.trim().toLowerCase();
      const gRows = await ctx.db.select().from(restoOptionGroups)
        .where(and(eq(restoOptionGroups.orgId, ctx.orgId),
          sql`lower(${restoOptionGroups.name}) = ${gq}`)).limit(1);
      let groupId: string;
      const min = g.min ?? (g.required ? 1 : 0);
      const max = g.max ?? Math.max(1, min);
      const required = g.required ?? min > 0;
      if (gRows[0]) {
        groupId = gRows[0].id;
        await ctx.db.update(restoOptionGroups)
          .set({ minSelect: min, maxSelect: max, required, updatedAt: new Date() })
          .where(and(eq(restoOptionGroups.orgId, ctx.orgId), eq(restoOptionGroups.id, groupId)));
      } else {
        const gi = await ctx.db.insert(restoOptionGroups).values({
          orgId: ctx.orgId, name: g.group.trim(),
          minSelect: min, maxSelect: max, required,
        }).returning({ id: restoOptionGroups.id });
        groupId = gi[0]!.id;
      }
      for (const c of g.choices) {
        const cq = c.name.trim().toLowerCase();
        const exist = await ctx.db.select().from(restoOptions)
          .where(and(eq(restoOptions.orgId, ctx.orgId), eq(restoOptions.groupId, groupId),
            sql`lower(${restoOptions.name}) = ${cq}`)).limit(1);
        if (exist[0]) {
          await ctx.db.update(restoOptions)
            .set({ priceDelta: c.price_delta ?? '0', active: true, updatedAt: new Date() })
            .where(and(eq(restoOptions.orgId, ctx.orgId), eq(restoOptions.id, exist[0].id)));
        } else {
          await ctx.db.insert(restoOptions).values({
            orgId: ctx.orgId, groupId,
            name: c.name.trim(), priceDelta: c.price_delta ?? '0',
          });
        }
      }
      await ctx.db.insert(restoItemOptionGroups)
        .values({ orgId: ctx.orgId, itemId, groupId })
        .onConflictDoNothing();
      optionsLinked += 1;
    }
  }

  // ── Combo: thành phần phải là món single có sẵn ──
  let comboComponents = 0;
  if (kind === 'combo' && input.combo_items?.length) {
    await ctx.db.delete(restoComboItems)
      .where(and(eq(restoComboItems.orgId, ctx.orgId), eq(restoComboItems.comboId, itemId)));
    for (const comp of input.combo_items) {
      const compItem = await resolveMenuItem(ctx, { name: comp.name });
      if (compItem.kind !== 'single') {
        throw new RestoError('COMBO_INVALID', `Thành phần combo phải là món đơn — "${compItem.name}" là combo`);
      }
      if (compItem.id === itemId) {
        throw new RestoError('COMBO_INVALID', 'Combo không thể chứa chính nó');
      }
      await ctx.db.insert(restoComboItems).values({
        orgId: ctx.orgId, comboId: itemId,
        componentItemId: compItem.id, qty: f3(d3(comp.qty)),
      });
      comboComponents += 1;
    }
  }

  const priceOut = input.price ?? existing?.price ?? '0';
  await ctx.bus.emit('resto.menu.item_upserted', {
    org_id: ctx.orgId, item: input.name.trim(), kind, price: priceOut, created,
  });
  return { id: itemId, name: input.name.trim(), price: priceOut, kind, created, options_linked: optionsLinked, combo_components: comboComponents };
}

/** Báo hết món / mở bán lại */
export async function setAvailability(ctx: RestoCtx, input: { name?: string; sku?: string; sold_out: boolean }): Promise<{ name: string; sold_out: boolean }> {
  const item = await resolveMenuItem(ctx, input);
  await ctx.db.update(restoMenuItems)
    .set({ soldOut: input.sold_out, updatedAt: new Date() })
    .where(and(eq(restoMenuItems.orgId, ctx.orgId), eq(restoMenuItems.id, item.id)));
  await ctx.bus.emit('resto.menu.availability_changed', {
    org_id: ctx.orgId, item: item.name, sold_out: input.sold_out,
  });
  return { name: item.name, sold_out: input.sold_out };
}

export interface MenuSearchRow {
  name: string; sku: string | null; price: string; price_fmt: string;
  unit: string; kind: string; sold_out: boolean; active: boolean;
  category: string | null; has_options: boolean;
}

/** Tra menu theo từ khóa/danh mục */
export async function menuSearch(ctx: RestoCtx, input: {
  query?: string; category?: string; include_soldout: boolean; limit: number;
}): Promise<{ total: number; items: MenuSearchRow[] }> {
  const conds = [eq(restoMenuItems.orgId, ctx.orgId), eq(restoMenuItems.active, true)];
  if (!input.include_soldout) conds.push(eq(restoMenuItems.soldOut, false));
  if (input.query?.trim()) {
    const q = `%${input.query.trim()}%`;
    conds.push(or(ilike(restoMenuItems.name, q), ilike(restoMenuItems.sku, q), ilike(restoMenuItems.description, q))!);
  }
  if (input.category) {
    const cats = await ctx.db.select().from(restoMenuCategories)
      .where(and(eq(restoMenuCategories.orgId, ctx.orgId),
        sql`lower(${restoMenuCategories.name}) = ${input.category.trim().toLowerCase()}`)).limit(1);
    if (!cats[0]) throw new RestoError('CATEGORY_NOT_FOUND', `Không có danh mục "${input.category}"`);
    conds.push(eq(restoMenuItems.categoryId, cats[0].id));
  }

  const rows = await ctx.db.select().from(restoMenuItems).where(and(...conds))
    .orderBy(asc(restoMenuItems.sortOrder), asc(restoMenuItems.name)).limit(input.limit);

  const catIds = [...new Set(rows.map((r) => r.categoryId).filter((v): v is string => Boolean(v)))];
  const cats = catIds.length
    ? await ctx.db.select().from(restoMenuCategories)
        .where(and(eq(restoMenuCategories.orgId, ctx.orgId), inArray(restoMenuCategories.id, catIds)))
    : [];
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  const itemIds = rows.map((r) => r.id);
  const links = itemIds.length
    ? await ctx.db.select().from(restoItemOptionGroups)
        .where(and(eq(restoItemOptionGroups.orgId, ctx.orgId), inArray(restoItemOptionGroups.itemId, itemIds)))
    : [];
  const hasOpts = new Set(links.map((l) => l.itemId));

  return {
    total: rows.length,
    items: rows.map((r) => ({
      name: r.name, sku: r.sku, price: r.price, price_fmt: fmtVnd(r.price),
      unit: r.unit, kind: r.kind, sold_out: r.soldOut, active: r.active,
      category: r.categoryId ? (catName.get(r.categoryId) ?? null) : null,
      has_options: hasOpts.has(r.id),
    })),
  };
}

/** Chi tiết 1 món: tùy chọn, thành phần combo, định lượng */
export async function itemInfo(ctx: RestoCtx, ref: { name?: string; sku?: string }): Promise<{
  name: string; sku: string | null; price: string; price_fmt: string; unit: string;
  kind: string; sold_out: boolean; active: boolean; description: string | null;
  option_groups: Array<{ group: string; required: boolean; min: number; max: number;
    choices: Array<{ name: string; price_delta: string }> }>;
  combo_items: Array<{ name: string; qty: string }>;
  recipe: Array<{ sku: string; name: string; qty: string; unit: string }>;
}> {
  const item = await resolveMenuItem(ctx, ref);
  const groups = await loadItemOptionGroups(ctx, item.id);

  const comps = await ctx.db
    .select({ qty: restoComboItems.qty, name: restoMenuItems.name })
    .from(restoComboItems)
    .innerJoin(restoMenuItems, and(
      eq(restoMenuItems.orgId, ctx.orgId),
      eq(restoMenuItems.id, restoComboItems.componentItemId)))
    .where(and(eq(restoComboItems.orgId, ctx.orgId), eq(restoComboItems.comboId, item.id)));

  const recipe = await ctx.db.select().from(restoRecipes)
    .where(and(eq(restoRecipes.orgId, ctx.orgId), eq(restoRecipes.menuItemId, item.id)));

  return {
    name: item.name, sku: item.sku, price: item.price, price_fmt: fmtVnd(item.price),
    unit: item.unit, kind: item.kind, sold_out: item.soldOut, active: item.active,
    description: item.description,
    option_groups: groups.map((g) => ({
      group: g.name, required: g.required, min: g.minSelect, max: g.maxSelect,
      choices: g.choices.map((c) => ({ name: c.name, price_delta: c.priceDelta })),
    })),
    combo_items: comps.map((c) => ({ name: c.name, qty: fmtQty(c.qty) })),
    recipe: recipe.map((r) => ({ sku: r.khoSku, name: r.khoItemName, qty: fmtQty(r.qty), unit: r.unit })),
  };
}

export interface LoadedOptionGroup {
  id: string; name: string; required: boolean; minSelect: number; maxSelect: number;
  choices: Array<{ id: string; name: string; priceDelta: string }>;
}

/** Nạp nhóm tùy chọn + lựa chọn của một món (dùng cho order.add_items) */
export async function loadItemOptionGroups(ctx: RestoCtx, itemId: string): Promise<LoadedOptionGroup[]> {
  const links = await ctx.db.select().from(restoItemOptionGroups)
    .where(and(eq(restoItemOptionGroups.orgId, ctx.orgId), eq(restoItemOptionGroups.itemId, itemId)))
    .orderBy(asc(restoItemOptionGroups.sortOrder));
  if (!links.length) return [];
  const groupIds = links.map((l) => l.groupId);
  const groups = await ctx.db.select().from(restoOptionGroups)
    .where(and(eq(restoOptionGroups.orgId, ctx.orgId),
      inArray(restoOptionGroups.id, groupIds), eq(restoOptionGroups.active, true)));
  const opts = await ctx.db.select().from(restoOptions)
    .where(and(eq(restoOptions.orgId, ctx.orgId),
      inArray(restoOptions.groupId, groupIds), eq(restoOptions.active, true)))
    .orderBy(asc(restoOptions.sortOrder), asc(restoOptions.name));
  const byGroup = new Map<string, Array<{ id: string; name: string; priceDelta: string }>>();
  for (const o of opts) {
    if (!byGroup.has(o.groupId)) byGroup.set(o.groupId, []);
    byGroup.get(o.groupId)!.push({ id: o.id, name: o.name, priceDelta: o.priceDelta });
  }
  const order = new Map(links.map((l, i) => [l.groupId, i]));
  return groups
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((g) => ({
      id: g.id, name: g.name, required: g.required,
      minSelect: g.minSelect, maxSelect: g.maxSelect,
      choices: byGroup.get(g.id) ?? [],
    }));
}

/** Khai định lượng nguyên liệu cho món (nối Kho qua SKU) */
export async function setRecipe(ctx: RestoCtx, input: {
  item: string;
  lines: Array<{ sku: string; name?: string; qty: string; unit?: string }>;
  replace: boolean;
}): Promise<{ item: string; lines: number }> {
  const item = await resolveMenuItem(ctx, { name: input.item });
  if (input.replace) {
    await ctx.db.delete(restoRecipes)
      .where(and(eq(restoRecipes.orgId, ctx.orgId), eq(restoRecipes.menuItemId, item.id)));
  }
  for (const line of input.lines) {
    await ctx.db.insert(restoRecipes).values({
      orgId: ctx.orgId, menuItemId: item.id,
      khoSku: line.sku.trim(), khoItemName: line.name ?? '',
      qty: f3(d3(line.qty)), unit: line.unit ?? '',
    }).onConflictDoUpdate({
      target: [restoRecipes.orgId, restoRecipes.menuItemId, restoRecipes.khoSku],
      set: { qty: f3(d3(line.qty)), khoItemName: line.name ?? '', unit: line.unit ?? '', updatedAt: new Date() },
    });
  }
  await ctx.bus.emit('resto.recipe.updated', {
    org_id: ctx.orgId, item: item.name, lines: input.lines.length,
  });
  return { item: item.name, lines: input.lines.length };
}

/** Món nào chưa khai định lượng (vệ sinh food-cost) */
export async function recipeCoverage(ctx: RestoCtx): Promise<{
  total_active: number; with_recipe: number;
  missing: string[]; combos_with_gaps: string[];
}> {
  const items = await ctx.db.select().from(restoMenuItems)
    .where(and(eq(restoMenuItems.orgId, ctx.orgId), eq(restoMenuItems.active, true)));
  const recipes = await ctx.db.select({ mid: restoRecipes.menuItemId }).from(restoRecipes)
    .where(eq(restoRecipes.orgId, ctx.orgId));
  const hasRecipe = new Set(recipes.map((r) => r.mid));
  const combos = items.filter((i) => i.kind === 'combo');
  const singles = items.filter((i) => i.kind === 'single');
  const missing = singles.filter((i) => !hasRecipe.has(i.id)).map((i) => i.name);

  const comboGaps: string[] = [];
  if (combos.length) {
    const comps = await ctx.db.select().from(restoComboItems)
      .where(and(eq(restoComboItems.orgId, ctx.orgId),
        inArray(restoComboItems.comboId, combos.map((c) => c.id))));
    for (const combo of combos) {
      const mine = comps.filter((c) => c.comboId === combo.id);
      const gap = mine.some((c) => !hasRecipe.has(c.componentItemId));
      if (!mine.length || gap) comboGaps.push(combo.name);
    }
  }
  return {
    total_active: items.length,
    with_recipe: singles.length - missing.length,
    missing, combos_with_gaps: comboGaps,
  };
}

/** Bung định lượng cho danh sách dòng đơn → gộp theo SKU (event trừ kho).
 *  Combo bung thành phần; thành phần nào không có recipe → bỏ qua dòng đó
 *  (không chặn thanh toán — ghi missing để chủ quán biết mà bổ sung). */
export async function expandDeductionLines(
  ctx: RestoCtx,
  orderLines: Array<{ menuItemId: string | null; name: string; qty: string }>,
): Promise<{ lines: Array<{ sku: string; name: string; qty: string; unit: string }>; missing_recipe: string[] }> {
  const itemIds = [...new Set(orderLines.map((l) => l.menuItemId).filter((v): v is string => Boolean(v)))];
  if (!itemIds.length) return { lines: [], missing_recipe: [] };

  const items = await ctx.db.select().from(restoMenuItems)
    .where(and(eq(restoMenuItems.orgId, ctx.orgId), inArray(restoMenuItems.id, itemIds)));
  const itemById = new Map(items.map((i) => [i.id, i]));

  const comboIds = items.filter((i) => i.kind === 'combo').map((i) => i.id);
  const comps = comboIds.length
    ? await ctx.db.select().from(restoComboItems)
        .where(and(eq(restoComboItems.orgId, ctx.orgId), inArray(restoComboItems.comboId, comboIds)))
    : [];
  const compItemIds = comps.map((c) => c.componentItemId).filter((cid) => !itemById.has(cid));
  if (compItemIds.length) {
    const compItems = await ctx.db.select().from(restoMenuItems)
      .where(and(eq(restoMenuItems.orgId, ctx.orgId), inArray(restoMenuItems.id, [...new Set(compItemIds)])));
    for (const ci of compItems) itemById.set(ci.id, ci);
  }

  const allRecipeItemIds = [...new Set([
    ...items.filter((i) => i.kind === 'single').map((i) => i.id),
    ...comps.map((c) => c.componentItemId),
  ])];
  const recipes = allRecipeItemIds.length
    ? await ctx.db.select().from(restoRecipes)
        .where(and(eq(restoRecipes.orgId, ctx.orgId), inArray(restoRecipes.menuItemId, allRecipeItemIds)))
    : [];
  const recipesByItem = new Map<string, typeof recipes>();
  for (const r of recipes) {
    if (!recipesByItem.has(r.menuItemId)) recipesByItem.set(r.menuItemId, []);
    recipesByItem.get(r.menuItemId)!.push(r);
  }

  const agg = new Map<string, { sku: string; name: string; qty: bigint; unit: string }>();
  const missing = new Set<string>();
  const addRecipe = (menuItemId: string, displayName: string, qty3: bigint) => {
    const rs = recipesByItem.get(menuItemId);
    if (!rs?.length) { missing.add(displayName); return; }
    for (const r of rs) {
      const add = mulQty(d3(r.qty), qty3);
      const cur = agg.get(r.khoSku);
      if (cur) cur.qty += add;
      else agg.set(r.khoSku, { sku: r.khoSku, name: r.khoItemName || r.khoSku, qty: add, unit: r.unit });
    }
  };

  for (const line of orderLines) {
    if (!line.menuItemId) { missing.add(line.name); continue; }
    const item = itemById.get(line.menuItemId);
    if (!item) { missing.add(line.name); continue; }
    const qty3 = d3(line.qty);
    if (item.kind === 'combo') {
      const mine = comps.filter((c) => c.comboId === item.id);
      if (!mine.length) { missing.add(item.name); continue; }
      for (const c of mine) {
        const compItem = itemById.get(c.componentItemId);
        const compName = compItem?.name ?? c.componentItemId;
        addRecipe(c.componentItemId, `${item.name} → ${compName}`, mulQty(d3(c.qty), qty3));
      }
    } else {
      addRecipe(item.id, item.name, qty3);
    }
  }

  return {
    lines: [...agg.values()].map((a) => ({ sku: a.sku, name: a.name, qty: f3(a.qty), unit: a.unit })),
    missing_recipe: [...missing],
  };
}
