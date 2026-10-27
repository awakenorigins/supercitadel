// Tạo org "Joli Poli" SẠCH cho beta: owner user + token (argv) + full module active + Om, KHÔNG dữ liệu test.
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const TOKEN = ''; // KHÔNG hardcode token — truyền qua argv[2]
const token = process.argv[2] || TOKEN; // phân biệt hoa thường (schema mới 8-24 ký tự)
if (!/^[A-Za-z0-9]{8,24}$/.test(token)) { console.error(`Token phải 8-24 ký tự A-Za-z0-9, nhận: "${token}" (${token.length} ký tự)`); process.exit(1); }

const url = process.env.DATABASE_URL || 'postgres://citadellab:citadellab@127.0.0.1:5432/citadellab';
const sql = postgres(url, { max: 1 });
const H = (t) => hash(t, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

try {
  // idempotent: nếu org đã tồn tại thì dừng
  const existed = await sql`SELECT id FROM orgs WHERE slug='joli-poli'`;
  if (existed.length) { console.log('Org joli-poli đã tồn tại:', existed[0].id, '— không tạo lại.'); process.exit(0); }

  const [org] = await sql`INSERT INTO orgs (name, slug, logo_emoji) VALUES ('Joli Poli','joli-poli','sparkles') RETURNING id`;
  const [owner] = await sql`INSERT INTO users (org_id, display_name, role, avatar_color) VALUES (${org.id},'Joli Poli','owner','violet') RETURNING id`;
  await sql`INSERT INTO tokens (org_id, user_id, token_prefix, token_hash, role) VALUES (${org.id},${owner.id},${token.slice(0,4)},${await H(token)},'owner')`;

  // Om khởi tạo để mua/thuê module thoải mái
  try { await sql`INSERT INTO om_ledger (org_id, delta, reason, module) VALUES (${org.id},99999,'Cấp Om khởi tạo beta Joli Poli','om')`; } catch (e) { console.log('om_ledger skip:', e.message); }

  // Bật full module (active + purchased) — KHÔNG seed dữ liệu nghiệp vụ nào.
  const MODULES = ['core','accounting','crm','inventory','hr','chat','notification','om','ke-toan-10a','soul-manager','soul-inventory','soul-sale','soul-wallet','soul-trade','soul-restaurant']; // V11: 'core' cần cho report.summary của Tiểu Tâm
  for (const m of MODULES) {
    try { await sql`INSERT INTO org_modules (org_id, module_id, status, purchased, activated_at) VALUES (${org.id},${m},'active',true,now()) ON CONFLICT DO NOTHING`; }
    catch (e) { console.log('module', m, 'skip:', e.message); }
  }

  // Soul state Tiểu Tâm: engine mặc định opus-4.6
  try { await sql`INSERT INTO tt_soul_state (org_id, user_id, engine) VALUES (${org.id},${owner.id},'opus-4.6') ON CONFLICT DO NOTHING`; } catch (e) { console.log('tt_soul_state skip:', e.message); }

  console.log('✓ Org Joli Poli tạo xong SẠCH:');
  console.log('  org_id:', org.id);
  console.log('  owner user_id:', owner.id);
  console.log('  token:', token);
  console.log('  modules active:', MODULES.join(', '));
} finally { await sql.end(); }
