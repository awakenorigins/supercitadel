// CRM tools — registered into Tiểu Tâm's tool registry so the AI can read CRM data.
import type { ToolDef } from '@citadel/tieu-tam';
import { listDeals, crmStats } from './service.js';

export function crmTools(db: any): ToolDef[] {
  return [
    {
      name: 'crm.query_deals', module: 'crm', description: 'Đọc danh sách deal đang mở',
      requiresPermission: 'crm:deals:read',
      handler: async (_input, ctx) => {
        const deals = await listDeals(db, ctx.orgId);
        const stats = await crmStats(db, ctx.orgId);
        return { open: stats.openDeals, totalVnd: stats.totalValueVnd, deals: deals.slice(0, 5) };
      },
    },
  ];
}
