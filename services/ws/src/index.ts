import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { jwtVerify } from 'jose';
import type { JwtPayload, WsEvent } from '@citadel/core';
import { createBus, type EventBus } from './bus.js';

interface Client { ws: WebSocket; orgId: string; userId: string; unsub: () => void; }

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return new TextEncoder().encode(s);
}
async function authFromUrl(url: string | undefined): Promise<JwtPayload> {
  const token = new URL(url ?? '', 'ws://x').searchParams.get('token');
  if (!token) throw new Error('missing token');
  const { payload } = await jwtVerify(token, secret());
  return { sub: String(payload.sub), orgId: String(payload.orgId), role: payload.role as JwtPayload['role'] };
}

export function startWsServer(port = Number(process.env.PORT ?? 3002), bus: EventBus = createBus()) {
  const clients = new Set<Client>();

  // HTTP server hosts both WS upgrade and an internal /publish endpoint (api → ws bridge).
  const http = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/internal/publish') {
      let buf = '';
      req.on('data', (d) => (buf += d));
      req.on('end', async () => {
        try {
          const ev: WsEvent = JSON.parse(buf);
          await bus.publish(ev.orgId, ev);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch (e) {
          res.writeHead(400); res.end('{"ok":false}');
        }
      });
      return;
    }
    if (req.url === '/health') { res.writeHead(200); res.end('{"ok":true,"service":"citadel-ws"}'); return; }
    res.writeHead(404); res.end();
  });

  const wss = new WebSocketServer({ server: http });
  wss.on('connection', async (ws, req) => {
    let auth: JwtPayload;
    try { auth = await authFromUrl(req.url); }
    catch { ws.send(JSON.stringify({ type: 'error', payload: 'unauthorized' })); ws.close(1008, 'unauthorized'); return; }
    const unsub = bus.subscribe(auth.orgId, (ev) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ev)); });
    const client: Client = { ws, orgId: auth.orgId, userId: auth.sub, unsub };
    clients.add(client);
    ws.send(JSON.stringify({ type: 'system', payload: { connected: true, orgId: auth.orgId } }));
    ws.on('close', () => { unsub(); clients.delete(client); });
  });

  http.listen(port, () => console.log(`[ws] listening on :${port} (ws + /internal/publish)`));
  return {
    wss, bus, http,
    emit: (ev: WsEvent) => bus.publish(ev.orgId, ev),
    close: () => new Promise<void>((r) => { wss.close(); http.close(() => r()); }),
    clientCount: () => clients.size,
  };
}
if (import.meta.url === `file://${process.argv[1]}`) { startWsServer(); }
