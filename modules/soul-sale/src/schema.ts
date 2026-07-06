/**
 * SOUL-SALE 1A — schema.ts
 * Toàn bộ bảng nghiệp vụ, prefix ss_, schema PostgreSQL "soulsale".
 * Quy tắc SuperCitadel: org_id trên MỌI bảng + index; tiền numeric(18,0) VND (string/BigInt);
 * created_by varchar(128); không FK chéo module.
 */
import {
  pgSchema, uuid, varchar, text, timestamp, numeric, integer, boolean, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const soulsale = pgSchema('soulsale');

const vnd = (name: string) => numeric(name, { precision: 18, scale: 0 });
const idCol = () => uuid('id').primaryKey().defaultRandom();
const orgCol = () => uuid('org_id').notNull();
const byCol = () => varchar('created_by', { length: 128 });
const tsCol = (n: string) => timestamp(n, { withTimezone: true });
const createdAt = () => tsCol('created_at').defaultNow().notNull();

/* ============ MASTER DATA ============ */

export const ssCustomers = soulsale.table('ss_customers', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  kind: varchar('kind', { length: 16 }).notNull(), // person|company|agency|retailer|distributor
  name: text('name').notNull(),
  nameNorm: text('name_norm').notNull(), // bỏ dấu, lowercase — phục vụ match/dup
  phone: varchar('phone', { length: 32 }),
  email: varchar('email', { length: 160 }),
  taxCode: varchar('tax_code', { length: 32 }),
  segmentId: uuid('segment_id'),
  ownerUserId: varchar('owner_user_id', { length: 128 }),
  status: varchar('status', { length: 16 }).notNull().default('active'), // active|inactive|merged
  mergedInto: uuid('merged_into'),
  note: text('note'),
  createdBy: byCol(), createdAt: createdAt(), updatedAt: tsCol('updated_at').defaultNow().notNull(),
}, (t) => [
  index('ss_customers_org_idx').on(t.orgId),
  uniqueIndex('ss_customers_org_code_uq').on(t.orgId, t.code),
  index('ss_customers_org_phone_idx').on(t.orgId, t.phone),
  index('ss_customers_org_name_norm_idx').on(t.orgId, t.nameNorm),
]);

export const ssCustomerContacts = soulsale.table('ss_customer_contacts', {
  id: idCol(), orgId: orgCol(),
  customerId: uuid('customer_id').notNull(),
  name: text('name').notNull(),
  role: varchar('role', { length: 64 }), // chủ shop|kế toán|nhận hàng...
  phone: varchar('phone', { length: 32 }),
  email: varchar('email', { length: 160 }),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_contacts_org_idx').on(t.orgId), index('ss_contacts_cust_idx').on(t.orgId, t.customerId)]);

export const ssCustomerAddresses = soulsale.table('ss_customer_addresses', {
  id: idCol(), orgId: orgCol(),
  customerId: uuid('customer_id').notNull(),
  kind: varchar('kind', { length: 16 }).notNull().default('shipping'), // shipping|billing|warehouse
  line: text('line').notNull(),
  ward: varchar('ward', { length: 120 }), district: varchar('district', { length: 120 }), province: varchar('province', { length: 120 }),
  isDefault: boolean('is_default').notNull().default(false),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_addr_org_idx').on(t.orgId), index('ss_addr_cust_idx').on(t.orgId, t.customerId)]);

export const ssCustomerSegments = soulsale.table('ss_customer_segments', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(), // VIP|WHOLESALE|RETAIL|AG1|AG2|STRATEGIC...
  name: text('name').notNull(),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_seg_org_idx').on(t.orgId), uniqueIndex('ss_seg_org_code_uq').on(t.orgId, t.code)]);

/** Cây quan hệ kênh — closure table: mọi cặp (tổ tiên, hậu duệ) kèm depth. depth=0 là chính nó. */
export const ssCustomerRelationships = soulsale.table('ss_customer_relationships', {
  id: idCol(), orgId: orgCol(),
  ancestorId: uuid('ancestor_id').notNull(),
  descendantId: uuid('descendant_id').notNull(),
  depth: integer('depth').notNull(),
}, (t) => [
  index('ss_rel_org_idx').on(t.orgId),
  uniqueIndex('ss_rel_uq').on(t.orgId, t.ancestorId, t.descendantId),
  index('ss_rel_desc_idx').on(t.orgId, t.descendantId),
]);

export const ssTerritories = soulsale.table('ss_territories', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_terr_org_idx').on(t.orgId), uniqueIndex('ss_terr_org_code_uq').on(t.orgId, t.code)]);

export const ssAgencyProfiles = soulsale.table('ss_agency_profiles', {
  id: idCol(), orgId: orgCol(),
  customerId: uuid('customer_id').notNull(),
  level: integer('level').notNull().default(1), // 1=NPP/C1, 2=C2...
  parentAgencyCustomerId: uuid('parent_agency_customer_id'),
  territoryId: uuid('territory_id'),
  discountTier: varchar('discount_tier', { length: 32 }),
  managerUserId: varchar('manager_user_id', { length: 128 }),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_agp_org_idx').on(t.orgId), uniqueIndex('ss_agp_cust_uq').on(t.orgId, t.customerId)]);

export const ssRetailerProfiles = soulsale.table('ss_retailer_profiles', {
  id: idCol(), orgId: orgCol(),
  customerId: uuid('customer_id').notNull(),
  parentAgencyCustomerId: uuid('parent_agency_customer_id'),
  shopType: varchar('shop_type', { length: 64 }),
  territoryId: uuid('territory_id'),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_rtp_org_idx').on(t.orgId), uniqueIndex('ss_rtp_cust_uq').on(t.orgId, t.customerId)]);

/* ============ CRM ============ */

export const ssLeads = soulsale.table('ss_leads', {
  id: idCol(), orgId: orgCol(),
  source: varchar('source', { length: 32 }).notNull(), // facebook|tiktok|showroom|referral|campaign|import|zalo|other
  name: text('name').notNull(),
  phone: varchar('phone', { length: 32 }),
  email: varchar('email', { length: 160 }),
  note: text('note'),
  status: varchar('status', { length: 16 }).notNull().default('new'), // new|working|qualified|disqualified|converted
  disqualifyReason: text('disqualify_reason'),
  score: integer('score').notNull().default(0),
  ownerUserId: varchar('owner_user_id', { length: 128 }),
  convertedCustomerId: uuid('converted_customer_id'),
  convertedDealId: uuid('converted_deal_id'),
  createdBy: byCol(), createdAt: createdAt(), updatedAt: tsCol('updated_at').defaultNow().notNull(),
}, (t) => [index('ss_leads_org_idx').on(t.orgId), index('ss_leads_status_idx').on(t.orgId, t.status)]);

export const ssPipelines = soulsale.table('ss_pipelines', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_pipe_org_idx').on(t.orgId), uniqueIndex('ss_pipe_org_code_uq').on(t.orgId, t.code)]);

export const ssPipelineStages = soulsale.table('ss_pipeline_stages', {
  id: idCol(), orgId: orgCol(),
  pipelineId: uuid('pipeline_id').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
  probability: integer('probability').notNull().default(0), // %
  isWon: boolean('is_won').notNull().default(false),
  isLost: boolean('is_lost').notNull().default(false),
}, (t) => [index('ss_stage_org_idx').on(t.orgId), index('ss_stage_pipe_idx').on(t.orgId, t.pipelineId)]);

export const ssDeals = soulsale.table('ss_deals', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  customerId: uuid('customer_id'),
  leadId: uuid('lead_id'),
  pipelineId: uuid('pipeline_id').notNull(),
  stageId: uuid('stage_id').notNull(),
  title: text('title').notNull(),
  amount: vnd('amount').notNull().default('0'),
  expectedClose: tsCol('expected_close'),
  status: varchar('status', { length: 12 }).notNull().default('open'), // open|won|lost
  lostReason: text('lost_reason'),
  health: varchar('health', { length: 12 }).notNull().default('warm'), // hot|warm|cold|at_risk
  ownerUserId: varchar('owner_user_id', { length: 128 }),
  lastActivityAt: tsCol('last_activity_at'),
  stageEnteredAt: tsCol('stage_entered_at').defaultNow().notNull(),
  createdBy: byCol(), createdAt: createdAt(), updatedAt: tsCol('updated_at').defaultNow().notNull(),
}, (t) => [
  index('ss_deals_org_idx').on(t.orgId),
  uniqueIndex('ss_deals_org_code_uq').on(t.orgId, t.code),
  index('ss_deals_stage_idx').on(t.orgId, t.stageId),
  index('ss_deals_cust_idx').on(t.orgId, t.customerId),
]);

export const ssActivities = soulsale.table('ss_activities', {
  id: idCol(), orgId: orgCol(),
  kind: varchar('kind', { length: 16 }).notNull(), // call|meet|note|task|email|zalo
  subject: text('subject').notNull(),
  content: text('content'),
  refType: varchar('ref_type', { length: 16 }).notNull(), // lead|deal|customer|order
  refId: uuid('ref_id').notNull(),
  dueAt: tsCol('due_at'), doneAt: tsCol('done_at'),
  ownerUserId: varchar('owner_user_id', { length: 128 }),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_act_org_idx').on(t.orgId), index('ss_act_ref_idx').on(t.orgId, t.refType, t.refId)]);

/* ============ PRICING / CREDIT / TERMS ============ */

export const ssPriceBooks = soulsale.table('ss_price_books', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  name: text('name').notNull(),
  channel: varchar('channel', { length: 16 }).notNull().default('all'), // all|b2b|b2c|agency|retailer
  active: boolean('active').notNull().default(true),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_pb_org_idx').on(t.orgId), uniqueIndex('ss_pb_org_code_uq').on(t.orgId, t.code)]);

export const ssPriceRules = soulsale.table('ss_price_rules', {
  id: idCol(), orgId: orgCol(),
  priceBookId: uuid('price_book_id').notNull(),
  productCode: varchar('product_code', { length: 64 }).notNull(),
  // scope: khách đích danh > segment > agency level > mặc định
  customerId: uuid('customer_id'),
  segmentId: uuid('segment_id'),
  agencyLevel: integer('agency_level'),
  minQty: integer('min_qty').notNull().default(1),
  unitPrice: vnd('unit_price').notNull(),
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  validFrom: tsCol('valid_from'), validTo: tsCol('valid_to'),
  priority: integer('priority').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_pr_org_idx').on(t.orgId), index('ss_pr_lookup_idx').on(t.orgId, t.productCode, t.active)]);

export const ssPaymentTerms = soulsale.table('ss_payment_terms', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(), // COD|DEP30|NET7|NET15|NET30
  name: text('name').notNull(),
  days: integer('days').notNull().default(0),
  depositPct: numeric('deposit_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_pt_org_idx').on(t.orgId), uniqueIndex('ss_pt_org_code_uq').on(t.orgId, t.code)]);

export const ssCreditLimits = soulsale.table('ss_credit_limits', {
  id: idCol(), orgId: orgCol(),
  customerId: uuid('customer_id').notNull(),
  limitAmount: vnd('limit_amount').notNull().default('0'),
  hold: boolean('hold').notNull().default(false),
  holdReason: text('hold_reason'),
  paymentTermId: uuid('payment_term_id'),
  updatedBy: varchar('updated_by', { length: 128 }),
  updatedAt: tsCol('updated_at').defaultNow().notNull(),
}, (t) => [index('ss_cl_org_idx').on(t.orgId), uniqueIndex('ss_cl_cust_uq').on(t.orgId, t.customerId)]);

/* ============ SALES ============ */

export const ssQuotes = soulsale.table('ss_quotes', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  customerId: uuid('customer_id').notNull(),
  dealId: uuid('deal_id'),
  status: varchar('status', { length: 16 }).notNull().default('draft'), // draft|sent|accepted|rejected|expired
  validUntil: tsCol('valid_until'),
  total: vnd('total').notNull().default('0'),
  note: text('note'),
  ownerUserId: varchar('owner_user_id', { length: 128 }),
  closedReason: text('closed_reason'),
  createdBy: byCol(), createdAt: createdAt(), updatedAt: tsCol('updated_at').defaultNow().notNull(),
}, (t) => [index('ss_q_org_idx').on(t.orgId), uniqueIndex('ss_q_org_code_uq').on(t.orgId, t.code)]);

export const ssQuoteItems = soulsale.table('ss_quote_items', {
  id: idCol(), orgId: orgCol(),
  quoteId: uuid('quote_id').notNull(),
  productCode: varchar('product_code', { length: 64 }).notNull(),
  productName: text('product_name').notNull(),
  qty: integer('qty').notNull(),
  unit: varchar('unit', { length: 24 }).notNull().default('cái'),
  unitPrice: vnd('unit_price').notNull(),
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  lineTotal: vnd('line_total').notNull(),
  priceRuleId: uuid('price_rule_id'),
}, (t) => [index('ss_qi_org_idx').on(t.orgId), index('ss_qi_quote_idx').on(t.orgId, t.quoteId)]);

export const ssOrders = soulsale.table('ss_orders', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  customerId: uuid('customer_id').notNull(),
  quoteId: uuid('quote_id'),
  status: varchar('status', { length: 16 }).notNull().default('draft'),
  // draft|confirmed|delivering|delivered|invoiced|closed|cancelled|on_hold
  subTotal: vnd('sub_total').notNull().default('0'),
  discountTotal: vnd('discount_total').notNull().default('0'),
  taxTotal: vnd('tax_total').notNull().default('0'),
  grandTotal: vnd('grand_total').notNull().default('0'),
  paymentTermId: uuid('payment_term_id'),
  creditOverride: boolean('credit_override').notNull().default(false),
  holdReason: text('hold_reason'),
  channel: varchar('channel', { length: 16 }).notNull().default('b2b'),
  territoryId: uuid('territory_id'),
  ownerUserId: varchar('owner_user_id', { length: 128 }),
  confirmedAt: tsCol('confirmed_at'), cancelledAt: tsCol('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdBy: byCol(), createdAt: createdAt(), updatedAt: tsCol('updated_at').defaultNow().notNull(),
}, (t) => [
  index('ss_o_org_idx').on(t.orgId),
  uniqueIndex('ss_o_org_code_uq').on(t.orgId, t.code),
  index('ss_o_cust_idx').on(t.orgId, t.customerId),
  index('ss_o_status_idx').on(t.orgId, t.status),
]);

export const ssOrderItems = soulsale.table('ss_order_items', {
  id: idCol(), orgId: orgCol(),
  orderId: uuid('order_id').notNull(),
  productCode: varchar('product_code', { length: 64 }).notNull(),
  productName: text('product_name').notNull(),
  qty: integer('qty').notNull(),
  unit: varchar('unit', { length: 24 }).notNull().default('cái'),
  unitPrice: vnd('unit_price').notNull(),
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  taxRatePct: numeric('tax_rate_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  lineTotal: vnd('line_total').notNull(),
}, (t) => [index('ss_oi_org_idx').on(t.orgId), index('ss_oi_order_idx').on(t.orgId, t.orderId)]);

export const ssOrderStatusLog = soulsale.table('ss_order_status_log', {
  id: idCol(), orgId: orgCol(),
  orderId: uuid('order_id').notNull(),
  fromStatus: varchar('from_status', { length: 16 }).notNull(),
  toStatus: varchar('to_status', { length: 16 }).notNull(),
  reason: text('reason'),
  actorUserId: varchar('actor_user_id', { length: 128 }),
  at: tsCol('at').defaultNow().notNull(),
}, (t) => [index('ss_osl_org_idx').on(t.orgId), index('ss_osl_order_idx').on(t.orgId, t.orderId)]);

export const ssPayments = soulsale.table('ss_payments', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  customerId: uuid('customer_id').notNull(),
  orderId: uuid('order_id'),
  kind: varchar('kind', { length: 12 }).notNull(), // deposit|payment|refund
  amount: vnd('amount').notNull(),
  method: varchar('method', { length: 24 }).notNull().default('bank'), // cash|bank|card|ewallet
  externalRef: varchar('external_ref', { length: 128 }),
  note: text('note'),
  recordedBy: varchar('recorded_by', { length: 128 }),
  at: tsCol('at').defaultNow().notNull(),
}, (t) => [index('ss_pay_org_idx').on(t.orgId), uniqueIndex('ss_pay_org_code_uq').on(t.orgId, t.code), index('ss_pay_order_idx').on(t.orgId, t.orderId)]);

/* ============ TARGETS / COMMISSION / DEBT ============ */

export const ssTargets = soulsale.table('ss_targets', {
  id: idCol(), orgId: orgCol(),
  scope: varchar('scope', { length: 12 }).notNull(), // user|agency|territory|org
  scopeId: varchar('scope_id', { length: 128 }).notNull(), // userId | customerId | territoryId | 'org'
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  targetAmount: vnd('target_amount').notNull(),
  achievedAmount: vnd('achieved_amount').notNull().default('0'),
  updatedAt: tsCol('updated_at').defaultNow().notNull(),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_tg_org_idx').on(t.orgId), uniqueIndex('ss_tg_uq').on(t.orgId, t.scope, t.scopeId, t.period)]);

export const ssCommissionPlans = soulsale.table('ss_commission_plans', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  name: text('name').notNull(),
  basis: varchar('basis', { length: 12 }).notNull().default('revenue'),
  ratePct: numeric('rate_pct', { precision: 5, scale: 2 }).notNull(),
  beneficiary: varchar('beneficiary', { length: 12 }).notNull(), // owner|agency
  active: boolean('active').notNull().default(true),
  createdBy: byCol(), createdAt: createdAt(),
}, (t) => [index('ss_cp_org_idx').on(t.orgId), uniqueIndex('ss_cp_org_code_uq').on(t.orgId, t.code)]);

export const ssCommissionEntries = soulsale.table('ss_commission_entries', {
  id: idCol(), orgId: orgCol(),
  planId: uuid('plan_id').notNull(),
  orderId: uuid('order_id').notNull(),
  beneficiaryType: varchar('beneficiary_type', { length: 12 }).notNull(), // owner|agency
  beneficiaryId: varchar('beneficiary_id', { length: 128 }).notNull(),
  baseAmount: vnd('base_amount').notNull(),
  amount: vnd('amount').notNull(),
  period: varchar('period', { length: 7 }).notNull(),
  status: varchar('status', { length: 12 }).notNull().default('posted'), // posted|paid|reversed
  postedBy: varchar('posted_by', { length: 128 }),
  postedAt: tsCol('posted_at').defaultNow().notNull(),
}, (t) => [index('ss_ce_org_idx').on(t.orgId), uniqueIndex('ss_ce_uq').on(t.orgId, t.planId, t.orderId, t.beneficiaryType)]);

export const ssDebtSnapshots = soulsale.table('ss_debt_snapshots', {
  id: idCol(), orgId: orgCol(),
  customerId: uuid('customer_id').notNull(),
  period: varchar('period', { length: 7 }).notNull(),
  opening: vnd('opening').notNull().default('0'),
  invoiced: vnd('invoiced').notNull().default('0'),
  paid: vnd('paid').notNull().default('0'),
  closing: vnd('closing').notNull().default('0'),
  closedAt: tsCol('closed_at'), closedBy: varchar('closed_by', { length: 128 }),
}, (t) => [index('ss_ds_org_idx').on(t.orgId), uniqueIndex('ss_ds_uq').on(t.orgId, t.customerId, t.period)]);

/* ============ SPLITTER (IMPORT & ĐỐI SOÁT) ============ */

export const ssImportBatches = soulsale.table('ss_import_batches', {
  id: idCol(), orgId: orgCol(),
  code: varchar('code', { length: 32 }).notNull(),
  sourceCustomerId: uuid('source_customer_id').notNull(), // agency gửi file
  period: varchar('period', { length: 7 }).notNull(),
  fileName: text('file_name').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('uploaded'), // uploaded|reconciling|ready|confirmed|void
  rowCount: integer('row_count').notNull().default(0),
  exceptionCount: integer('exception_count').notNull().default(0),
  createdBy: byCol(), createdAt: createdAt(), updatedAt: tsCol('updated_at').defaultNow().notNull(),
}, (t) => [index('ss_ib_org_idx').on(t.orgId), uniqueIndex('ss_ib_org_code_uq').on(t.orgId, t.code)]);

export const ssImportRawRows = soulsale.table('ss_import_raw_rows', {
  id: idCol(), orgId: orgCol(),
  batchId: uuid('batch_id').notNull(),
  rowNo: integer('row_no').notNull(),
  raw: jsonb('raw').notNull(), // nguyên văn dòng gốc — bất biến, phục vụ audit
}, (t) => [index('ss_irr_org_idx').on(t.orgId), index('ss_irr_batch_idx').on(t.orgId, t.batchId)]);

export const ssImportRows = soulsale.table('ss_import_rows', {
  id: idCol(), orgId: orgCol(),
  batchId: uuid('batch_id').notNull(),
  rowNo: integer('row_no').notNull(),
  buyerName: text('buyer_name'), shopName: text('shop_name'), phone: varchar('phone', { length: 32 }),
  productCode: varchar('product_code', { length: 64 }), qty: integer('qty'),
  saleAmount: vnd('sale_amount').notNull().default('0'),
  shipFee: vnd('ship_fee').notNull().default('0'),
  deposit: vnd('deposit').notNull().default('0'),
  discount: vnd('discount').notNull().default('0'),
  debt: vnd('debt').notNull().default('0'),
  matchedCustomerId: uuid('matched_customer_id'),
  confidence: numeric('confidence', { precision: 4, scale: 2 }).notNull().default('0'),
  status: varchar('status', { length: 12 }).notNull().default('pending'), // pending|ok|exception|resolved|voided
  exceptionKind: varchar('exception_kind', { length: 24 }),
}, (t) => [index('ss_ir_org_idx').on(t.orgId), index('ss_ir_batch_idx').on(t.orgId, t.batchId), index('ss_ir_status_idx').on(t.orgId, t.batchId, t.status)]);

export const ssReconciliationCases = soulsale.table('ss_reconciliation_cases', {
  id: idCol(), orgId: orgCol(),
  batchId: uuid('batch_id').notNull(),
  rowId: uuid('row_id').notNull(),
  kind: varchar('kind', { length: 24 }).notNull(), // missing_customer|low_confidence|amount_mismatch|duplicate|unknown_shop
  detail: text('detail'),
  status: varchar('status', { length: 12 }).notNull().default('open'), // open|resolved|voided
  resolution: text('resolution'),
  resolvedBy: varchar('resolved_by', { length: 128 }), resolvedAt: tsCol('resolved_at'),
  createdAt: createdAt(),
}, (t) => [index('ss_rc_org_idx').on(t.orgId), index('ss_rc_batch_idx').on(t.orgId, t.batchId, t.status)]);

export const ssSplitResults = soulsale.table('ss_split_results', {
  id: idCol(), orgId: orgCol(),
  batchId: uuid('batch_id').notNull(),
  category: varchar('category', { length: 16 }).notNull(), // revenue|ship|deposit|discount|debt|suspense
  amount: vnd('amount').notNull(),
  rowCount: integer('row_count').notNull().default(0),
  confirmed: boolean('confirmed').notNull().default(false),
}, (t) => [index('ss_sr_org_idx').on(t.orgId), uniqueIndex('ss_sr_uq').on(t.orgId, t.batchId, t.category)]);

export const ssAgencyStatements = soulsale.table('ss_agency_statements', {
  id: idCol(), orgId: orgCol(),
  agencyCustomerId: uuid('agency_customer_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  period: varchar('period', { length: 7 }).notNull(),
  revenue: vnd('revenue').notNull().default('0'),
  ship: vnd('ship').notNull().default('0'),
  deposit: vnd('deposit').notNull().default('0'),
  discount: vnd('discount').notNull().default('0'),
  debtDelta: vnd('debt_delta').notNull().default('0'),
  confirmedBy: varchar('confirmed_by', { length: 128 }),
  confirmedAt: tsCol('confirmed_at').defaultNow().notNull(),
}, (t) => [index('ss_as_org_idx').on(t.orgId), uniqueIndex('ss_as_batch_uq').on(t.orgId, t.batchId)]);

/* ============ INTELLIGENCE / HỆ THỐNG ============ */

export const ssScores = soulsale.table('ss_scores', {
  id: idCol(), orgId: orgCol(),
  entityType: varchar('entity_type', { length: 12 }).notNull(), // lead|deal|customer
  entityId: uuid('entity_id').notNull(),
  kind: varchar('kind', { length: 16 }).notNull(), // lead_score|deal_health|churn_risk|rfm
  value: numeric('value', { precision: 10, scale: 2 }).notNull(),
  meta: jsonb('meta'),
  computedAt: tsCol('computed_at').defaultNow().notNull(),
}, (t) => [index('ss_sc_org_idx').on(t.orgId), uniqueIndex('ss_sc_uq').on(t.orgId, t.entityType, t.entityId, t.kind)]);

export const ssSuggestions = soulsale.table('ss_suggestions', {
  id: idCol(), orgId: orgCol(),
  refType: varchar('ref_type', { length: 12 }).notNull(), // customer|deal|lead
  refId: uuid('ref_id').notNull(),
  action: varchar('action', { length: 32 }).notNull(), // call|remind_debt|send_quote|upsell|merge_customer|collect_deposit
  reason: text('reason').notNull(),
  status: varchar('status', { length: 12 }).notNull().default('open'), // open|done|dismissed
  createdAt: createdAt(),
}, (t) => [index('ss_sg_org_idx').on(t.orgId), index('ss_sg_status_idx').on(t.orgId, t.status)]);

export const ssCounters = soulsale.table('ss_counters', {
  orgId: orgCol(),
  key: varchar('key', { length: 32 }).notNull(),
  value: integer('value').notNull().default(0),
}, (t) => [uniqueIndex('ss_ctr_uq').on(t.orgId, t.key)]);

export const ssActionAudit = soulsale.table('ss_action_audit', {
  id: idCol(), orgId: orgCol(),
  actorUserId: varchar('actor_user_id', { length: 128 }).notNull(),
  action: varchar('action', { length: 64 }).notNull(),
  result: varchar('result', { length: 8 }).notNull(), // ok|error|dryrun
  input: jsonb('input'),
  message: text('message'),
  at: tsCol('at').defaultNow().notNull(),
}, (t) => [index('ss_aa_org_idx').on(t.orgId), index('ss_aa_action_idx').on(t.orgId, t.action)]);

export const ssInboxEvents = soulsale.table('ss_inbox_events', {
  id: idCol(), orgId: orgCol(),
  topic: varchar('topic', { length: 64 }).notNull(),
  payload: jsonb('payload'),
  processed: boolean('processed').notNull().default(false),
  receivedAt: tsCol('received_at').defaultNow().notNull(),
}, (t) => [index('ss_ie_org_idx').on(t.orgId), index('ss_ie_topic_idx').on(t.orgId, t.topic)]);

export const allTables = {
  ssCustomers, ssCustomerContacts, ssCustomerAddresses, ssCustomerSegments, ssCustomerRelationships,
  ssTerritories, ssAgencyProfiles, ssRetailerProfiles,
  ssLeads, ssPipelines, ssPipelineStages, ssDeals, ssActivities,
  ssPriceBooks, ssPriceRules, ssPaymentTerms, ssCreditLimits,
  ssQuotes, ssQuoteItems, ssOrders, ssOrderItems, ssOrderStatusLog, ssPayments,
  ssTargets, ssCommissionPlans, ssCommissionEntries, ssDebtSnapshots,
  ssImportBatches, ssImportRawRows, ssImportRows, ssReconciliationCases, ssSplitResults, ssAgencyStatements,
  ssScores, ssSuggestions, ssCounters, ssActionAudit, ssInboxEvents,
};
