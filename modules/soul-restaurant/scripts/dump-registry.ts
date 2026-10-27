// Dump registry that that audit.mjs dùng — exact data, no regex parsing of TS
import { restoTools } from '../src/tools/index.js';
import { restoIntents } from '../src/intents.js';
import { restoUiCatalog, UI_GROUPS } from '../src/ui-catalog.js';
const out = {
  tools: restoTools.map((t) => ({
    name: t.name, kind: t.kind, permission: t.permission, docs: t.docs,
    sensitive: (t as any).sensitive ?? false, securityLevel: (t as any).securityLevel ?? 1,
    hasSchema: Boolean(t.inputSchema), descLen: t.description.length,
  })),
  intents: restoIntents.map((i) => ({ id: i.id, tool: i.tool, vi: i.patterns_vi.length, ex: i.examples.length })),
  ui: restoUiCatalog.map((c) => ({ tool: c.tool, group: c.group, kind: c.kind, method: c.method, path: c.path, fields: c.fields.length })),
  uiGroups: [...UI_GROUPS],
};
console.log(JSON.stringify(out));
