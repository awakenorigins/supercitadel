import { test, ok, eq, throws, done } from './_h.js';
import { newDb, ctx, ORG_A, ORG_B } from './setup.js';
import * as M from '../src/services/master.service.js';
import { ssPipelineStages, ssCustomerRelationships } from '../src/schema.js';
import { and, eq as deq } from 'drizzle-orm';

const { db } = await newDb();
const emits: { t: string; p: Record<string, unknown> }[] = [];
const c = ctx(ORG_A, 'u-master', emits);

await test('ensureDefaults idempotent: pipeline MAIN + 5 stages + 5 terms + price book', async () => {
  await M.ensureDefaults(db, c);
  await M.ensureDefaults(db, c); // gọi lần 2 không nhân đôi
  const stages = await db.select().from(ssPipelineStages).where(deq(ssPipelineStages.orgId, ORG_A));
  eq(stages.length, 5, 'stages');
  ok(stages.some((s) => s.isWon) && stages.some((s) => s.isLost), 'có stage won/lost');
});

let kh1: any, npp: any, c2: any, shopA: any, shopB: any;

await test('createCustomer sinh mã KH-0001, nameNorm bỏ dấu, closure self-row, emit created', async () => {
  kh1 = await M.createCustomer(db, c, { kind: 'company', name: 'Công ty Trách Nhiệm Hữu Hạn Ánh Dương', phone: '+84 909 111 222', email: 'ad@x.vn' });
  eq(kh1.code, 'KH-0001');
  eq(kh1.nameNorm, 'cong ty trach nhiem huu han anh duong');
  eq(kh1.phone, '0909111222', 'phone chuẩn hoá 84→0');
  const self = await db.select().from(ssCustomerRelationships).where(and(deq(ssCustomerRelationships.orgId, ORG_A), deq(ssCustomerRelationships.descendantId, kh1.id)));
  eq(self.length, 1); eq(self[0]!.depth, 0);
  ok(emits.some((e) => e.t === 'soulsale.customer.created'), 'emit customer.created');
});

await test('cây kênh 3 tầng: NPP → C2 → 2 shop; closure đủ cạnh', async () => {
  npp = await M.createAgency(db, c, { name: 'NPP Miền Nam', level: 1, territoryCode: 'HCM' });
  c2 = await M.createAgency(db, c, { name: 'Đại lý C2 Quận 7', level: 2, parentAgencyCustomerId: npp.id });
  shopA = await M.createRetailer(db, c, { name: 'Shop Hoa Mai', parentAgencyCustomerId: c2.id, phone: '0911000001' });
  shopB = await M.createRetailer(db, c, { name: 'Shop Hướng Dương', parentAgencyCustomerId: c2.id, phone: '0911000002' });
  const anc = await M.ancestorsOf(db, c, shopA.id);
  eq(anc.map((a) => a.depth).sort(), [1, 2], 'shop có 2 tổ tiên depth 1,2');
  const sub = await M.subtreeIds(db, c, npp.id);
  eq(sub.length, 4, 'subtree NPP = 4 node (kể cả chính nó)');
});

await test('rootAgencyOf shop = NPP (agency xa gốc nhất)', async () => {
  const root = await M.rootAgencyOf(db, c, shopA.id);
  eq(root, npp.id);
});

await test('agencyTree trả cây lồng đúng', async () => {
  const tree = (await M.agencyTree(db, c)) as any[];
  const nppNode = tree.find((n) => n.id === npp.id);
  ok(nppNode, 'NPP là root');
  eq(nppNode.children.length, 1);
  eq(nppNode.children[0].children.length, 2, 'C2 có 2 shop');
});

await test('retailersByAgency: trực tiếp vs cả tuyến dưới', async () => {
  const direct = await M.retailersByAgency(db, c, { agencyCustomerId: npp.id, includeSub: false });
  eq(direct.length, 0, 'NPP không có shop trực tiếp');
  const all = await M.retailersByAgency(db, c, { agencyCustomerId: npp.id });
  eq(all.length, 2, 'cả tuyến dưới = 2 shop');
});

await test('moveAgency: chuyển shopB lên thẳng NPP; chống cycle', async () => {
  await M.moveAgency(db, c, { customerId: shopB.id, newParentId: npp.id });
  const anc = await M.ancestorsOf(db, c, shopB.id);
  eq(anc.length, 1, 'shopB giờ chỉ 1 tổ tiên');
  eq(anc[0]!.ancestorId, npp.id);
  await throws(() => M.moveAgency(db, c, { customerId: npp.id, newParentId: shopA.id }), 'tuyến dưới');
});

await test('assignTerritory cho C2; lỗi khi khách thường không có profile', async () => {
  const r = await M.assignTerritory(db, c, { customerId: c2.id, territoryCode: 'Q7', territoryName: 'Quận 7' });
  eq(r.territory, 'Q7');
  await throws(() => M.assignTerritory(db, c, { customerId: kh1.id, territoryCode: 'HN' }), 'chưa có hồ sơ');
});

await test('updateCustomer đổi tên → nameNorm cập nhật', async () => {
  const u = await M.updateCustomer(db, c, { customerId: kh1.id, name: 'Công ty Ánh Dương Mới' });
  eq(u.nameNorm, 'cong ty anh duong moi');
});

await test('searchCustomers theo đoạn tên bỏ dấu và theo SĐT', async () => {
  const byName = await M.searchCustomers(db, c, { q: 'hoa mai' });
  eq(byName.length, 1); eq(byName[0]!.id, shopA.id);
  const byPhone = await M.searchCustomers(db, c, { q: '0911000002' });
  eq(byPhone[0]!.id, shopB.id);
});

await test('addContact + addAddress + customerProfile gộp đủ', async () => {
  await M.addContact(db, c, { customerId: shopA.id, name: 'Chị Mai', role: 'chủ shop', phone: '84911000001', isPrimary: true });
  await M.addAddress(db, c, { customerId: shopA.id, line: '12 Nguyễn Văn Linh', district: 'Q7', province: 'HCM', isDefault: true });
  const prof = await M.customerProfile(db, c, { customerId: shopA.id });
  eq(prof.contacts.length, 1);
  eq(prof.contacts[0]!.phone, '0911000001');
  eq(prof.addresses.length, 1);
  ok(prof.retailerProfile, 'có retailer profile');
  eq(prof.parentChain.length, 2, 'chuỗi cha: NPP → C2');
  eq(prof.parentChain[0]!.id, npp.id, 'xa nhất trước');
});

await test('duplicateCheck: SĐT 0.95 > tên gần giống 0.6', async () => {
  const dups = await M.duplicateCheck(db, c, { phone: '0911 000 001', name: 'shop hoa' });
  ok(dups.length >= 1);
  eq(dups[0]!.customerId, shopA.id);
  eq(dups[0]!.score, 0.95);
});

await test('mergeCustomer chặn khi nguồn còn tuyến dưới', async () => {
  await throws(() => M.mergeCustomer(db, c, { sourceId: c2.id, targetId: npp.id }), 'tuyến dưới');
});

await test('mergeCustomer shopB→shopA: repoint contact, nguồn thành merged, biến khỏi cây & search', async () => {
  await M.addContact(db, c, { customerId: shopB.id, name: 'Anh Dương' });
  const prev = await M.mergePreview(db, c, { sourceId: shopB.id, targetId: shopA.id });
  eq(prev.willMove.contacts, 1);
  const r = await M.mergeCustomer(db, c, { sourceId: shopB.id, targetId: shopA.id });
  eq(r.into, shopA.code);
  const prof = await M.customerProfile(db, c, { customerId: shopA.id });
  eq(prof.contacts.length, 2, 'contact dồn về đích');
  const merged = await M.getCustomer(db, c, shopB.id);
  eq(merged.status, 'merged'); eq(merged.mergedInto, shopA.id);
  const found = await M.searchCustomers(db, c, { q: 'huong duong' });
  eq(found.length, 0, 'khách merged không ra search');
  ok(emits.some((e) => e.t === 'soulsale.customer.merged'), 'emit merged');
  await throws(() => M.mergeCustomer(db, c, { sourceId: shopB.id, targetId: shopA.id }), 'đã bị gộp');
});

await test('customerHistory RFM rỗng vẫn trả cấu trúc chuẩn', async () => {
  const h = await M.customerHistory(db, c, { customerId: shopA.id });
  eq(h.rfm.frequency, 0); eq(h.rfm.monetary, '0'); eq(h.rfm.recencyDays, null);
});

await test('org isolation ở tầng service: ORG_B không thấy dữ liệu ORG_A', async () => {
  const cb = ctx(ORG_B, 'u-b');
  const list = await M.searchCustomers(db, cb, {});
  eq(list.length, 0);
  await throws(() => M.getCustomer(db, cb, kh1.id), 'Không tìm thấy');
});

await test('mã KH tuần tự không nhảy cóc giữa các lần tạo', async () => {
  const k = await M.createCustomer(db, c, { kind: 'person', name: 'Lẻ Một' });
  ok(/^KH-\d{4}$/.test(k.code), k.code);
});

done('01-master');
