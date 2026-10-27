/**
 * SOUL-MANAGER — Route definitions (mặt cắt ① routes + ⑦ biên)
 * Framework-neutral: host (Hono trong Citadel) bind theo bản khai này.
 * Mọi mutation đi qua đúng tool handler → Zod parse tại biên.
 */
import { getHrTool, type HrToolDefinition } from './tools/index.js';
import type { HrCtx } from './types.js';

export interface HrRouteRequest {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body?: unknown;
}

export interface HrRouteDefinition {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  permission: string;
  tool: string;
  /** Gom params/query/body thành input cho tool (tool tự Zod parse) */
  mapInput(req: HrRouteRequest): unknown;
  handler(ctx: HrCtx, req: HrRouteRequest): Promise<unknown>;
}

function toInt(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

function route(def: {
  method: HrRouteDefinition['method']; path: string; tool: string;
  mapInput(req: HrRouteRequest): unknown;
}): HrRouteDefinition {
  const tool: HrToolDefinition | undefined = getHrTool(def.tool);
  if (!tool) throw new Error(`Route trỏ tới tool không tồn tại: ${def.tool}`);
  return {
    method: def.method,
    path: def.path,
    permission: tool.permission,
    tool: def.tool,
    mapInput: def.mapInput,
    handler: (ctx, req) => tool.handler(ctx, def.mapInput(req)),
  };
}

export function createHrRoutes(): HrRouteDefinition[] {
  return [
    // ── Employee ──
    route({
      method: 'GET', path: '/hr/employees', tool: 'hr.employee.search',
      mapInput: ({ query }) => ({
        q: query.q, department: query.department, status: query.status,
        ...(toInt(query.limit) !== undefined ? { limit: toInt(query.limit) } : {}),
      }),
    }),
    route({
      method: 'POST', path: '/hr/employees', tool: 'hr.employee.create',
      mapInput: ({ body }) => body,
    }),
    route({
      method: 'GET', path: '/hr/employees/:code', tool: 'hr.employee.get',
      mapInput: ({ params }) => ({ code: params.code }),
    }),
    route({
      method: 'PATCH', path: '/hr/employees/:code', tool: 'hr.employee.update',
      mapInput: ({ params, body }) => ({ ...(body as object ?? {}), code: params.code }),
    }),
    route({
      method: 'POST', path: '/hr/employees/:code/dependents', tool: 'hr.dependent.register',
      mapInput: ({ params, body }) => ({ ...(body as object ?? {}), employee_code: params.code }),
    }),
    // ── Org ──
    route({
      method: 'GET', path: '/hr/org/chart', tool: 'hr.org.chart',
      mapInput: ({ query }) => ({ include_employees: query.include_employees === 'true' }),
    }),
    // ── Attendance ──
    route({
      method: 'POST', path: '/hr/attendance', tool: 'hr.attendance.record',
      mapInput: ({ body }) => body,
    }),
    route({
      method: 'GET', path: '/hr/attendance/summary', tool: 'hr.attendance.summary',
      mapInput: ({ query }) => ({
        year: toInt(query.year), month: toInt(query.month), employee_code: query.employee_code,
      }),
    }),
    // ── Leave ──
    route({
      method: 'GET', path: '/hr/leave/balance', tool: 'hr.leave.balance',
      mapInput: ({ query }) => ({
        employee_code: query.employee_code,
        ...(toInt(query.year) !== undefined ? { year: toInt(query.year) } : {}),
      }),
    }),
    route({
      method: 'POST', path: '/hr/leave/requests', tool: 'hr.leave.request',
      mapInput: ({ body }) => body,
    }),
    route({
      method: 'POST', path: '/hr/leave/requests/:id/decide', tool: 'hr.leave.decide',
      mapInput: ({ params, body }) => ({ ...(body as object ?? {}), request_id: params.id }),
    }),
    // ── Payroll ──
    route({
      method: 'POST', path: '/hr/payroll/run', tool: 'hr.payroll.run',
      mapInput: ({ body }) => body,
    }),
    route({
      method: 'POST', path: '/hr/payroll/:year/:month/approve', tool: 'hr.payroll.approve',
      mapInput: ({ params }) => ({ year: toInt(params.year), month: toInt(params.month) }),
    }),
    route({
      method: 'GET', path: '/hr/payroll/payslip', tool: 'hr.payroll.payslip',
      mapInput: ({ query }) => ({
        year: toInt(query.year), month: toInt(query.month), employee_code: query.employee_code,
      }),
    }),
    // ── Report ──
    route({
      method: 'GET', path: '/hr/report/headcount', tool: 'hr.report.headcount',
      mapInput: ({ query }) => ({ from: query.from, to: query.to }),
    }),
    // ── Recruitment ──
    route({
      method: 'GET', path: '/hr/recruitment/pipeline', tool: 'hr.recruitment.pipeline',
      mapInput: ({ query }) => ({ opening_title: query.opening_title }),
    }),
    route({
      method: 'POST', path: '/hr/recruitment/candidates', tool: 'hr.candidate.advance',
      mapInput: ({ body }) => body,
    }),
    // ── Training ──
    route({
      method: 'POST', path: '/hr/training', tool: 'hr.training.manage',
      mapInput: ({ body }) => body,
    }),
  ];
}
