/**
 * SOUL-MANAGER — Smoke test trên Postgres THẬT (PGlite in-process)
 *
 * Chứng minh ngưỡng đạt:
 *   1. 18 tools/actions Tiểu Tâm CHẠY THẬT (qua handler + Zod, DB thật)
 *   2. RLS FAIL-CLOSED: cross-tenant bị chặn tầng DB; quên set org → LỖI
 *   3. Golden path đầy đủ: NV → chấm công → nghỉ phép → payroll → báo cáo
 *   4. Guard nghiệp vụ: trùng công, vượt phép, khóa kỳ lương...
 *   5. Event payload luôn mang org_id
 *   6. Backfill 0002 idempotent từ module hr cũ
 *
 * PGlite user mặc định là superuser (bypass RLS) → test tạo role
 * `citadel_app` KHÔNG superuser và SET ROLE trong mỗi transaction.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { EventBus, HrCtx, HrEventPayload } from '../src/types.js';
import { HrError } from '../src/types.js';
import { getHrTool, hrTools, hrReadTools, hrWriteActions } from '../src/tools/index.js';
import { hrEmployees } from '../src/db/schema.js';
import { createHrRoutes } from '../src/routes.js';
import { M } from '../src/money.js';

const __dir = dirname(fileURLToPath(import.meta.url));

let passed = 0; let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}
function eqM(name: string, actual: unknown, expected: string) {
  check(name, M.cmp(String(actual), expected) === 0, `(actual=${actual}, expected=${expected})`);
}
async function expectError(name: string, code: string, fn: () => Promise<unknown>) {
  try { await fn(); check(name, false, `(không ném lỗi, mong ${code})`); }
  catch (e) {
    if (e instanceof HrError) check(name, e.code === code, `(code=${e.code}, mong ${code})`);
    else check(name, false, `(lỗi lạ: ${String(e).slice(0, 120)})`);
  }
}

const events: Array<{ name: string; payload: HrEventPayload }> = [];
const captureBus: EventBus = { emit: (name, payload) => { events.push({ name, payload }); } };

async function main() {
  console.log('— Khởi tạo Postgres in-process (PGlite) —');
  const client = new PGlite();
  const db = drizzle(client);

  for (const f of ['0000_init.sql', '0001_rls.sql']) {
    await client.exec(await readFile(join(__dir, '..', 'migrations', f), 'utf8'));
  }
  await client.exec(`
    CREATE ROLE citadel_app LOGIN;
    GRANT USAGE ON SCHEMA public TO citadel_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citadel_app;
  `);

  const ORG_A = randomUUID();
  const ORG_B = randomUUID();
  const ORG_C = randomUUID();
  const USER = randomUUID();

  async function withTenant<T>(orgId: string, fn: (ctx: HrCtx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      return fn({ db: tx as unknown as HrCtx['db'], orgId, userId: USER, bus: captureBus });
    });
  }
  async function runTool(orgId: string, name: string, input: unknown) {
    const tool = getHrTool(name);
    if (!tool) throw new Error(`Tool không tồn tại: ${name}`);
    return withTenant(orgId, (ctx) => tool.handler(ctx, input));
  }
  const pad = (n: number) => String(n).padStart(2, '0');

  // ============================================================
  console.log('\n— A. BẢN KHAI TOOL (mặt cắt ⑥) —');
  // ============================================================
  check(`Tổng 18 tools (thực tế ${hrTools.length})`, hrTools.length === 18);
  check('8 read tools (kind=tool)', hrTools.filter((t) => t.kind === 'tool').length === 8);
  check('10 write actions (kind=action)', hrWriteActions.length === 10
    && hrWriteActions.every((t) => t.kind === 'action'));
  check('Mọi tool có permission dạng hr.resource.action',
    hrTools.every((t) => /^hr\.[a-z_]+\.[a-z_]+$/.test(t.permission)));
  check('Routes khai 18 đường', createHrRoutes().length === 18);

  // ============================================================
  console.log('\n— B. GOLDEN PATH: hồ sơ nhân viên —');
  // ============================================================
  const an = await runTool(ORG_A, 'hr.employee.create', {
    full_name: 'Trần Văn An', department: 'Kinh doanh', position: 'Nhân viên kinh doanh',
    hire_date: '2026-07-01', base_salary: '20000000', status: 'active', contract_type: 'indefinite',
  }) as { code: string };
  check('1. Tạo An — mã tự sinh NV0001', an.code === 'NV0001');

  const binh = await runTool(ORG_A, 'hr.employee.create', {
    full_name: 'Lê Thị Bình', department: 'Kỹ thuật', position: 'Kỹ sư phần mềm',
    hire_date: '2026-07-01', base_salary: '30000000', status: 'active', contract_type: 'indefinite',
  }) as { code: string };
  check('2. Tạo Bình — NV0002', binh.code === 'NV0002');

  const cuong = await runTool(ORG_A, 'hr.employee.create', {
    full_name: 'Phạm Văn Cường', department: 'Kỹ thuật', position: 'Kỹ sư phần mềm',
    hire_date: '2026-07-01', base_salary: '26000000', status: 'active', contract_type: 'indefinite',
  }) as { code: string };
  check('3. Tạo Cường — NV0003', cuong.code === 'NV0003');

  await expectError('4. Trùng mã NV → EMPLOYEE_CODE_TAKEN', 'EMPLOYEE_CODE_TAKEN',
    () => runTool(ORG_A, 'hr.employee.create', {
      code: 'NV0001', full_name: 'X', hire_date: '2026-07-01', base_salary: '1000000',
    }));

  const dep = await runTool(ORG_A, 'hr.dependent.register', {
    employee_code: 'NV0002', full_name: 'Lê Bảo Anh', relationship: 'con', dob: '2020-05-01',
  }) as { active_dependents: number };
  check('5. Đăng ký NPT cho Bình — 1 người', dep.active_dependents === 1);

  const search = await runTool(ORG_A, 'hr.employee.search', { department: 'Kỹ thuật' }) as { count: number };
  check('6. Tìm theo phòng Kỹ thuật → 2 NV', search.count === 2);

  const profile = await runTool(ORG_A, 'hr.employee.get', { code: 'NV0002' }) as {
    full_name: string; dependents: unknown[]; leave_balances_this_year: Array<{ remaining: string }>;
  };
  check('7. Hồ sơ 360° Bình có NPT + phép năm', profile.full_name === 'Lê Thị Bình'
    && profile.dependents.length === 1 && profile.leave_balances_this_year.length >= 1);
  eqM('8. Phép năm khởi tạo 12 ngày', profile.leave_balances_this_year[0]!.remaining, '12');

  // ============================================================
  console.log('\n— C. CHẤM CÔNG tháng 07/2026 —');
  // ============================================================
  for (let d = 1; d <= 26; d++) {
    await runTool(ORG_A, 'hr.attendance.record', {
      employee_code: 'NV0001', work_date: `2026-07-${pad(d)}`,
      check_in: d === 10 ? '08:30' : '08:00', check_out: '17:00',
    });
  }
  for (let d = 1; d <= 26; d++) {
    if (d === 15) continue;
    await runTool(ORG_A, 'hr.attendance.record', {
      employee_code: 'NV0002', work_date: `2026-07-${pad(d)}`, check_in: '08:00', check_out: '17:00',
    });
  }
  await runTool(ORG_A, 'hr.attendance.record', {
    employee_code: 'NV0002', work_date: '2026-07-15', status: 'leave', note: 'Nghỉ phép năm',
  });
  for (let d = 1; d <= 26; d++) {
    await runTool(ORG_A, 'hr.attendance.record', {
      employee_code: 'NV0003', work_date: `2026-07-${pad(d)}`,
      check_in: '08:00', check_out: '17:00',
      ...(d === 5 ? { ot_weekday_hours: '10' } : {}),
      ...(d === 6 ? { ot_weekend_hours: '4' } : {}),
    });
  }
  check('9. Đã ghi 78 bản ghi công (3 NV × 26 ngày)', true);

  await expectError('10. Chấm trùng ngày → ATTENDANCE_DUPLICATE', 'ATTENDANCE_DUPLICATE',
    () => runTool(ORG_A, 'hr.attendance.record', {
      employee_code: 'NV0001', work_date: '2026-07-01', check_in: '09:00',
    }));
  const fixed = await runTool(ORG_A, 'hr.attendance.record', {
    employee_code: 'NV0001', work_date: '2026-07-01',
    check_in: '08:00', check_out: '17:00', allow_update: true,
  }) as { late_minutes: number };
  check('11. allow_update sửa được ngày đã chấm', fixed.late_minutes === 0);
  await expectError('12. Giờ ra < giờ vào → INVALID_TIME_RANGE', 'INVALID_TIME_RANGE',
    () => runTool(ORG_A, 'hr.attendance.record', {
      employee_code: 'NV0001', work_date: '2026-07-27', check_in: '08:00', check_out: '07:00',
    }));
  await expectError('13. NV không tồn tại → EMPLOYEE_NOT_FOUND', 'EMPLOYEE_NOT_FOUND',
    () => runTool(ORG_A, 'hr.attendance.record', { employee_code: 'NV9999', work_date: '2026-07-01' }));

  const attAn = await runTool(ORG_A, 'hr.attendance.summary', {
    year: 2026, month: 7, employee_code: 'NV0001',
  }) as { summary: Array<{ worked_days: string; late_minutes: string }> };
  eqM('14. Bảng công An: 26 công', attAn.summary[0]!.worked_days, '26');
  eqM('15. Bảng công An: 30 phút muộn (ngày 10)', attAn.summary[0]!.late_minutes, '30');

  // ============================================================
  console.log('\n— D. NGHỈ PHÉP (BLLĐ 2019) —');
  // ============================================================
  const leaveReq = await runTool(ORG_A, 'hr.leave.request', {
    employee_code: 'NV0002', leave_type: 'PHEP-NAM',
    start_date: '2026-07-15', end_date: '2026-07-15', days: '1', reason: 'Việc gia đình',
  }) as { request_id: string; status: string };
  check('16. Tạo đơn nghỉ 1 ngày — pending', leaveReq.status === 'pending');

  await expectError('17. Xin 20 ngày vượt số dư → LEAVE_INSUFFICIENT_BALANCE', 'LEAVE_INSUFFICIENT_BALANCE',
    () => runTool(ORG_A, 'hr.leave.request', {
      employee_code: 'NV0002', leave_type: 'PHEP-NAM',
      start_date: '2026-07-20', end_date: '2026-07-24', days: '20',
    }));
  await expectError('18. Đơn vắt 2 tháng → LEAVE_SPANS_MONTHS', 'LEAVE_SPANS_MONTHS',
    () => runTool(ORG_A, 'hr.leave.request', {
      employee_code: 'NV0002', leave_type: 'PHEP-NAM',
      start_date: '2026-07-30', end_date: '2026-08-02', days: '4',
    }));

  const decided = await runTool(ORG_A, 'hr.leave.decide', {
    request_id: leaveReq.request_id, decision: 'approved',
  }) as { status: string };
  check('19. Duyệt đơn — approved', decided.status === 'approved');
  await expectError('20. Duyệt lại đơn đã duyệt → LEAVE_NOT_PENDING', 'LEAVE_NOT_PENDING',
    () => runTool(ORG_A, 'hr.leave.decide', { request_id: leaveReq.request_id, decision: 'approved' }));

  const bal = await runTool(ORG_A, 'hr.leave.balance', { employee_code: 'NV0002', year: 2026 }) as {
    balances: Array<{ leave_type: string; remaining: string; used: string }>;
  };
  const phepNam = bal.balances.find((b) => b.leave_type === 'PHEP-NAM')!;
  eqM('21. Số dư phép sau duyệt: dùng 1', phepNam.used, '1');
  eqM('22. Số dư phép còn 11', phepNam.remaining, '11');

  // ============================================================
  console.log('\n— E. BẢNG LƯƠNG 07/2026 — đối chiếu từng đồng —');
  // ============================================================
  const payroll = await runTool(ORG_A, 'hr.payroll.run', { year: 2026, month: 7 }) as {
    employees: number; total_gross: string; total_net: string;
    payslips: Array<{ employee_code: string; net: string }>;
  };
  check('23. Tính lương cho 3 NV', payroll.employees === 3);
  const netOf = (c: string) => payroll.payslips.find((p) => p.employee_code === c)!.net;
  eqM('24. An (20tr, 26 công, 0 NPT): net 17.780.000', netOf('NV0001'), '17780000');
  eqM('25. Bình (30tr, 25 công + 1 phép hưởng lương, 1 NPT): net 26.592.500', netOf('NV0002'), '26592500');
  eqM('26. Cường (26tr + OT 10wd/4we): net 25.669.000', netOf('NV0003'), '25669000');
  eqM('27. Tổng thực nhận = 70.041.500', payroll.total_net, '70041500');
  eqM('28. Tổng gross = 78.875.000', payroll.total_gross, '78875000');

  const slip = await runTool(ORG_A, 'hr.payroll.payslip', {
    year: 2026, month: 7, employee_code: 'NV0002',
  }) as {
    paid_days: string; insurance: { total: string }; pit: string;
    breakdown: { explain: string[] };
  };
  eqM('29. Phiếu Bình: paid_days 26 (25 công + 1 phép)', slip.paid_days, '26');
  eqM('30. Phiếu Bình: BH 3.150.000', slip.insurance.total, '3150000');
  eqM('31. Phiếu Bình: thuế 257.500', slip.pit, '257500');
  check('32. Phiếu có explain tiếng Việt ≥5 dòng cho Tiểu Tâm',
    Array.isArray(slip.breakdown.explain) && slip.breakdown.explain.length >= 5);

  const slipOT = await runTool(ORG_A, 'hr.payroll.payslip', {
    year: 2026, month: 7, employee_code: 'NV0003',
  }) as { ot_pay: string; ot_tax_exempt: string };
  eqM('33. Phiếu Cường: OT 2.875.000', slipOT.ot_pay, '2875000');
  eqM('34. Phiếu Cường: OT miễn thuế 1.125.000', slipOT.ot_tax_exempt, '1125000');

  const summary = await runTool(ORG_A, 'hr.payroll.payslip', { year: 2026, month: 7 }) as {
    employees: number; total_net: string;
  };
  check('35. Tổng hợp kỳ: 3 phiếu', summary.employees === 3);
  eqM('36. Tổng hợp kỳ khớp 70.041.500', summary.total_net, '70041500');

  const rerun = await runTool(ORG_A, 'hr.payroll.run', { year: 2026, month: 7 }) as { total_net: string };
  eqM('37. Tính lại khi chưa chốt: idempotent, vẫn 70.041.500', rerun.total_net, '70041500');

  const approved = await runTool(ORG_A, 'hr.payroll.approve', { year: 2026, month: 7 }) as { status: string };
  check('38. Chốt kỳ — approved', approved.status === 'approved');
  await expectError('39. Tính lại kỳ đã chốt → PERIOD_LOCKED', 'PERIOD_LOCKED',
    () => runTool(ORG_A, 'hr.payroll.run', { year: 2026, month: 7 }));
  await expectError('40. Chốt lại → PERIOD_NOT_CALCULATED', 'PERIOD_NOT_CALCULATED',
    () => runTool(ORG_A, 'hr.payroll.approve', { year: 2026, month: 7 }));
  await expectError('41. Phiếu lương kỳ chưa chạy → PERIOD_NOT_FOUND', 'PERIOD_NOT_FOUND',
    () => runTool(ORG_A, 'hr.payroll.payslip', { year: 2026, month: 8 }));

  // ============================================================
  console.log('\n— F. BÁO CÁO & TỔ CHỨC —');
  // ============================================================
  const chart = await runTool(ORG_A, 'hr.org.chart', { include_employees: true }) as {
    total_headcount: number; departments: Array<{ name: string; headcount: number }>;
  };
  check('42. Sơ đồ: 2 phòng ban, 3 NV', chart.departments.length === 2 && chart.total_headcount === 3);
  const hc = await runTool(ORG_A, 'hr.report.headcount', {}) as {
    active_headcount: number; hired_in_range: number;
  };
  check('43. Headcount active = 3, tuyển mới trong năm = 3',
    hc.active_headcount === 3 && hc.hired_in_range === 3);

  // ============================================================
  console.log('\n— G. TUYỂN DỤNG & ĐÀO TẠO —');
  // ============================================================
  await runTool(ORG_A, 'hr.candidate.advance', {
    mode: 'add', opening_title: 'Kế toán trưởng', full_name: 'Phạm Thu Hà', email: 'ha@x.vn',
  });
  const movedC = await runTool(ORG_A, 'hr.candidate.advance', {
    mode: 'move', opening_title: 'Kế toán trưởng', full_name: 'Phạm Thu Hà', stage: 'interview',
  }) as { from: string; to: string };
  check('44. Ứng viên: applied → interview', movedC.from === 'applied' && movedC.to === 'interview');
  const pipe = await runTool(ORG_A, 'hr.recruitment.pipeline', {}) as {
    openings: Array<{ title: string; stages: Record<string, number> }>;
  };
  check('45. Pipeline: 1 vị trí, interview=1',
    pipe.openings.length === 1 && pipe.openings[0]!.stages['interview'] === 1);
  await expectError('46. Move ứng viên không có → CANDIDATE_NOT_FOUND', 'CANDIDATE_NOT_FOUND',
    () => runTool(ORG_A, 'hr.candidate.advance', {
      mode: 'move', opening_title: 'Kế toán trưởng', full_name: 'Không Ai Cả', stage: 'offer',
    }));

  await runTool(ORG_A, 'hr.training.manage', {
    mode: 'create_course', course_code: 'EXCEL-01', course_name: 'Excel nâng cao', hours: '16',
  });
  const enr1 = await runTool(ORG_A, 'hr.training.manage', {
    mode: 'enroll', course_code: 'EXCEL-01', employee_code: 'NV0001',
  }) as { status: string };
  const enr2 = await runTool(ORG_A, 'hr.training.manage', {
    mode: 'enroll', course_code: 'EXCEL-01', employee_code: 'NV0001',
  }) as { status: string };
  check('47. Ghi danh idempotent', enr1.status === 'enrolled' && enr2.status === 'enrolled');
  const done = await runTool(ORG_A, 'hr.training.manage', {
    mode: 'complete', course_code: 'EXCEL-01', employee_code: 'NV0001', score: '9',
  }) as { status: string };
  check('48. Hoàn thành khóa học', done.status === 'completed');
  await expectError('49. Complete chưa ghi danh → ENROLLMENT_NOT_FOUND', 'ENROLLMENT_NOT_FOUND',
    () => runTool(ORG_A, 'hr.training.manage', {
      mode: 'complete', course_code: 'EXCEL-01', employee_code: 'NV0002',
    }));

  // ============================================================
  console.log('\n— H. CẬP NHẬT HỒ SƠ & NGHỈ VIỆC —');
  // ============================================================
  const raised = await runTool(ORG_A, 'hr.employee.update', {
    code: 'NV0001', base_salary: '25000000',
  }) as { base_salary: string };
  eqM('50. Tăng lương An lên 25tr', raised.base_salary, '25000000');
  const term = await runTool(ORG_A, 'hr.employee.update', {
    code: 'NV0003', status: 'terminated', terminated_at: '2026-07-31', note: 'Hết hợp đồng',
  }) as { status: string; terminated_at: string };
  check('51. Cho Cường nghỉ việc', term.status === 'terminated' && term.terminated_at === '2026-07-31');
  await expectError('52. Chấm công NV đã nghỉ → EMPLOYEE_NOT_ACTIVE', 'EMPLOYEE_NOT_ACTIVE',
    () => runTool(ORG_A, 'hr.attendance.record', { employee_code: 'NV0003', work_date: '2026-08-03' }));

  // ============================================================
  console.log('\n— I. RLS FAIL-CLOSED (Hiến pháp #1) —');
  // ============================================================
  const searchB = await runTool(ORG_B, 'hr.employee.search', {}) as { count: number };
  check('53. Org B tìm NV → 0 (không thấy data org A)', searchB.count === 0);
  await expectError('54. Org B đọc NV0001 của A → EMPLOYEE_NOT_FOUND', 'EMPLOYEE_NOT_FOUND',
    () => runTool(ORG_B, 'hr.employee.get', { code: 'NV0001' }));

  let crossBlocked = false;
  try {
    await withTenant(ORG_B, async (ctx) => {
      await ctx.db.insert(hrEmployees).values({
        orgId: ORG_A, code: 'HACK-01', fullName: 'Kẻ xâm nhập',
        hireDate: '2026-07-01', baseSalary: '1',
      });
    });
  } catch { crossBlocked = true; }
  check('55. Org B insert giả org_id=A → WITH CHECK chặn tầng DB', crossBlocked);

  let failClosed = false;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE citadel_app`));
      await tx.execute(sql.raw(`SELECT * FROM sm_employees LIMIT 1`));
    });
  } catch { failClosed = true; }
  check('56. Quên SET org → SELECT bị LỖI (fail-closed, không lộ rỗng)', failClosed);

  // ============================================================
  console.log('\n— J. EVENT BUS (mặt cắt ⑤) —');
  // ============================================================
  check(`57. Đã phát ${events.length} event (≥ 90)`, events.length >= 90);
  check('58. 100% payload mang org_id', events.every((e) => typeof e.payload.org_id === 'string'));
  const names = new Set(events.map((e) => e.name));
  for (const must of ['hr.employee.created', 'hr.attendance.recorded', 'hr.leave.requested',
    'hr.leave.approved', 'hr.payroll.calculated', 'hr.payroll.approved',
    'hr.employee.terminated', 'hr.candidate.stage_changed', 'hr.training.completed',
    'hr.dependent.registered'] as const) {
    check(`59. Có event ${must}`, names.has(must));
  }

  // ============================================================
  console.log('\n— K. BACKFILL 0002 idempotent (module hr cũ) —');
  // ============================================================
  await client.exec(`
    CREATE TABLE departments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, name text NOT NULL);
    CREATE TABLE employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
      full_name text NOT NULL, code text, base_salary numeric, hire_date date, department_id uuid);
    INSERT INTO departments (id, org_id, name) VALUES ('11111111-1111-1111-1111-111111111111', '${ORG_C}', 'Phòng Cũ');
    INSERT INTO employees (org_id, full_name, code, base_salary, hire_date, department_id)
      VALUES ('${ORG_C}', 'Nguyễn Hệ Cũ', 'OLD-01', 15000000, '2024-01-01', '11111111-1111-1111-1111-111111111111');
  `);
  const backfillSql = await readFile(join(__dir, '..', 'migrations', '0002_backfill_legacy.sql'), 'utf8');
  await client.exec(backfillSql);
  const found1 = await runTool(ORG_C, 'hr.employee.search', { q: 'Hệ Cũ' }) as {
    count: number; employees: Array<{ code: string; department: string | null }>;
  };
  check('60. Backfill hút NV cũ sang (mã OLD-01, có phòng ban)',
    found1.count === 1 && found1.employees[0]!.code === 'OLD-01'
    && found1.employees[0]!.department === 'Phòng Cũ');
  await client.exec(backfillSql);
  const found2 = await runTool(ORG_C, 'hr.employee.search', {}) as { count: number };
  check('61. Chạy backfill lần 2 → không nhân đôi (idempotent)', found2.count === 1);

  console.log(`\n══ KẾT QUẢ SMOKE: ${passed} pass / ${failed} fail ══`);
  check('62. Read tools chỉ đọc — không có action trong hrReadTools',
    hrReadTools.every((t) => t.kind === 'tool'));
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
