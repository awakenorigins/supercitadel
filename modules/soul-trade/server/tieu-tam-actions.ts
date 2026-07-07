/**
 * SOUL-TRADE — Tiểu Tâm write-actions adapter.
 * Turns the module's write actions into host action defs (same shape as soul-manager).
 * Each executes inside an org-scoped transaction (fail-closed RLS). Live/irreversible
 * actions are flagged sensitive so Tiểu Tâm confirms before executing.
 *
 * Wire in services/api/src/tieu-tam/actions.ts:
 *   import { soulTradeTieuTamActions } from '@citadel/module-soul-trade/server/tieu-tam-actions.js';
 *   defs.push(...soulTradeTieuTamActions());
 */
import { tradeWriteActions } from '../src/tools/index.js';
import { withOrgCtx } from './runtime.js';

const SENSITIVE = new Set(['soul-trade.bot.start', 'soul-trade.bot.delete']); // start = begins live/paper loop; delete = destructive

export function soulTradeTieuTamActions(): any[] {
  return tradeWriteActions.map((a) => {
    const sensitive = SENSITIVE.has(a.name);
    return {
      name: a.name,
      description: a.description ?? a.name,
      requiredModule: 'soul-trade',
      permission: a.permission,
      securityLevel: sensitive ? 2 : 1,
      sensitive,
      parameters: { type: 'object', properties: {}, additionalProperties: true },
      async execute(ctx: any, params: any) {
        const data = await withOrgCtx(ctx.orgId, ctx.userId ?? ctx.sub, (tctx) => a.handler(tctx, params ?? {}));
        await ctx.audit?.({ action: a.name, detail: params });
        return { ok: true, action: a.name, module: 'soul-trade', message: `Soul-Trade: ${a.name} done`, data };
      },
    };
  });
}

/** Read tools too, for the host tool registry (kind 'tool' → Tiểu Tâm may call freely). */
export { tradeReadTools as soulTradeReadTools, tradeTools as soulTradeTools } from '../src/tools/index.js';
