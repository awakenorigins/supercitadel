import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { schema, orgs, users, outboxEvents } from '@citadel/db';
import { emitEvent } from '@citadel/core';
import { dispatchOutboxOnce, subscribeOutbox, registerBuiltinOutboxSubscribers } from './outbox.js';
import { notifications } from '@citadel/module-notification/server/schema.js';
import { loadModuleManifests, wireManifestEventSubscribers } from './modules/loader.js';
import { join } from 'node:path';

const client = new PGlite();
await client.exec(`CREATE TYPE role AS ENUM ('super_admin','owner','manager','staff');
CREATE TYPE avatar_color AS ENUM ('mint','violet','amber','rose','sky');
CREATE TABLE orgs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL, slug varchar(60) NOT NULL UNIQUE, logo_emoji varchar(16), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, display_name varchar(80) NOT NULL, role role NOT NULL DEFAULT 'staff', avatar_color avatar_color NOT NULL DEFAULT 'mint', email varchar(160), phone varchar(24), security_level int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE outbox_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, topic varchar(64) NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), dispatched_at timestamptz NULL, attempts int NOT NULL DEFAULT 0, last_error text NULL);
CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL, kind varchar(40) NOT NULL, title varchar(160) NOT NULL, body_text text, link varchar(200), read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());`);
const db = drizzle(client, { schema }) as any;
(globalThis as any).__citadelOutboxEnabled = true;
(globalThis as any).__citadelOutboxEventsTable = outboxEvents;
const [org] = await db.insert(orgs).values({ name:'Org', slug:'org' }).returning();
const [org2] = await db.insert(orgs).values({ name:'Org2', slug:'org2' }).returning();
const [user] = await db.insert(users).values({ orgId: org.id, displayName:'Owner', role:'owner' }).returning();

await assert.rejects(() => emitEvent(db, { orgId: org.id, topic:'bad', payload:{} }));
await db.transaction(async (tx:any) => { await emitEvent(tx, { orgId: org.id, topic:'test.entity.rollback', payload:{a:1} }); throw new Error('rollback'); }).catch(()=>{});
assert.equal((await db.select().from(outboxEvents)).length, 0);
await db.transaction(async (tx:any) => { await emitEvent(tx, { orgId: org.id, topic:'test.entity.created', payload:{a:2} }); });
assert.equal((await db.select().from(outboxEvents)).length, 1);

let exact = 0, wild = 0;
subscribeOutbox('test.entity.created', async () => { exact++; });
subscribeOutbox('test.*', async () => { wild++; });
await dispatchOutboxOnce(db);
assert.equal(exact, 1); assert.equal(wild, 1);
assert.ok((await db.select().from(outboxEvents))[0].dispatchedAt);

await db.transaction(async (tx:any) => { await emitEvent(tx, { orgId: org.id, topic:'test.entity.failed', payload:{} }); });
subscribeOutbox('test.entity.failed', async () => { throw new Error('boom'); });
await dispatchOutboxOnce(db);
const failed = (await db.select().from(outboxEvents).where(eq(outboxEvents.topic, 'test.entity.failed')))[0];
assert.equal(failed.attempts, 1); assert.match(failed.lastError, /boom/);

registerBuiltinOutboxSubscribers(db);
await db.transaction(async (tx:any) => { await emitEvent(tx, { orgId: org.id, topic:'accounting.invoice.created', payload:{partyName:'ACME', grandTotal:'123000'} }); });
await dispatchOutboxOnce(db);
const ns = await db.select().from(notifications).where(eq(notifications.userId, user.id));
assert.equal(ns.length, 1); assert.match(ns[0].bodyText ?? '', /ACME/);
await db.transaction(async (tx:any) => { await emitEvent(tx, { orgId: org2.id, topic:'test.entity.created', payload:{} }); });
const all = await db.select().from(outboxEvents);
assert.equal(all.filter((e:any)=>e.orgId===org2.id).length, 1);

const state = loadModuleManifests(join(process.cwd(), '..', '..', 'modules'));
assert.ok(state.loaded.find(m => m.id === 'notification')?.manifest.events?.subscribes?.includes('accounting.invoice.created'));
const before = (await db.select().from(notifications).where(eq(notifications.userId, user.id))).length;
wireManifestEventSubscribers(state);
await db.transaction(async (tx:any) => { await emitEvent(tx, { orgId: org.id, topic:'accounting.invoice.created', payload:{partyName:'ForgeCo', grandTotal:'456000'} }); });
await dispatchOutboxOnce(db);
const after = await db.select().from(notifications).where(eq(notifications.userId, user.id));
assert.ok(after.length >= before + 1);
assert.ok(after.some((n:any) => (n.bodyText ?? '').includes('ForgeCo')));
console.log('[api/v10] PASSED');
