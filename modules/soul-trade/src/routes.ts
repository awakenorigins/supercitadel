/** SOUL-TRADE — Route map (framework-neutral; host binds to Hono). HTTP → tool. */
import { getTradeTool, type TradeToolDefinition, type TradeToolCtx } from './tools/index.js';

export interface TradeRouteRequest { params: Record<string, string>; query: Record<string, string | undefined>; body?: unknown; }
export interface TradeRouteDefinition {
  method: 'GET' | 'POST' | 'DELETE'; path: string; permission: string; tool: string;
  mapInput(req: TradeRouteRequest): unknown; handler(ctx: TradeToolCtx, req: TradeRouteRequest): Promise<unknown>;
}
function toInt(v: string | undefined): number | undefined { if (!v) return undefined; const n = parseInt(v, 10); return Number.isNaN(n) ? undefined : n; }
function route(def: { method: TradeRouteDefinition['method']; path: string; tool: string; mapInput(req: TradeRouteRequest): unknown; }): TradeRouteDefinition {
  const tool: TradeToolDefinition | undefined = getTradeTool(def.tool);
  if (!tool) throw new Error(`Route points to unknown tool: ${def.tool}`);
  return { method: def.method, path: def.path, permission: tool.permission, tool: def.tool, mapInput: def.mapInput,
    handler: (ctx, req) => tool.handler(ctx, def.mapInput(req)) };
}
export function createTradeRoutes(): TradeRouteDefinition[] {
  return [
    route({ method: 'GET', path: '/trade/bots', tool: 'soul-trade.bot.list', mapInput: () => ({}) }),
    route({ method: 'POST', path: '/trade/bots', tool: 'soul-trade.bot.create', mapInput: ({ body }) => body }),
    route({ method: 'GET', path: '/trade/bots/:name', tool: 'soul-trade.bot.status', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'DELETE', path: '/trade/bots/:name', tool: 'soul-trade.bot.delete', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/start', tool: 'soul-trade.bot.start', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/stop', tool: 'soul-trade.bot.stop', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/evaluate', tool: 'soul-trade.turn.evaluate', mapInput: ({ params, body }) => ({ name: params.name, ...(body as object ?? {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/trades', tool: 'soul-trade.trades.recent', mapInput: ({ params, query }) => ({ name: params.name, ...(toInt(query.limit) !== undefined ? { limit: toInt(query.limit) } : {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/analytics', tool: 'soul-trade.analytics.summary', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'GET', path: '/trade/bots/:name/memory', tool: 'soul-trade.memory.recent', mapInput: ({ params, query }) => ({ name: params.name, ...(toInt(query.limit) !== undefined ? { limit: toInt(query.limit) } : {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/agents', tool: 'soul-trade.agents.contribution', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'GET', path: '/trade/analytics', tool: 'soul-trade.analytics.org', mapInput: () => ({}) }),
    route({ method: 'POST', path: '/trade/backtest', tool: 'soul-trade.backtest.run', mapInput: ({ body }) => body }),
    route({ method: 'POST', path: '/trade/walkforward', tool: 'soul-trade.walkforward.run', mapInput: ({ body }) => body }),
    route({ method: 'GET', path: '/trade/bots/:name/recall', tool: 'soul-trade.memory.recall', mapInput: ({ params, query }) => ({ name: params.name, query: query.query ?? '', ...(query.limit ? { limit: parseInt(query.limit, 10) } : {}) }) }),
  ];
}
