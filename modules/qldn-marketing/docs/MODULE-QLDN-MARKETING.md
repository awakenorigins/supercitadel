# QLDN Marketing
Owns campaign planning, channels, assets/content publication, market research, product messaging, marketing tasks and budget-request orchestration. It deliberately references CRM customers/segments and Sales products/orders only by external identifiers; it does not duplicate those entities.

## Security and workflows
All service reads/writes include `org_id`; child relations use composite `(org_id,id)` foreign keys. Permissions are split into read, write and approve. Campaign and publication transitions are explicit allow-lists. Creation idempotency stores tenant-scoped request hashes and rejects key reuse with a different payload. Budget submission/approval emits transactional core outbox events consumed by workflow/finance adapters; workflow approval/rejection handlers update only the event tenant.

## API
`GET /campaigns|channels|budgets|assets|research|publications|tasks`; `POST /campaigns`, `/budgets`; transition endpoints for campaigns, budgets, publications. Every endpoint requires authentication, module entitlement and permission.
