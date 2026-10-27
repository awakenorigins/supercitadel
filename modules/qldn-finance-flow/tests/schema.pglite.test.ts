import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import * as schema from '../server/schema.js';

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error('✗', message);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log('✓', message);
}

const ORG_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const ORG_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const EMP_A = '33333333-3333-3333-3333-333333333333';
const EMP_B = '44444444-4444-4444-4444-444444444444';

async function makeDb() {
  const client = new PGlite();
  await client.exec(readFileSync(new URL('../migrations/0001_qldn_finance_flow.sql', import.meta.url), 'utf8'));
  return { client, db: drizzle(client, { schema }) as any };
}

const { client, db } = await makeDb();

const tableRows = await client.query<{ table_name: string }>(
  "select table_name from information_schema.tables where table_schema = 'public' and table_name like 'qfi_%' order by table_name",
);
assert(tableRows.rows.length === 23, 'migration tạo đúng 23 bảng qfi_');

for (const row of tableRows.rows) {
  const cols = await client.query<{ column_name: string; is_nullable: string }>(
    `select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = '${row.table_name}' and column_name = 'org_id'`,
  );
  assert(cols.rows[0]?.is_nullable === 'NO', `${row.table_name} có org_id NOT NULL`);
}

const [requestA] = await db.insert(schema.qfiPaymentRequests).values({
  orgId: ORG_A,
  requestNo: 'PR-A-001',
  requestType: 'payment',
  requesterId: USER_A,
  amount: '1200000',
  purpose: 'Thanh toán vật tư',
  documentStatus: 'valid',
  paymentMethod: 'cash',
  status: 'approved',
  createdBy: USER_A,
  createdAt: new Date(),
  updatedAt: new Date(),
}).returning();

await db.insert(schema.qfiPaymentRequestDocuments).values({
  orgId: ORG_A,
  paymentRequestId: requestA.id,
  documentType: 'BM de nghi thanh toan',
  isRequired: true,
  validationStatus: 'valid',
  createdAt: new Date(),
});

await db.insert(schema.qfiPaymentDisbursements).values({
  orgId: ORG_A,
  paymentRequestId: requestA.id,
  method: 'cash',
  amount: '1200000',
  status: 'executed',
});

await db.insert(schema.qfiAdvances).values({
  orgId: ORG_A,
  paymentRequestId: requestA.id,
  employeeId: EMP_A,
  advanceAmount: '500000',
  settlementStatus: 'open',
  status: 'approved',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const [claimA] = await db.insert(schema.qfiTravelExpenseClaims).values({
  orgId: ORG_A,
  claimNo: 'TEC-A-001',
  employeeId: EMP_A,
  claimedAmount: '750000',
  advanceAmount: '500000',
  settlementAmount: '250000',
  settlementType: 'pay_more',
  status: 'settled',
  createdAt: new Date(),
  updatedAt: new Date(),
}).returning();

await db.insert(schema.qfiPayrollDeductions).values({
  orgId: ORG_A,
  employeeId: EMP_A,
  travelExpenseClaimId: claimA.id,
  deductionMonth: '2026-07',
  amount: '0',
  reason: 'Không khấu trừ do thiếu chi thêm',
  status: 'cancelled',
  createdAt: new Date(),
});

const [debtA] = await db.insert(schema.qfiCustomerDebtStatements).values({
  orgId: ORG_A,
  statementNo: 'CD-A-001',
  customerId: USER_A,
  totalAmount: '9000000',
  confirmedAmount: '9000000',
  status: 'confirmed',
  createdAt: new Date(),
  updatedAt: new Date(),
}).returning();

await db.insert(schema.qfiDebtCollectionActions).values({
  orgId: ORG_A,
  customerDebtStatementId: debtA.id,
  actionType: 'reminder',
  reminderLevel: 1,
  status: 'done',
  createdAt: new Date(),
});

const [runA] = await db.insert(schema.qfiPayrollRuns).values({
  orgId: ORG_A,
  runNo: 'PAY-A-2026-07',
  periodCode: '2026-07',
  sourceModule: 'generic',
  grossTotal: '10000000',
  netTotal: '9000000',
  status: 'approved',
  createdBy: USER_A,
  createdAt: new Date(),
  updatedAt: new Date(),
}).returning();

const [lineA] = await db.insert(schema.qfiPayrollLines).values({
  orgId: ORG_A,
  payrollRunId: runA.id,
  employeeId: EMP_A,
  grossAmount: '10000000',
  deductionAmount: '1000000',
  netAmount: '9000000',
  status: 'approved',
}).returning();

await db.insert(schema.qfiPayslipFlows).values({
  orgId: ORG_A,
  payrollLineId: lineA.id,
  employeeId: EMP_A,
  deliveryStatus: 'sent',
  createdAt: new Date(),
});

await db.insert(schema.qfiPaymentRequests).values({
  orgId: ORG_B,
  requestNo: 'PR-B-001',
  requestType: 'advance',
  requesterId: USER_B,
  amount: '2200000',
  purpose: 'Tạm ứng org B',
  documentStatus: 'pending',
  paymentMethod: 'bank_transfer',
  status: 'draft',
  createdBy: USER_B,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const orgARequests = await db.select().from(schema.qfiPaymentRequests).where(eq(schema.qfiPaymentRequests.orgId, ORG_A));
const orgBRequests = await db.select().from(schema.qfiPaymentRequests).where(eq(schema.qfiPaymentRequests.orgId, ORG_B));
assert(orgARequests.length === 1 && orgARequests[0].requestNo === 'PR-A-001', 'org A chỉ thấy payment_request của org A khi filter org_id');
assert(orgBRequests.length === 1 && orgBRequests[0].requestNo === 'PR-B-001', 'org B chỉ thấy payment_request của org B khi filter org_id');

const crossOrg = await db.select().from(schema.qfiPaymentRequests).where(and(eq(schema.qfiPaymentRequests.orgId, ORG_B), eq(schema.qfiPaymentRequests.id, requestA.id)));
assert(crossOrg.length === 0, 'schema hỗ trợ isolation: org B không match id của org A khi kèm org_id');

console.log('[qldn-finance-flow schema] ALL PASSED');
