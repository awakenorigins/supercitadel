# QLDN — Sales Plus (Beat 16)

Paid overlay over CRM/OM masters. It owns 16 `qsa_` tables only; `customer_id`, `deal_id`, `sales_order_id`, `item_id`, and `supplier_id` remain references. Sales tenders explicitly reject procurement-bid payloads.

## Capabilities
- Return lifecycle `draft → submitted → approved/rejected → received → resolved`; receipt emits an inventory-directed outbox event. Creation and transitions are idempotent.
- Deterministic promotion evaluator: tenant/date/segment/minimum/SKU eligibility, priority ordering, stable tie-break, caps, exclusive-vs-stack behavior.
- Sales tender, guarantee, field visit/report, franchise review, import/export shipment tracking, customer materials, and versioned fulfillment overlay.
- Fulfillment transitions require idempotency keys, maintain monotonic versions, persist event proof, and emit OM/inventory outbox messages transactionally.

All reads/writes scope by JWT `orgId`; composite tenant FKs protect child rows. Routes mount at `/api/v1/qldn-sales-plus` through the manifest loader and module entitlement gate. Permissions are domain-specific `qldn-sales-plus.*`.
