# GAP-CHECK-B15 — OM/CRM sales-plus audit

Inspected actual migrations/schema/services:
- `modules/om/migrations/0001_om.sql`, `modules/om/server/schema.ts`, `modules/om/server/service.ts`: wallet ledger/balance behavior only, no order/fulfillment tables.
- `modules/crm/migrations/0001_crm.sql`, `modules/crm/server/schema.ts`, `modules/crm/server/service.ts`: contacts and deals only, no return/promotion/tender/visit/franchise/shipment tables.
- Existing QLDN modules: procurement has purchase-side bid/supplier master; sales-plus tender is sell-side and remains separate.

Conclusion: Beat 15 may add only sales-plus extensions. It must not create customer/lead/order/item masters. Implemented tables are `qsa_` only, 16 total.
