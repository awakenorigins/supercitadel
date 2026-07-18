# QLDN Asset & Equipment

Beat 14 delivers module `qldn-asset` for tenant-scoped asset operations.

## Tables
- `qas_assets`: asset/equipment master. Soft refs: `supplier_ref`, `accounting_asset_ref`, `inventory_item_ref`, `location_ref`, `custodian_ref`.
- `qas_asset_assignments`: assignment and return lifecycle.
- `qas_asset_transfers`: transfer history.
- `qas_vehicles`: vehicle profile bound one-to-one to an asset.
- `qas_usage_logs`: vehicle/equipment usage and odometer logs.
- `qas_maintenance_orders`: maintenance/repair work orders.
- `qas_inspections`: inspection/check records.
- `qas_incidents`: incident reporting with optional repair work order.

## Rules
- Every service and route filters by `org_id`; cross-org reads return 404.
- Assign only from `available`/`returned`; return only active assignment; retired/lost/disposed assets cannot transfer/use/maintain.
- Idempotency keys are supported for assignment, transfer and usage logs.
- Vehicle creation may create an asset wrapper and never duplicates accounting/inventory vehicle entities.
- Incident with `createMaintenanceOrder` opens a repair order and links it.

## Permissions
Manifest and registry expose `qldn-asset.*` permission gates for read/write/admin operations. Manager+ roles receive wildcard access; staff does not.

## Events
Emits lifecycle events for asset created/assigned/transferred/returned, vehicle created, usage logged, maintenance opened/completed, inspection recorded and incident reported. Events use the shared `emitEvent` / outbox contract.
