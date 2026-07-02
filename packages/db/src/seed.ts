// Seed v8 — org demo + 3 token (SUPER_ADMIN full quyền, OWNER, MANAGER) + 99999 Om + dữ liệu mẫu.
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function genToken() { let o = ''; for (let i = 0; i < 13; i++) o += ALPHABET[randomInt(ALPHABET.length)]; return o; }
const H = (t: string) => hash(t, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = postgres(url, { max: 1 });
  try {
    const [org] = await sql`INSERT INTO orgs (name, slug, logo_emoji) VALUES ('Cà Phê Nhà Mình','ca-phe-nha-minh','coffee') RETURNING id`;

    // 3 user · 3 role
    const [boss]  = await sql`INSERT INTO users (org_id, display_name, role, avatar_color) VALUES (${org.id},'Super Admin','super_admin','violet') RETURNING id`;
    const [minh]  = await sql`INSERT INTO users (org_id, display_name, role, avatar_color) VALUES (${org.id},'Minh (Chủ quán)','owner','mint') RETURNING id`;
    const [lan]   = await sql`INSERT INTO users (org_id, display_name, role, avatar_color) VALUES (${org.id},'Lan Phạm','manager','amber') RETURNING id`;

    const tokBoss = process.env.CITADEL_SUPER_ADMIN_TOKEN || 'V8SUPERADMIN1';
    const tokMinh = process.env.CITADEL_OWNER_TOKEN || 'V8OWNERFULL01';
    const tokLan = process.env.CITADEL_MANAGER_TOKEN || 'V8MANAGER0001';
    await sql`INSERT INTO tokens (org_id, user_id, token_prefix, token_hash, role) VALUES (${org.id},${boss.id},${tokBoss.slice(0,4)},${await H(tokBoss)},'super_admin')`;
    await sql`INSERT INTO tokens (org_id, user_id, token_prefix, token_hash, role) VALUES (${org.id},${minh.id},${tokMinh.slice(0,4)},${await H(tokMinh)},'owner')`;
    await sql`INSERT INTO tokens (org_id, user_id, token_prefix, token_hash, role) VALUES (${org.id},${lan.id},${tokLan.slice(0,4)},${await H(tokLan)},'manager')`;

    // Ví Om: 99999 (đủ mua mọi module thoải mái)
    try { await sql`INSERT INTO om_ledger (org_id, delta, reason, module) VALUES (${org.id},99999,'Cấp Om khởi tạo (admin)','om')`; } catch {}

    // Chat demo
    try {
      const [room] = await sql`INSERT INTO chat_rooms (org_id, name, is_group, created_by) VALUES (${org.id},'Ca Tối · Team',true,${minh.id}) RETURNING id`;
      for (const u of [boss.id, minh.id, lan.id]) await sql`INSERT INTO chat_room_members (room_id, user_id, org_id) VALUES (${room.id},${u},${org.id})`;
      await sql`INSERT INTO chat_messages (room_id, org_id, sender_id, body) VALUES (${room.id},${org.id},${lan.id},'Chào sếp, ca tối nay em chuẩn bị sẵn rồi ạ')`;
    } catch { console.log('[seed] chat tables missing (skip)'); }

    // CRM demo
    try {
      const [hoa] = await sql`INSERT INTO crm_contacts (org_id, name, tag, phone) VALUES (${org.id},'Cô Hoa','vip','0901234567') RETURNING id`;
      await sql`INSERT INTO crm_deals (org_id, contact_id, title, value_vnd, stage) VALUES (${org.id},${hoa.id},'Hợp đồng Cô Hoa',22000000,'negotiation')`;
      await sql`INSERT INTO crm_deals (org_id, title, value_vnd, stage) VALUES (${org.id},'Anh Tú',15200000,'quote')`;
      await sql`INSERT INTO crm_deals (org_id, title, value_vnd, stage) VALUES (${org.id},'Chị Mai',10000000,'lead')`;
    } catch { console.log('[seed] crm tables missing (skip)'); }

    // Kho demo
    try {
      await sql`INSERT INTO inventory_items (org_id, name, unit, qty, low_threshold) VALUES (${org.id},'Sữa tươi','hộp',10,12)`;
      await sql`INSERT INTO inventory_items (org_id, name, unit, qty, low_threshold) VALUES (${org.id},'Cà phê hạt','kg',30,5)`;
      await sql`INSERT INTO inventory_items (org_id, name, unit, qty, low_threshold) VALUES (${org.id},'Trà ô long','kg',4,5)`;
    } catch { console.log('[seed] inventory tables missing (skip)'); }

    // Ca demo (hôm nay)
    try {
      const today = new Date().toISOString().slice(0, 10);
      await sql`INSERT INTO hr_shifts (org_id, name, shift_date, start_time, end_time, staff) VALUES (${org.id},'Ca Sáng',${today},'07:00','12:00','Lan Phạm, Hùng Trần')`;
      await sql`INSERT INTO hr_shifts (org_id, name, shift_date, start_time, end_time, staff) VALUES (${org.id},'Ca Tối',${today},'17:00','22:00','Lan Phạm, Tú Lê, Mai Anh')`;
    } catch { console.log('[seed] hr tables missing (skip)'); }

    // HR v2 demo (fork hrms): nhân viên + loại phép + cấp phép + 1 đơn chờ duyệt + chấm công
    try {
      const [eLan] = await sql`INSERT INTO hr_employees (org_id, full_name, role_title, phone, joined_date) VALUES (${org.id},'Lan Phạm','Trưởng ca','0901234567','2024-03-01') RETURNING id`;
      const [eTu]  = await sql`INSERT INTO hr_employees (org_id, full_name, role_title, joined_date) VALUES (${org.id},'Tú Lê','Pha chế','2025-01-15') RETURNING id`;
      await sql`INSERT INTO hr_employees (org_id, full_name, role_title) VALUES (${org.id},'Mai Anh','Phục vụ')`;
      const [pNam] = await sql`INSERT INTO hr_leave_types (org_id, name, days_per_year, is_paid) VALUES (${org.id},'Phép năm',12,true) RETURNING id`;
      await sql`INSERT INTO hr_leave_types (org_id, name, days_per_year, is_paid) VALUES (${org.id},'Nghỉ ốm',30,true)`;
      await sql`INSERT INTO hr_leave_types (org_id, name, days_per_year, is_paid) VALUES (${org.id},'Không lương',365,false)`;
      const yr = new Date().getUTCFullYear();
      await sql`INSERT INTO hr_leave_allocations (org_id, employee_id, leave_type_id, year, allocated_days) VALUES (${org.id},${eLan.id},${pNam.id},${yr},12)`;
      await sql`INSERT INTO hr_leave_allocations (org_id, employee_id, leave_type_id, year, allocated_days) VALUES (${org.id},${eTu.id},${pNam.id},${yr},12)`;
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const nextWeekEnd = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
      await sql`INSERT INTO hr_leave_applications (org_id, employee_id, leave_type_id, from_date, to_date, total_days, reason, status) VALUES (${org.id},${eTu.id},${pNam.id},${nextWeek},${nextWeekEnd},3,'Về quê','open')`;
      const today = new Date().toISOString().slice(0, 10);
      await sql`INSERT INTO hr_attendance (org_id, employee_id, att_date, check_in, status) VALUES (${org.id},${eLan.id},${today},now(),'present')`;
    } catch (e) { console.log('[seed] hr v2 tables missing (skip)', e); }

    // Notifications demo
    try {
      for (const u of [boss.id, minh.id]) {
        await sql`INSERT INTO notifications (org_id, user_id, kind, title, body_text) VALUES (${org.id},${u},'chat','Lan Phạm nhắn trong Ca Tối · Team','Dạ em xếp thêm người ạ')`;
        await sql`INSERT INTO notifications (org_id, user_id, kind, title) VALUES (${org.id},${u},'crm','Deal Cô Hoa 5 ngày chưa cập nhật')`;
        await sql`INSERT INTO notifications (org_id, user_id, kind, title) VALUES (${org.id},${u},'inventory','Sữa tươi sắp hết — còn 10 hộp')`;
      }
    } catch { console.log('[seed] notification tables missing (skip)'); }

    console.log('\n════════════ SEED v8 DONE ════════════');
    console.log('Org: Cà Phê Nhà Mình · Ví: 99.999 Om');
    console.log('┌──────────────┬───────────────┬──────────────────────────┐');
    console.log(`│ SUPER_ADMIN  │ ${tokBoss} │ full quyền (rank 100)    │`);
    console.log(`│ OWNER        │ ${tokMinh} │ chủ quán                 │`);
    console.log(`│ MANAGER      │ ${tokLan} │ quản lý                  │`);
    console.log('└──────────────┴───────────────┴──────────────────────────┘');
    console.log('→ Module trả phí (CRM/Kho/Nhân sự) chưa bật — vào Cửa hàng Module mua bằng Om.');
    console.log('═══════════════════════════════════════\n');
  } finally { await sql.end(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
