import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import * as n from './schema.js';
import { createNotification, listNotifications, markAllRead } from './service.js';
function assert(c:unknown,m:string){if(!c){console.error('  ✗',m);process.exitCode=1;throw new Error(m);}console.log('  ✓',m);}
const ORG='aaaaaaaa-0000-0000-0000-000000000001',U='11111111-0000-0000-0000-000000000001';
const client=new PGlite();
await client.exec(readFileSync(new URL('../migrations/0001_notification.sql',import.meta.url),'utf8'));
const db=drizzle(client,{schema:n}) as any;
await createNotification(db,ORG,U,{kind:'chat',title:'Tin mới'});
assert((await listNotifications(db,ORG,U,true)).length===1,'1 unread');
await markAllRead(db,ORG,U);
assert((await listNotifications(db,ORG,U,true)).length===0,'mark-all read');
assert((await listNotifications(db,'bbbbbbbb-0000-0000-0000-000000000002',U)).length===0,'tenant isolation');
console.log('[notification] PASSED');
