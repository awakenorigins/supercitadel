// Chat module entry — registers tools + exports route builder.
import { toolRegistry } from '@citadel/tieu-tam';
import { searchMessages } from './service.js';

export { buildChatRoutes } from './routes.js';
export { chatSchema } from './schema.js';
export * from './service.js';

/** Register chat tools into the shared Tiểu Tâm registry. Call once at boot with db. */
export function registerChatTools(db: any) {
  toolRegistry.register({
    name: 'chat.search_messages',
    module: 'chat',
    description: 'Tìm tin nhắn trong các phòng của tổ chức',
    requiresPermission: 'chat:read',
    handler: async (input: { query: string }, ctx) => searchMessages(db, ctx.orgId, input.query),
  });
}
