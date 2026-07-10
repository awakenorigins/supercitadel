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
    // Gắn tài khoản sàn thật (API keys — verify trước khi lưu, encrypt at rest)
    route({ method: 'GET', path: '/trade/market/movers', tool: 'soul-trade.market.movers', mapInput: ({ query }) => ({ ...(query.exchange ? { exchange: query.exchange } : {}), ...(toInt(query.limit) !== undefined ? { limit: toInt(query.limit) } : {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/keys', tool: 'soul-trade.bot.keys.status', mapInput: ({ params, query }) => ({ name: params.name, ...(query.verify === '1' || query.verify === 'true' ? { verify: true } : {}) }) }),
    route({ method: 'POST', path: '/trade/bots/:name/keys', tool: 'soul-trade.bot.keys.set', mapInput: ({ params, body }) => ({ name: params.name, ...(body as object ?? {}) }) }),
    route({ method: 'DELETE', path: '/trade/bots/:name/keys', tool: 'soul-trade.bot.keys.clear', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/start', tool: 'soul-trade.bot.start', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/stop', tool: 'soul-trade.bot.stop', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/evaluate', tool: 'soul-trade.turn.evaluate', mapInput: ({ params, body }) => ({ name: params.name, ...(body as object ?? {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/trades', tool: 'soul-trade.trades.recent', mapInput: ({ params, query }) => ({ name: params.name, ...(toInt(query.limit) !== undefined ? { limit: toInt(query.limit) } : {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/analytics', tool: 'soul-trade.analytics.summary', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'GET', path: '/trade/bots/:name/memory', tool: 'soul-trade.memory.recent', mapInput: ({ params, query }) => ({ name: params.name, ...(toInt(query.limit) !== undefined ? { limit: toInt(query.limit) } : {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/agents', tool: 'soul-trade.agents.contribution', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'GET', path: '/trade/bots/:name/automato', tool: 'soul-trade.automato.status', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/configure', tool: 'soul-trade.automato.configure', mapInput: ({ params, body }) => ({ name: params.name, ...(body as object ?? {}) }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/quickstart', tool: 'soul-trade.automato.quickstart', mapInput: ({ params, body }) => ({ name: params.name, ...(body as object ?? {}) }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/arm', tool: 'soul-trade.automato.arm', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/disarm', tool: 'soul-trade.automato.disarm', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/preset', tool: 'soul-trade.automato.preset', mapInput: ({ params, body }) => ({ name: params.name, ...(body as object ?? {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/automato/ohlcv', tool: 'soul-trade.automato.ohlcv', mapInput: ({ params, query }) => ({ name: params.name, tf: query.tf ?? '1m', ...(toInt(query.limit) !== undefined ? { limit: toInt(query.limit) } : {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/automato/position', tool: 'soul-trade.automato.position', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/kill', tool: 'soul-trade.automato.kill', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'GET', path: '/trade/bots/:name/automato/log', tool: 'soul-trade.automato.log', mapInput: ({ params, query }) => ({ name: params.name, ...(toInt(query.limit) !== undefined ? { limit: toInt(query.limit) } : {}) }) }),
    route({ method: 'GET', path: '/trade/bots/:name/automato/analytics', tool: 'soul-trade.automato.analytics', mapInput: ({ params }) => ({ name: params.name }) }),
    // Đa lệnh (multi-order slots)
    route({ method: 'GET', path: '/trade/bots/:name/automato/orders', tool: 'soul-trade.automato.orders.list', mapInput: ({ params }) => ({ name: params.name }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/orders', tool: 'soul-trade.automato.orders.add', mapInput: ({ params, body }) => ({ name: params.name, ...(body as object ?? {}) }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/orders/:orderId', tool: 'soul-trade.automato.orders.update', mapInput: ({ params, body }) => ({ name: params.name, orderId: params.orderId, ...(body as object ?? {}) }) }),
    route({ method: 'DELETE', path: '/trade/bots/:name/automato/orders/:orderId', tool: 'soul-trade.automato.orders.remove', mapInput: ({ params }) => ({ name: params.name, orderId: params.orderId }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/orders/:orderId/arm', tool: 'soul-trade.automato.orders.arm', mapInput: ({ params }) => ({ name: params.name, orderId: params.orderId }) }),
    route({ method: 'POST', path: '/trade/bots/:name/automato/orders/:orderId/disarm', tool: 'soul-trade.automato.orders.disarm', mapInput: ({ params }) => ({ name: params.name, orderId: params.orderId }) }),
    route({ method: 'GET', path: '/trade/analytics', tool: 'soul-trade.analytics.org', mapInput: () => ({}) }),
    route({ method: 'POST', path: '/trade/backtest', tool: 'soul-trade.backtest.run', mapInput: ({ body }) => body }),
    route({ method: 'POST', path: '/trade/walkforward', tool: 'soul-trade.walkforward.run', mapInput: ({ body }) => body }),
    route({ method: 'GET', path: '/trade/bots/:name/recall', tool: 'soul-trade.memory.recall', mapInput: ({ params, query }) => ({ name: params.name, query: query.query ?? '', ...(query.limit ? { limit: parseInt(query.limit, 10) } : {}) }) }),
  ];
}
