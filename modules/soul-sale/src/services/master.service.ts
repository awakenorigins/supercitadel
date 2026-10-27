/** SOUL-SALE 1A — master.service.ts: khách hàng, phân khúc, cây kênh (closure table), hồ sơ agency/retailer, merge, dup-check. */
import { and, eq, ne, or, ilike, inArray, sql, desc } from 'drizzle-orm';
import {
  ssCustomers, ssCustomerContacts, ssCustomerAddresses, ssCustomerSegments, ssCustomerRelationships,
  ssTerritories, ssAgencyProfiles, ssRetailerProfiles, ssPipelines, ssPipelineStages, ssPaymentTerms,
  ssPriceBooks, ssDeals, ssQuotes, ssOrders, ssPayments, ssCreditLimits, ssTargets, ssCommissionEntries,
  ssDebtSnapshots, ssAgencyStatements, ssImportRows, ssScores, ssSuggestions, ssActivities,
} from '../schema.js';
import type { Db, Ctx } from '../contract.js';
import { vnNorm, normPhone, nextCode, bad, addV, ZERO, nowOf } from '../lib/util.js';

/* ---------- seed mặc định (idempotent, per-org) ---------- */
export async function ensureDefaults(db: Db, ctx: Ctx) {
  const org = ctx.orgId;
  const pipes = await db.select().from(ssPipelines).where(and(eq(ssPipelines.orgId, org), eq(ssPipelines.code, 'MAIN')));
  if (pipes.length === 0) {
    const [p] = await db.insert(ssPipelines).values({ orgId: org, code: 'MAIN', name: 'Pipeline chuẩn', isDefault: true, createdBy: ctx.userId }).returning();
    const stages = [
      { name: 'Mới', sortOrder: 1, probability: 10 },
      { name: 'Tiếp cận', sortOrder: 2, probability: 30 },
      { name: 'Báo giá', sortOrder: 3, probability: 60 },
      { name: 'Thắng', sortOrder: 4, probability: 100, isWon: true },
      { name: 'Thua', sortOrder: 5, probability: 0, isLost: true },
    ];
    await db.insert(ssPipelineStages).values(stages.map((s) => ({ ...s, orgId: org, pipelineId: p!.id })));
  }
  const terms = await db.select().from(ssPaymentTerms).where(eq(ssPaymentTerms.orgId, org));
  if (terms.length === 0) {
    await db.insert(ssPaymentTerms).values([
      { orgId: org, code: 'COD', name: 'Thanh toán ngay', days: 0, depositPct: '0', createdBy: ctx.userId },
      { orgId: org, code: 'DEP30', name: 'Cọc 30%, còn lại khi giao', days: 0, depositPct: '30', createdBy: ctx.userId },
      { orgId: org, code: 'NET7', name: 'Công nợ 7 ngày', days: 7, depositPct: '0', createdBy: ctx.userId },
      { orgId: org, code: 'NET15', name: 'Công nợ 15 ngày', days: 15, depositPct: '0', createdBy: ctx.userId },
      { orgId: org, code: 'NET30', name: 'Công nợ 30 ngày', days: 30, depositPct: '0', createdBy: ctx.userId },
    ]);
  }
  const books = await db.select().from(ssPriceBooks).where(and(eq(ssPriceBooks.orgId, org), eq(ssPriceBooks.code, 'DEFAULT')));
  if (books.length === 0) {
    await db.insert(ssPriceBooks).values({ orgId: org, code: 'DEFAULT', name: 'Bảng giá chung', channel: 'all', createdBy: ctx.userId });
  }
}

/* ---------- segments / territories ---------- */
export async function ensureSegment(db: Db, ctx: Ctx, code: string, name?: string) {
  const found = await db.select().from(ssCustomerSegments)
    .where(and(eq(ssCustomerSegments.orgId, ctx.orgId), eq(ssCustomerSegments.code, code)));
  if (found[0]) return found[0];
  const [row] = await db.insert(ssCustomerSegments)
    .values({ orgId: ctx.orgId, code, name: name ?? code, createdBy: ctx.userId }).returning();
  return row!;
}

export async function ensureTerritory(db: Db, ctx: Ctx, code: string, name?: string, parentId?: string | null) {
  const found = await db.select().from(ssTerritories)
    .where(and(eq(ssTerritories.orgId, ctx.orgId), eq(ssTerritories.code, code)));
  if (found[0]) return found[0];
  const [row] = await db.insert(ssTerritories)
    .values({ orgId: ctx.orgId, code, name: name ?? code, parentId: parentId ?? null, createdBy: ctx.userId }).returning();
  return row!;
}

/* ---------- customers ---------- */
export interface CustomerInput {
  kind: 'person' | 'company' | 'agency' | 'retailer' | 'distributor';
  name: string; phone?: string; email?: string; taxCode?: string;
  segmentCode?: string; ownerUserId?: string; note?: string; code?: string;
}

export async function createCustomer(db: Db, ctx: Ctx, input: CustomerInput) {
  const code = input.code ?? (await nextCode(db, ctx, 'KH'));
  let segmentId: string | null = null;
  if (input.segmentCode) segmentId = (await ensureSegment(db, ctx, input.segmentCode)).id;
  const [row] = await db.insert(ssCustomers).values({
    orgId: ctx.orgId, code, kind: input.kind, name: input.name, nameNorm: vnNorm(input.name),
    phone: normPhone(input.phone), email: input.email ?? null, taxCode: input.taxCode ?? null,
    segmentId, ownerUserId: input.ownerUserId ?? ctx.userId, note: input.note ?? null, createdBy: ctx.userId,
  }).returning();
  // closure self-row
  await db.insert(ssCustomerRelationships).values({ orgId: ctx.orgId, ancestorId: row!.id, descendantId: row!.id, depth: 0 });
  await ctx.emit?.('soulsale.customer.created', { customer_id: row!.id, code, kind: input.kind, name: input.name });
  return row!;
}

export async function updateCustomer(db: Db, ctx: Ctx, input: { customerId: string } & Partial<Omit<CustomerInput, 'kind' | 'code'>>) {
  const cur = await getCustomer(db, ctx, input.customerId);
  const patch: Record<string, unknown> = { updatedAt: nowOf(ctx) };
  if (input.name !== undefined) { patch.name = input.name; patch.nameNorm = vnNorm(input.name); }
  if (input.phone !== undefined) patch.phone = normPhone(input.phone);
  if (input.email !== undefined) patch.email = input.email;
  if (input.taxCode !== undefined) patch.taxCode = input.taxCode;
  if (input.ownerUserId !== undefined) patch.ownerUserId = input.ownerUserId;
  if (input.note !== undefined) patch.note = input.note;
  if (input.segmentCode !== undefined) patch.segmentId = (await ensureSegment(db, ctx, input.segmentCode)).id;
  const [row] = await db.update(ssCustomers).set(patch)
    .where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.id, cur.id))).returning();
  return row!;
}

export async function getCustomer(db: Db, ctx: Ctx, id: string) {
  const rows = await db.select().from(ssCustomers).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.id, id)));
  if (!rows[0]) bad('CUSTOMER_NOT_FOUND', `Không tìm thấy khách hàng ${id}`);
  return rows[0]!;
}

export async function searchCustomers(db: Db, ctx: Ctx, p: { q?: string; kind?: string; limit?: number }) {
  const conds = [eq(ssCustomers.orgId, ctx.orgId), ne(ssCustomers.status, 'merged')];
  if (p.kind) conds.push(eq(ssCustomers.kind, p.kind));
  if (p.q) {
    const qn = vnNorm(p.q); const ph = normPhone(p.q);
    conds.push(or(
      ilike(ssCustomers.code, `%${p.q}%`),
      ilike(ssCustomers.nameNorm, `%${qn}%`),
      ...(ph ? [eq(ssCustomers.phone, ph)] : []),
    )!);
  }
  return db.select().from(ssCustomers).where(and(...conds)).orderBy(desc(ssCustomers.createdAt)).limit(p.limit ?? 20);
}

export async function addContact(db: Db, ctx: Ctx, p: { customerId: string; name: string; role?: string; phone?: string; email?: string; isPrimary?: boolean }) {
  await getCustomer(db, ctx, p.customerId);
  const [row] = await db.insert(ssCustomerContacts).values({
    orgId: ctx.orgId, customerId: p.customerId, name: p.name, role: p.role ?? null,
    phone: normPhone(p.phone), email: p.email ?? null, isPrimary: p.isPrimary ?? false, createdBy: ctx.userId,
  }).returning();
  return row!;
}

export async function addAddress(db: Db, ctx: Ctx, p: { customerId: string; kind?: 'shipping' | 'billing' | 'warehouse'; line: string; ward?: string; district?: string; province?: string; isDefault?: boolean }) {
  await getCustomer(db, ctx, p.customerId);
  const [row] = await db.insert(ssCustomerAddresses).values({
    orgId: ctx.orgId, customerId: p.customerId, kind: p.kind ?? 'shipping', line: p.line,
    ward: p.ward ?? null, district: p.district ?? null, province: p.province ?? null,
    isDefault: p.isDefault ?? false, createdBy: ctx.userId,
  }).returning();
  return row!;
}

/* ---------- closure table helpers ---------- */
async function linkUnderParent(db: Db, ctx: Ctx, parentId: string, childId: string) {
  // mọi tổ tiên của parent (kể cả chính nó) → thêm cạnh tới child với depth+1
  const ancestors = await db.select().from(ssCustomerRelationships)
    .where(and(eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.descendantId, parentId)));
  if (ancestors.length === 0) bad('PARENT_NOT_FOUND', 'Parent chưa có trong cây kênh');
  await db.insert(ssCustomerRelationships).values(
    ancestors.map((a) => ({ orgId: ctx.orgId, ancestorId: a.ancestorId, descendantId: childId, depth: a.depth + 1 })),
  );
}

export async function ancestorsOf(db: Db, ctx: Ctx, customerId: string) {
  return db.select().from(ssCustomerRelationships)
    .where(and(eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.descendantId, customerId), sql`${ssCustomerRelationships.depth} > 0`))
    .orderBy(desc(ssCustomerRelationships.depth));
}

export async function subtreeIds(db: Db, ctx: Ctx, rootId: string): Promise<string[]> {
  const rows = await db.select({ id: ssCustomerRelationships.descendantId }).from(ssCustomerRelationships)
    .where(and(eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.ancestorId, rootId)));
  return rows.map((r) => r.id);
}

/** Đại lý gốc (level cao nhất trong chuỗi tổ tiên) của một khách — phục vụ rollup doanh số/hoa hồng. */
export async function rootAgencyOf(db: Db, ctx: Ctx, customerId: string): Promise<string | null> {
  const anc = await ancestorsOf(db, ctx, customerId);
  const ids = [customerId, ...anc.map((a) => a.ancestorId)];
  const custs = await db.select().from(ssCustomers)
    .where(and(eq(ssCustomers.orgId, ctx.orgId), inArray(ssCustomers.id, ids), inArray(ssCustomers.kind, ['agency', 'distributor'])));
  if (custs.length === 0) return null;
  // xa gốc cây nhất = depth lớn nhất trong anc; chọn ancestor agency có depth lớn nhất, hoặc chính nó
  const depthMap = new Map<string, number>([[customerId, 0], ...anc.map((a) => [a.ancestorId, a.depth] as [string, number])]);
  custs.sort((a, b) => (depthMap.get(b.id) ?? 0) - (depthMap.get(a.id) ?? 0));
  return custs[0]!.id;
}

/* ---------- agency / retailer ---------- */
export async function createAgency(db: Db, ctx: Ctx, input: Omit<CustomerInput, 'kind'> & { level?: number; parentAgencyCustomerId?: string; territoryCode?: string; managerUserId?: string; discountTier?: string }) {
  if (input.parentAgencyCustomerId) {
    const parent = await getCustomer(db, ctx, input.parentAgencyCustomerId);
    if (!['agency', 'distributor'].includes(parent.kind)) bad('PARENT_NOT_AGENCY', 'Parent phải là agency/distributor');
  }
  const cust = await createCustomer(db, ctx, { ...input, kind: 'agency', segmentCode: input.segmentCode ?? `AG${input.level ?? 1}` });
  let territoryId: string | null = null;
  if (input.territoryCode) territoryId = (await ensureTerritory(db, ctx, input.territoryCode)).id;
  await db.insert(ssAgencyProfiles).values({
    orgId: ctx.orgId, customerId: cust.id, level: input.level ?? 1,
    parentAgencyCustomerId: input.parentAgencyCustomerId ?? null, territoryId,
    discountTier: input.discountTier ?? null, managerUserId: input.managerUserId ?? null, createdBy: ctx.userId,
  });
  if (input.parentAgencyCustomerId) await linkUnderParent(db, ctx, input.parentAgencyCustomerId, cust.id);
  return cust;
}

export async function createRetailer(db: Db, ctx: Ctx, input: Omit<CustomerInput, 'kind'> & { parentAgencyCustomerId?: string; shopType?: string; territoryCode?: string }) {
  if (input.parentAgencyCustomerId) {
    const parent = await getCustomer(db, ctx, input.parentAgencyCustomerId);
    if (!['agency', 'distributor'].includes(parent.kind)) bad('PARENT_NOT_AGENCY', 'Parent phải là agency/distributor');
  }
  const cust = await createCustomer(db, ctx, { ...input, kind: 'retailer', segmentCode: input.segmentCode ?? 'RETAIL' });
  let territoryId: string | null = null;
  if (input.territoryCode) territoryId = (await ensureTerritory(db, ctx, input.territoryCode)).id;
  await db.insert(ssRetailerProfiles).values({
    orgId: ctx.orgId, customerId: cust.id, parentAgencyCustomerId: input.parentAgencyCustomerId ?? null,
    shopType: input.shopType ?? null, territoryId, createdBy: ctx.userId,
  });
  if (input.parentAgencyCustomerId) await linkUnderParent(db, ctx, input.parentAgencyCustomerId, cust.id);
  return cust;
}

/** Đổi cha một node (agency/retailer) — closure move chuẩn, chống gắn vào chính hậu duệ. */
export async function moveAgency(db: Db, ctx: Ctx, p: { customerId: string; newParentId: string | null }) {
  const cust = await getCustomer(db, ctx, p.customerId);
  if (!['agency', 'retailer', 'distributor'].includes(cust.kind)) bad('NOT_CHANNEL_NODE', 'Chỉ di chuyển node kênh (agency/retailer/distributor)');
  const sub = await subtreeIds(db, ctx, p.customerId);
  if (p.newParentId) {
    if (sub.includes(p.newParentId)) bad('CYCLE', 'Không thể gắn vào chính tuyến dưới của node này');
    await getCustomer(db, ctx, p.newParentId);
  }
  // 1) cắt: xoá mọi cạnh (ancestor ngoài subtree) → (descendant trong subtree)
  await db.delete(ssCustomerRelationships).where(and(
    eq(ssCustomerRelationships.orgId, ctx.orgId),
    inArray(ssCustomerRelationships.descendantId, sub),
    sql`${ssCustomerRelationships.ancestorId} NOT IN (SELECT descendant_id FROM "soulsale"."ss_customer_relationships" WHERE org_id = ${ctx.orgId} AND ancestor_id = ${p.customerId})`,
  ));
  // 2) nối: (tổ tiên mới ⊇ newParent) × (subtree) với depth = d(anc→newParent) + 1 + d(root→node)
  if (p.newParentId) {
    const newAnc = await db.select().from(ssCustomerRelationships)
      .where(and(eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.descendantId, p.newParentId)));
    const subRows = await db.select().from(ssCustomerRelationships)
      .where(and(eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.ancestorId, p.customerId)));
    const values = newAnc.flatMap((a) => subRows.map((s) => ({
      orgId: ctx.orgId, ancestorId: a.ancestorId, descendantId: s.descendantId, depth: a.depth + 1 + s.depth,
    })));
    if (values.length) await db.insert(ssCustomerRelationships).values(values);
  }
  // 3) cập nhật profile parent
  await db.update(ssAgencyProfiles).set({ parentAgencyCustomerId: p.newParentId })
    .where(and(eq(ssAgencyProfiles.orgId, ctx.orgId), eq(ssAgencyProfiles.customerId, p.customerId)));
  await db.update(ssRetailerProfiles).set({ parentAgencyCustomerId: p.newParentId })
    .where(and(eq(ssRetailerProfiles.orgId, ctx.orgId), eq(ssRetailerProfiles.customerId, p.customerId)));
  return { moved: p.customerId, newParent: p.newParentId, subtreeSize: sub.length };
}

export async function assignTerritory(db: Db, ctx: Ctx, p: { customerId: string; territoryCode: string; territoryName?: string }) {
  const terr = await ensureTerritory(db, ctx, p.territoryCode, p.territoryName);
  const ag = await db.update(ssAgencyProfiles).set({ territoryId: terr.id })
    .where(and(eq(ssAgencyProfiles.orgId, ctx.orgId), eq(ssAgencyProfiles.customerId, p.customerId))).returning();
  const rt = await db.update(ssRetailerProfiles).set({ territoryId: terr.id })
    .where(and(eq(ssRetailerProfiles.orgId, ctx.orgId), eq(ssRetailerProfiles.customerId, p.customerId))).returning();
  if (ag.length === 0 && rt.length === 0) bad('NO_CHANNEL_PROFILE', 'Khách này chưa có hồ sơ agency/retailer để gán khu vực');
  return { customerId: p.customerId, territory: terr.code };
}

/* ---------- cây & tra cứu kênh ---------- */
export async function agencyTree(db: Db, ctx: Ctx, p?: { rootId?: string }) {
  const custs = await db.select().from(ssCustomers).where(and(
    eq(ssCustomers.orgId, ctx.orgId), ne(ssCustomers.status, 'merged'),
    inArray(ssCustomers.kind, ['agency', 'retailer', 'distributor']),
  ));
  const edges = await db.select().from(ssCustomerRelationships).where(and(
    eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.depth, 1),
  ));
  const byId = new Map(custs.map((c) => [c.id, { id: c.id, code: c.code, name: c.name, kind: c.kind, children: [] as unknown[] }]));
  const hasParent = new Set<string>();
  for (const e of edges) {
    const parent = byId.get(e.ancestorId); const child = byId.get(e.descendantId);
    if (parent && child) { parent.children.push(child); hasParent.add(child.id); }
  }
  if (p?.rootId) return byId.get(p.rootId) ?? bad('CUSTOMER_NOT_FOUND', 'Không thấy node gốc');
  return [...byId.values()].filter((n) => !hasParent.has(n.id));
}

export async function retailersByAgency(db: Db, ctx: Ctx, p: { agencyCustomerId: string; includeSub?: boolean }) {
  const ids = p.includeSub === false
    ? (await db.select().from(ssCustomerRelationships).where(and(
        eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.ancestorId, p.agencyCustomerId), eq(ssCustomerRelationships.depth, 1),
      ))).map((r) => r.descendantId)
    : await subtreeIds(db, ctx, p.agencyCustomerId);
  if (ids.length === 0) return [];
  return db.select().from(ssCustomers).where(and(
    eq(ssCustomers.orgId, ctx.orgId), inArray(ssCustomers.id, ids), eq(ssCustomers.kind, 'retailer'), ne(ssCustomers.status, 'merged'),
  ));
}

export async function customerProfile(db: Db, ctx: Ctx, p: { customerId: string }) {
  const cust = await getCustomer(db, ctx, p.customerId);
  const [contacts, addresses, agp, rtp, credit, anc] = await Promise.all([
    db.select().from(ssCustomerContacts).where(and(eq(ssCustomerContacts.orgId, ctx.orgId), eq(ssCustomerContacts.customerId, cust.id))),
    db.select().from(ssCustomerAddresses).where(and(eq(ssCustomerAddresses.orgId, ctx.orgId), eq(ssCustomerAddresses.customerId, cust.id))),
    db.select().from(ssAgencyProfiles).where(and(eq(ssAgencyProfiles.orgId, ctx.orgId), eq(ssAgencyProfiles.customerId, cust.id))),
    db.select().from(ssRetailerProfiles).where(and(eq(ssRetailerProfiles.orgId, ctx.orgId), eq(ssRetailerProfiles.customerId, cust.id))),
    db.select().from(ssCreditLimits).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, cust.id))),
    ancestorsOf(db, ctx, cust.id),
  ]);
  let parents: { id: string; name: string; depth: number }[] = [];
  if (anc.length) {
    const pc = await db.select().from(ssCustomers).where(and(eq(ssCustomers.orgId, ctx.orgId), inArray(ssCustomers.id, anc.map((a) => a.ancestorId))));
    const nameMap = new Map(pc.map((c) => [c.id, c.name]));
    parents = anc.map((a) => ({ id: a.ancestorId, name: nameMap.get(a.ancestorId) ?? '?', depth: a.depth })).sort((a, b) => b.depth - a.depth);
  }
  return { customer: cust, contacts, addresses, agencyProfile: agp[0] ?? null, retailerProfile: rtp[0] ?? null, creditLimit: credit[0] ?? null, parentChain: parents };
}

export async function customerHistory(db: Db, ctx: Ctx, p: { customerId: string }) {
  const cust = await getCustomer(db, ctx, p.customerId);
  const orders = await db.select().from(ssOrders).where(and(
    eq(ssOrders.orgId, ctx.orgId), eq(ssOrders.customerId, cust.id), ne(ssOrders.status, 'cancelled'),
  )).orderBy(desc(ssOrders.createdAt)).limit(50);
  const pays = await db.select().from(ssPayments).where(and(eq(ssPayments.orgId, ctx.orgId), eq(ssPayments.customerId, cust.id)));
  const acts = await db.select().from(ssActivities).where(and(
    eq(ssActivities.orgId, ctx.orgId), eq(ssActivities.refType, 'customer'), eq(ssActivities.refId, cust.id),
  )).orderBy(desc(ssActivities.createdAt)).limit(10);
  const monetary = orders.reduce((a, o) => addV(a, o.grandTotal), ZERO);
  const lastOrderAt = orders[0]?.createdAt ?? null;
  const recencyDays = lastOrderAt ? Math.floor((nowOf(ctx).getTime() - new Date(lastOrderAt).getTime()) / 86400000) : null;
  return {
    customer: { id: cust.id, code: cust.code, name: cust.name },
    rfm: { recencyDays, frequency: orders.length, monetary },
    orders: orders.slice(0, 10).map((o) => ({ code: o.code, status: o.status, grandTotal: o.grandTotal, at: o.createdAt })),
    paymentsTotal: pays.reduce((a, x) => addV(a, x.kind === 'refund' ? `-${x.amount}` : x.amount), ZERO),
    lastActivities: acts.map((a) => ({ kind: a.kind, subject: a.subject, at: a.createdAt })),
  };
}

/* ---------- duplicate & merge ---------- */
export async function duplicateCheck(db: Db, ctx: Ctx, p: { phone?: string; email?: string; name?: string; excludeId?: string }) {
  const out: { customerId: string; code: string; name: string; score: number; reason: string }[] = [];
  const seen = new Set<string>();
  const push = (c: { id: string; code: string; name: string }, score: number, reason: string) => {
    if (c.id === p.excludeId || seen.has(c.id)) return; seen.add(c.id);
    out.push({ customerId: c.id, code: c.code, name: c.name, score, reason });
  };
  const ph = normPhone(p.phone);
  if (ph) (await db.select().from(ssCustomers).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.phone, ph), ne(ssCustomers.status, 'merged')))).forEach((c) => push(c, 0.95, 'trùng SĐT'));
  if (p.email) (await db.select().from(ssCustomers).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.email, p.email), ne(ssCustomers.status, 'merged')))).forEach((c) => push(c, 0.9, 'trùng email'));
  if (p.name) {
    const nn = vnNorm(p.name);
    (await db.select().from(ssCustomers).where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.nameNorm, nn), ne(ssCustomers.status, 'merged')))).forEach((c) => push(c, 0.8, 'trùng tên (đã bỏ dấu)'));
    (await db.select().from(ssCustomers).where(and(eq(ssCustomers.orgId, ctx.orgId), ilike(ssCustomers.nameNorm, `%${nn}%`), ne(ssCustomers.status, 'merged'))).limit(10)).forEach((c) => push(c, 0.6, 'tên gần giống'));
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}

export async function mergePreview(db: Db, ctx: Ctx, p: { sourceId: string; targetId: string }) {
  const src = await getCustomer(db, ctx, p.sourceId);
  const dst = await getCustomer(db, ctx, p.targetId);
  const children = await db.select().from(ssCustomerRelationships).where(and(
    eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.ancestorId, src.id), eq(ssCustomerRelationships.depth, 1),
  ));
  const count = async (tbl: any, col: any) =>
    (await db.select({ n: sql<number>`count(*)::int` }).from(tbl).where(and(eq(tbl.orgId, ctx.orgId), eq(col, src.id))))[0]!.n;
  return {
    source: { id: src.id, code: src.code, name: src.name },
    target: { id: dst.id, code: dst.code, name: dst.name },
    childrenBlocking: children.length,
    willMove: {
      contacts: await count(ssCustomerContacts, ssCustomerContacts.customerId),
      addresses: await count(ssCustomerAddresses, ssCustomerAddresses.customerId),
      deals: await count(ssDeals, ssDeals.customerId),
      quotes: await count(ssQuotes, ssQuotes.customerId),
      orders: await count(ssOrders, ssOrders.customerId),
      payments: await count(ssPayments, ssPayments.customerId),
    },
  };
}

export async function mergeCustomer(db: Db, ctx: Ctx, p: { sourceId: string; targetId: string }) {
  if (p.sourceId === p.targetId) bad('MERGE_SELF', 'Không thể gộp khách vào chính nó');
  const src = await getCustomer(db, ctx, p.sourceId);
  const dst = await getCustomer(db, ctx, p.targetId);
  if (src.status === 'merged') bad('ALREADY_MERGED', 'Khách nguồn đã bị gộp trước đó');
  if (dst.status === 'merged') bad('TARGET_MERGED', 'Khách đích đã bị gộp — chọn khách khác');
  const children = await db.select().from(ssCustomerRelationships).where(and(
    eq(ssCustomerRelationships.orgId, ctx.orgId), eq(ssCustomerRelationships.ancestorId, src.id), eq(ssCustomerRelationships.depth, 1),
  ));
  if (children.length > 0) bad('HAS_DOWNLINE', `Khách nguồn còn ${children.length} tuyến dưới — chuyển tuyến (agency.move) trước khi gộp`);

  const repoint = async (tbl: { orgId: unknown; customerId: unknown }) =>
    db.update(tbl as never).set({ customerId: dst.id } as never)
      .where(and(eq(tbl.orgId as never, ctx.orgId), eq(tbl.customerId as never, src.id)));
  await repoint(ssCustomerContacts);
  await repoint(ssCustomerAddresses);
  await repoint(ssDeals as unknown as { orgId: unknown; customerId: unknown });
  await repoint(ssQuotes as unknown as { orgId: unknown; customerId: unknown });
  await repoint(ssOrders as unknown as { orgId: unknown; customerId: unknown });
  await repoint(ssPayments as unknown as { orgId: unknown; customerId: unknown });
  await db.update(ssImportRows).set({ matchedCustomerId: dst.id })
    .where(and(eq(ssImportRows.orgId, ctx.orgId), eq(ssImportRows.matchedCustomerId, src.id)));
  await db.update(ssDebtSnapshots).set({ customerId: dst.id })
    .where(and(eq(ssDebtSnapshots.orgId, ctx.orgId), eq(ssDebtSnapshots.customerId, src.id)));
  await db.update(ssAgencyStatements).set({ agencyCustomerId: dst.id })
    .where(and(eq(ssAgencyStatements.orgId, ctx.orgId), eq(ssAgencyStatements.agencyCustomerId, src.id)));
  await db.update(ssTargets).set({ scopeId: dst.id })
    .where(and(eq(ssTargets.orgId, ctx.orgId), eq(ssTargets.scope, 'agency'), eq(ssTargets.scopeId, src.id)));
  await db.update(ssCommissionEntries).set({ beneficiaryId: dst.id })
    .where(and(eq(ssCommissionEntries.orgId, ctx.orgId), eq(ssCommissionEntries.beneficiaryType, 'agency'), eq(ssCommissionEntries.beneficiaryId, src.id)));
  // credit: nếu đích chưa có → chuyển; có rồi → bỏ hạn mức nguồn
  const dstCredit = await db.select().from(ssCreditLimits).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, dst.id)));
  if (dstCredit.length === 0) {
    await db.update(ssCreditLimits).set({ customerId: dst.id }).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, src.id)));
  } else {
    await db.delete(ssCreditLimits).where(and(eq(ssCreditLimits.orgId, ctx.orgId), eq(ssCreditLimits.customerId, src.id)));
  }
  // profiles nguồn: xoá (đích giữ hồ sơ của mình nếu có)
  await db.delete(ssAgencyProfiles).where(and(eq(ssAgencyProfiles.orgId, ctx.orgId), eq(ssAgencyProfiles.customerId, src.id)));
  await db.delete(ssRetailerProfiles).where(and(eq(ssRetailerProfiles.orgId, ctx.orgId), eq(ssRetailerProfiles.customerId, src.id)));
  // scores/suggestions
  await db.delete(ssScores).where(and(eq(ssScores.orgId, ctx.orgId), eq(ssScores.entityType, 'customer'), eq(ssScores.entityId, src.id)));
  await db.update(ssSuggestions).set({ refId: dst.id })
    .where(and(eq(ssSuggestions.orgId, ctx.orgId), eq(ssSuggestions.refType, 'customer'), eq(ssSuggestions.refId, src.id)));
  // relationships của nguồn: gỡ khỏi cây (giữ self-row? — xoá hết, khách merged không còn là node)
  await db.delete(ssCustomerRelationships).where(and(
    eq(ssCustomerRelationships.orgId, ctx.orgId),
    or(eq(ssCustomerRelationships.ancestorId, src.id), eq(ssCustomerRelationships.descendantId, src.id))!,
  ));
  await db.update(ssCustomers).set({ status: 'merged', mergedInto: dst.id, updatedAt: nowOf(ctx) })
    .where(and(eq(ssCustomers.orgId, ctx.orgId), eq(ssCustomers.id, src.id)));
  await ctx.emit?.('soulsale.customer.merged', { source_id: src.id, target_id: dst.id });
  return { merged: src.code, into: dst.code };
}
