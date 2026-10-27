# ENTITY-MAP-FINAL — Beat 15 qldn-sales-plus deep OM/CRM verdict

Source read: `/root/.openclaw/workspace/module-qldn-v1a/forge/ENTITY-MAP-FINAL.md` + `/root/.openclaw/workspace/module-qldn-v1a/forge/GAP-CHECK.md`.
Repo evidence at HEAD `13f2c85b`: `modules/om/migrations/0001_om.sql` defines only `om_ledger`; `modules/crm/migrations/0001_crm.sql` defines only `crm_contacts` and `crm_deals`.

Beat 15 creates exactly 16 `qsa_` tables. It does **not** create a customer, lead, deal, sales-order header, sales-order line, or item/stock master. Cross-module references are soft UUID contracts (`customer_id`, `deal_id`, `sales_order_id`, `item_id`, `supplier_id`) plus event contracts for later service beats.

| Planned sales-plus entity | Verdict/table | Zero-overlap proof |
|---|---|---|
| Customer/dealer/contact | REUSE `crm_contacts`; no qsa customer table | CRM contact is the master; qsa uses `customer_id` soft ref only. |
| Lead/deal/opportunity | REUSE `crm_deals`; no qsa lead/deal table | CRM deal pipeline is the master; qsa uses `deal_id` soft ref only. |
| Sales order | REUSE order contract/OM future master; no `qsa_sales_orders` in Beat 15 | OM currently has only `om_ledger`, but this beat intentionally avoids creating order master/header/line. |
| Return request | NEW `qsa_return_requests`, `qsa_return_lines` | No OM/CRM return schema exists; order/item are soft refs. |
| Promotion | NEW `qsa_promotions`, `qsa_promotion_rules` | CRM has no promotion/pricing-rule schema; tenant unique `(org_id,promo_code)`. |
| Sales tender + guarantees | NEW `qsa_sales_tenders`, `qsa_tender_guarantees` | Sell-side tender; separate from purchase-side `qpr_bid_projects`. |
| Field visits | NEW `qsa_field_visits`, `qsa_field_visit_reports` | CRM has no visit/report lifecycle tables. |
| Franchise applications | NEW `qsa_franchise_applications`, `qsa_franchise_reviews` | CRM has no franchise workflow/review tables. |
| Import/export shipments | NEW `qsa_import_shipments`, `qsa_export_shipments`, `qsa_shipment_lines` | OM has no shipping/fulfillment schema; lines are tenant-scoped shipment extensions. |
| Missing fulfillment states | NEW `qsa_fulfillment_states`, `qsa_fulfillment_events` | State overlay/history only; not an order master. |
| Customer material import | NEW `qsa_customer_material_imports` | Receipt/contract record for customer-supplied materials; not inventory stock master. |

Tenant rule: every qsa table has `org_id uuid NOT NULL`, an org index, and tenant-scoped unique/idempotency constraints where applicable.
