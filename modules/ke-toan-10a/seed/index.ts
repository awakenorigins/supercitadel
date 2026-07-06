/**
 * CLI seed hệ thống tài khoản cho một org.
 *
 *   KETOAN10A_SEED_ORG=<uuid> npm run db:seed
 *
 * Logic thật nằm ở src/seed.ts (để export được từ package). File này chỉ là CLI.
 */
import { seedChartOfAccounts } from "../src/seed.js";

const orgId = process.env.KETOAN10A_SEED_ORG;
if (!orgId) {
  console.error("[ke-toan-10a] Cần đặt KETOAN10A_SEED_ORG=<uuid org> để seed.");
  process.exit(1);
}

seedChartOfAccounts(orgId)
  .then((n) => {
    console.log(`[ke-toan-10a] Đã seed ${n} tài khoản cho org ${orgId}.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("[ke-toan-10a] Seed lỗi:", err);
    process.exit(1);
  });
