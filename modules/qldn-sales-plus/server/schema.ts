import {
  boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable,
  text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => numeric(name, { precision: 20, scale: 2 });
const qty = (name: string) => numeric(name, { precision: 20, scale: 4 });
const audit = { createdAt: ts('created_at').defaultNow().notNull(), updatedAt: ts('updated_at').defaultNow().notNull() };

export const qsaReturnRequests = pgTable('qsa_return_requests', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), returnNo: text('return_no').notNull(),
  salesOrderId: uuid('sales_order_id'), customerId: uuid('customer_id'), reason: text('reason').notNull(), status: text('status').default('draft').notNull(),
  requestedBy: uuid('requested_by'), workflowInstanceId: uuid('workflow_instance_id'), idempotencyKey: text('idempotency_key'), ...audit,
}, t => ({ orgIdx: index('qsa_return_requests_org_idx').on(t.orgId), statusIdx: index('qsa_return_requests_org_status_idx').on(t.orgId, t.status), noUq: uniqueIndex('qsa_return_requests_no_uq').on(t.orgId, t.returnNo), idemUq: uniqueIndex('qsa_return_requests_idem_uq').on(t.orgId, t.idempotencyKey), tenantKey: uniqueIndex('qsa_return_requests_org_id_uq').on(t.orgId, t.id), statusCk: check('qsa_return_requests_status_ck', sql`${t.status} in ('draft','submitted','approved','rejected','received','resolved','cancelled')`) }));

export const qsaReturnLines = pgTable('qsa_return_lines', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), returnRequestId: uuid('return_request_id').notNull(), itemId: uuid('item_id'), sku: text('sku'), qty: qty('qty').notNull(), condition: text('condition').default('unopened').notNull(), resolution: text('resolution'), ...audit,
}, t => ({ orgIdx: index('qsa_return_lines_org_idx').on(t.orgId), parentFk: foreignKey({ columns: [t.orgId, t.returnRequestId], foreignColumns: [qsaReturnRequests.orgId, qsaReturnRequests.id], name: 'qsa_return_lines_request_tenant_fk' }).onDelete('cascade'), qtyCk: check('qsa_return_lines_qty_ck', sql`${t.qty} > 0`) }));

export const qsaPromotions = pgTable('qsa_promotions', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), promoCode: text('promo_code').notNull(), name: text('name').notNull(), startsAt: ts('starts_at').notNull(), endsAt: ts('ends_at'), customerSegment: text('customer_segment'), status: text('status').default('draft').notNull(), budgetAmount: money('budget_amount'), createdBy: uuid('created_by'), ...audit,
}, t => ({ orgIdx: index('qsa_promotions_org_idx').on(t.orgId), statusIdx: index('qsa_promotions_org_status_idx').on(t.orgId, t.status), codeUq: uniqueIndex('qsa_promotions_code_uq').on(t.orgId, t.promoCode), tenantKey: uniqueIndex('qsa_promotions_org_id_uq').on(t.orgId, t.id), datesCk: check('qsa_promotions_dates_ck', sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`), budgetCk: check('qsa_promotions_budget_ck', sql`${t.budgetAmount} is null or ${t.budgetAmount} >= 0`) }));

export const qsaPromotionRules = pgTable('qsa_promotion_rules', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), promotionId: uuid('promotion_id').notNull(), ruleType: text('rule_type').notNull(), priority: integer('priority').default(100).notNull(), conditions: jsonb('conditions').default({}).notNull(), effects: jsonb('effects').default({}).notNull(), isActive: boolean('is_active').default(true).notNull(), ...audit,
}, t => ({ orgIdx: index('qsa_promotion_rules_org_idx').on(t.orgId), parentFk: foreignKey({ columns: [t.orgId, t.promotionId], foreignColumns: [qsaPromotions.orgId, qsaPromotions.id], name: 'qsa_promotion_rules_promotion_tenant_fk' }).onDelete('cascade') }));

export const qsaSalesTenders = pgTable('qsa_sales_tenders', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), tenderNo: text('tender_no').notNull(), customerId: uuid('customer_id'), dealId: uuid('deal_id'), title: text('title').notNull(), bidValue: money('bid_value'), deadlineAt: ts('deadline_at'), status: text('status').default('draft').notNull(), ownerId: uuid('owner_id'), workflowInstanceId: uuid('workflow_instance_id'), ...audit,
}, t => ({ orgIdx: index('qsa_sales_tenders_org_idx').on(t.orgId), statusIdx: index('qsa_sales_tenders_org_status_idx').on(t.orgId, t.status), noUq: uniqueIndex('qsa_sales_tenders_no_uq').on(t.orgId, t.tenderNo), tenantKey: uniqueIndex('qsa_sales_tenders_org_id_uq').on(t.orgId, t.id), valueCk: check('qsa_sales_tenders_value_ck', sql`${t.bidValue} is null or ${t.bidValue} >= 0`) }));

export const qsaTenderGuarantees = pgTable('qsa_tender_guarantees', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), salesTenderId: uuid('sales_tender_id').notNull(), guaranteeType: text('guarantee_type').notNull(), guaranteeNo: text('guarantee_no').notNull(), issuer: text('issuer'), amount: money('amount').notNull(), validFrom: date('valid_from'), validTo: date('valid_to'), status: text('status').default('issued').notNull(), ...audit,
}, t => ({ orgIdx: index('qsa_tender_guarantees_org_idx').on(t.orgId), statusIdx: index('qsa_tender_guarantees_org_status_idx').on(t.orgId, t.status), noUq: uniqueIndex('qsa_tender_guarantees_no_uq').on(t.orgId, t.guaranteeNo), parentFk: foreignKey({ columns: [t.orgId, t.salesTenderId], foreignColumns: [qsaSalesTenders.orgId, qsaSalesTenders.id], name: 'qsa_tender_guarantees_tender_tenant_fk' }).onDelete('cascade'), amountCk: check('qsa_tender_guarantees_amount_ck', sql`${t.amount} >= 0`), datesCk: check('qsa_tender_guarantees_dates_ck', sql`${t.validTo} is null or ${t.validFrom} is null or ${t.validTo} >= ${t.validFrom}`) }));

export const qsaFieldVisits = pgTable('qsa_field_visits', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), visitNo: text('visit_no').notNull(), customerId: uuid('customer_id'), dealId: uuid('deal_id'), salesRepId: uuid('sales_rep_id').notNull(), plannedAt: ts('planned_at').notNull(), location: text('location'), purpose: text('purpose').notNull(), status: text('status').default('planned').notNull(), ...audit,
}, t => ({ orgIdx: index('qsa_field_visits_org_idx').on(t.orgId), statusIdx: index('qsa_field_visits_org_status_idx').on(t.orgId, t.status), noUq: uniqueIndex('qsa_field_visits_no_uq').on(t.orgId, t.visitNo), tenantKey: uniqueIndex('qsa_field_visits_org_id_uq').on(t.orgId, t.id) }));

export const qsaFieldVisitReports = pgTable('qsa_field_visit_reports', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), fieldVisitId: uuid('field_visit_id').notNull(), outcome: text('outcome').notNull(), nextAction: text('next_action'), followupAt: ts('followup_at'), competitorNotes: text('competitor_notes'), attachments: jsonb('attachments').default([]).notNull(), ...audit,
}, t => ({ orgIdx: index('qsa_field_visit_reports_org_idx').on(t.orgId), reportUq: uniqueIndex('qsa_field_visit_reports_visit_uq').on(t.orgId, t.fieldVisitId), parentFk: foreignKey({ columns: [t.orgId, t.fieldVisitId], foreignColumns: [qsaFieldVisits.orgId, qsaFieldVisits.id], name: 'qsa_field_visit_reports_visit_tenant_fk' }).onDelete('cascade') }));

export const qsaFranchiseApplications = pgTable('qsa_franchise_applications', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), applicationNo: text('application_no').notNull(), customerId: uuid('customer_id'), applicantName: text('applicant_name').notNull(), territory: text('territory').notNull(), investmentCapacity: money('investment_capacity'), status: text('status').default('submitted').notNull(), submittedAt: ts('submitted_at').defaultNow().notNull(), workflowInstanceId: uuid('workflow_instance_id'), ...audit,
}, t => ({ orgIdx: index('qsa_franchise_applications_org_idx').on(t.orgId), statusIdx: index('qsa_franchise_applications_org_status_idx').on(t.orgId, t.status), noUq: uniqueIndex('qsa_franchise_applications_no_uq').on(t.orgId, t.applicationNo), tenantKey: uniqueIndex('qsa_franchise_applications_org_id_uq').on(t.orgId, t.id), investmentCk: check('qsa_franchise_applications_investment_ck', sql`${t.investmentCapacity} is null or ${t.investmentCapacity} >= 0`) }));

export const qsaFranchiseReviews = pgTable('qsa_franchise_reviews', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), franchiseApplicationId: uuid('franchise_application_id').notNull(), reviewerId: uuid('reviewer_id'), reviewStage: text('review_stage').notNull(), score: numeric('score', { precision: 5, scale: 2 }), decision: text('decision').default('pending').notNull(), notes: text('notes'), reviewedAt: ts('reviewed_at'), ...audit,
}, t => ({ orgIdx: index('qsa_franchise_reviews_org_idx').on(t.orgId), stageUq: uniqueIndex('qsa_franchise_reviews_stage_uq').on(t.orgId, t.franchiseApplicationId, t.reviewStage), parentFk: foreignKey({ columns: [t.orgId, t.franchiseApplicationId], foreignColumns: [qsaFranchiseApplications.orgId, qsaFranchiseApplications.id], name: 'qsa_franchise_reviews_application_tenant_fk' }).onDelete('cascade'), scoreCk: check('qsa_franchise_reviews_score_ck', sql`${t.score} is null or (${t.score} >= 0 and ${t.score} <= 100)`) }));

export const qsaImportShipments = pgTable('qsa_import_shipments', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), shipmentNo: text('shipment_no').notNull(), customerId: uuid('customer_id'), supplierId: uuid('supplier_id'), incoterm: text('incoterm'), eta: date('eta'), status: text('status').default('planned').notNull(), customsRef: text('customs_ref'), totalValue: money('total_value'), ...audit,
}, t => ({ orgIdx: index('qsa_import_shipments_org_idx').on(t.orgId), statusIdx: index('qsa_import_shipments_org_status_idx').on(t.orgId, t.status), noUq: uniqueIndex('qsa_import_shipments_no_uq').on(t.orgId, t.shipmentNo), valueCk: check('qsa_import_shipments_value_ck', sql`${t.totalValue} is null or ${t.totalValue} >= 0`) }));

export const qsaExportShipments = pgTable('qsa_export_shipments', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), shipmentNo: text('shipment_no').notNull(), customerId: uuid('customer_id'), salesOrderId: uuid('sales_order_id'), destinationCountry: text('destination_country').notNull(), etd: date('etd'), eta: date('eta'), status: text('status').default('planned').notNull(), customsRef: text('customs_ref'), totalValue: money('total_value'), ...audit,
}, t => ({ orgIdx: index('qsa_export_shipments_org_idx').on(t.orgId), statusIdx: index('qsa_export_shipments_org_status_idx').on(t.orgId, t.status), noUq: uniqueIndex('qsa_export_shipments_no_uq').on(t.orgId, t.shipmentNo), datesCk: check('qsa_export_shipments_dates_ck', sql`${t.eta} is null or ${t.etd} is null or ${t.eta} >= ${t.etd}`), valueCk: check('qsa_export_shipments_value_ck', sql`${t.totalValue} is null or ${t.totalValue} >= 0`) }));

export const qsaShipmentLines = pgTable('qsa_shipment_lines', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), shipmentType: text('shipment_type').notNull(), shipmentId: uuid('shipment_id').notNull(), itemId: uuid('item_id'), description: text('description').notNull(), qty: qty('qty').notNull(), uom: text('uom'), declaredValue: money('declared_value'), ...audit,
}, t => ({ orgIdx: index('qsa_shipment_lines_org_idx').on(t.orgId), shipmentIdx: index('qsa_shipment_lines_shipment_idx').on(t.orgId, t.shipmentType, t.shipmentId), typeCk: check('qsa_shipment_lines_type_ck', sql`${t.shipmentType} in ('import','export')`), qtyCk: check('qsa_shipment_lines_qty_ck', sql`${t.qty} > 0`), valueCk: check('qsa_shipment_lines_value_ck', sql`${t.declaredValue} is null or ${t.declaredValue} >= 0`) }));

export const qsaFulfillmentStates = pgTable('qsa_fulfillment_states', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), salesOrderId: uuid('sales_order_id').notNull(), state: text('state').notNull(), stateVersion: integer('state_version').default(1).notNull(), sourceModule: text('source_module').default('qldn-sales-plus').notNull(), changedBy: uuid('changed_by'), changedAt: ts('changed_at').defaultNow().notNull(), payload: jsonb('payload').default({}).notNull(), ...audit,
}, t => ({ orgIdx: index('qsa_fulfillment_states_org_idx').on(t.orgId), stateIdx: index('qsa_fulfillment_states_org_status_idx').on(t.orgId, t.state), versionUq: uniqueIndex('qsa_fulfillment_states_order_version_uq').on(t.orgId, t.salesOrderId, t.stateVersion), tenantKey: uniqueIndex('qsa_fulfillment_states_org_id_uq').on(t.orgId, t.id), versionCk: check('qsa_fulfillment_states_version_ck', sql`${t.stateVersion} > 0`) }));

export const qsaFulfillmentEvents = pgTable('qsa_fulfillment_events', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), fulfillmentStateId: uuid('fulfillment_state_id').notNull(), eventType: text('event_type').notNull(), emittedTo: text('emitted_to'), idempotencyKey: text('idempotency_key'), payload: jsonb('payload').default({}).notNull(), ...audit,
}, t => ({ orgIdx: index('qsa_fulfillment_events_org_idx').on(t.orgId), idemUq: uniqueIndex('qsa_fulfillment_events_idem_uq').on(t.orgId, t.idempotencyKey), parentFk: foreignKey({ columns: [t.orgId, t.fulfillmentStateId], foreignColumns: [qsaFulfillmentStates.orgId, qsaFulfillmentStates.id], name: 'qsa_fulfillment_events_state_tenant_fk' }).onDelete('cascade') }));

export const qsaCustomerMaterialImports = pgTable('qsa_customer_material_imports', {
  id: uuid('id').defaultRandom().primaryKey(), orgId: uuid('org_id').notNull(), importNo: text('import_no').notNull(), customerId: uuid('customer_id'), salesOrderId: uuid('sales_order_id'), receivedBy: uuid('received_by'), receivedAt: ts('received_at'), status: text('status').default('received').notNull(), notes: text('notes'), payload: jsonb('payload').default({}).notNull(), ...audit,
}, t => ({ orgIdx: index('qsa_customer_material_imports_org_idx').on(t.orgId), statusIdx: index('qsa_customer_material_imports_org_status_idx').on(t.orgId, t.status), noUq: uniqueIndex('qsa_customer_material_imports_no_uq').on(t.orgId, t.importNo) }));

export const qldnSalesPlusSchema = { qsaReturnRequests, qsaReturnLines, qsaPromotions, qsaPromotionRules, qsaSalesTenders, qsaTenderGuarantees, qsaFieldVisits, qsaFieldVisitReports, qsaFranchiseApplications, qsaFranchiseReviews, qsaImportShipments, qsaExportShipments, qsaShipmentLines, qsaFulfillmentStates, qsaFulfillmentEvents, qsaCustomerMaterialImports };
