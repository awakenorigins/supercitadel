/**
 * Bộ test tự viết (không phụ thuộc framework ngoài) cho phần lõi:
 *  - Money: toán tiền tệ BigInt chính xác.
 *  - LedgerService.validateBalance: kiểm tra cân đối ghi kép.
 *
 *   npm test
 */
import * as Money from "../src/lib/money.js";
import { LedgerService } from "../src/services/ledger.service.js";
import {
  UnbalancedEntryError,
  ValidationError,
} from "../src/lib/errors.js";
import { normalBalanceOf } from "../src/services/accounts.service.js";

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function assertEq(actual: unknown, expected: unknown, name: string) {
  const ok = actual === expected;
  if (!ok) {
    console.error(`     kỳ vọng: ${expected}, nhận: ${actual}`);
  }
  assert(ok, name);
}

function assertThrows(fn: () => void, errType: unknown, name: string) {
  try {
    fn();
    assert(false, `${name} (không ném lỗi)`);
  } catch (err) {
    assert(err instanceof (errType as never), name);
  }
}

console.log("\n=== MONEY: cộng/trừ ===");
assertEq(Money.add("100000.00", "50000.00"), "150000.00", "100k + 50k = 150k");
assertEq(Money.sub("100000.00", "30000.00"), "70000.00", "100k - 30k = 70k");
assertEq(Money.sum(["10.50", "20.25", "5.25"]), "36.00", "10.50+20.25+5.25=36");
assertEq(Money.add("0", "0"), "0.00", "0 + 0 = 0");

console.log("\n=== MONEY: không lỗi float ===");
// 0.1 + 0.2 trong float = 0.30000000000000004; ở đây phải chính xác.
assertEq(Money.add("0.10", "0.20"), "0.30", "0.1 + 0.2 = 0.3 (không lỗi float)");
assertEq(
  Money.sum(["0.01", "0.01", "0.01", "0.01", "0.01", "0.01", "0.01", "0.01", "0.01", "0.01"]),
  "0.10",
  "cộng 0.01 mười lần = 0.10",
);

console.log("\n=== MONEY: nhân & thuế ===");
assertEq(Money.multiply("1000000.00", "0.08"), "80000.00", "1tr * 8% = 80k");
assertEq(Money.taxOf("1000000", 8), "80000.00", "taxOf(1tr, 8%) = 80k");
assertEq(Money.taxOf("1000000", 10), "100000.00", "taxOf(1tr, 10%) = 100k");
assertEq(Money.taxOf("333333", 10), "33333.30", "taxOf(333333, 10%) làm tròn đúng");
assertEq(Money.multiply("100.00", "23500"), "2350000.00", "100 * tỷ giá 23500");

console.log("\n=== MONEY: so sánh & tiện ích ===");
assertEq(Money.compare("100.00", "50.00"), 1, "100 > 50");
assertEq(Money.compare("50.00", "100.00"), -1, "50 < 100");
assertEq(Money.compare("100.00", "100.00"), 0, "100 = 100");
assert(Money.isZero("0.00"), "isZero(0)");
assert(Money.isNegative("-5.00"), "isNegative(-5)");
assertEq(Money.abs("-5.00"), "5.00", "abs(-5) = 5");

console.log("\n=== MONEY: format VND ===");
assertEq(Money.formatVND("1500000.00"), "1.500.000 ₫", "format 1.5tr");
assertEq(Money.formatVND("500000.00"), "500.000 ₫", "format 500k");
assertEq(Money.formatVND("0.00"), "0 ₫", "format 0");
assertEq(Money.formatVND("1000000000.00"), "1.000.000.000 ₫", "format 1 tỷ");

console.log("\n=== MONEY: parse đầu vào linh hoạt ===");
assertEq(Money.add("1,000,000", "0"), "1000000.00", "parse có dấu phẩy");
assertEq(Money.fromMinor(Money.toMinor("123.45")), "123.45", "roundtrip 123.45");

console.log("\n=== ACCOUNTS: normalBalance ===");
assertEq(normalBalanceOf("ASSET"), "DEBIT", "Tài sản = Nợ");
assertEq(normalBalanceOf("EXPENSE"), "DEBIT", "Chi phí = Nợ");
assertEq(normalBalanceOf("LIABILITY"), "CREDIT", "Nợ phải trả = Có");
assertEq(normalBalanceOf("EQUITY"), "CREDIT", "Vốn chủ = Có");
assertEq(normalBalanceOf("INCOME"), "CREDIT", "Doanh thu = Có");

console.log("\n=== LEDGER: kiểm tra cân đối ===");
// Bút toán cân: Nợ 111 500k / Có 511 500k.
{
  const r = LedgerService.validateBalance([
    { accountId: "a", debit: "500000" },
    { accountId: "b", credit: "500000" },
  ]);
  assertEq(r.totalDebit, "500000.00", "tổng Nợ = 500k");
  assertEq(r.totalCredit, "500000.00", "tổng Có = 500k");
}
// Bút toán nhiều dòng cân: Nợ 131 1.08tr / Có 511 1tr + Có 3331 80k.
{
  const r = LedgerService.validateBalance([
    { accountId: "a", debit: "1080000" },
    { accountId: "b", credit: "1000000" },
    { accountId: "c", credit: "80000" },
  ]);
  assertEq(r.totalDebit, "1080000.00", "hoá đơn có thuế: Nợ cân");
  assertEq(r.totalCredit, "1080000.00", "hoá đơn có thuế: Có cân");
}

console.log("\n=== LEDGER: bắt lỗi không cân ===");
assertThrows(
  () =>
    LedgerService.validateBalance([
      { accountId: "a", debit: "500000" },
      { accountId: "b", credit: "400000" },
    ]),
  UnbalancedEntryError,
  "chênh lệch Nợ/Có → UnbalancedEntryError",
);
assertThrows(
  () => LedgerService.validateBalance([{ accountId: "a", debit: "500000" }]),
  ValidationError,
  "chỉ 1 dòng → ValidationError",
);
assertThrows(
  () =>
    LedgerService.validateBalance([
      { accountId: "a", debit: "100", credit: "100" },
      { accountId: "b", credit: "100" },
    ]),
  ValidationError,
  "1 dòng vừa Nợ vừa Có → ValidationError",
);
assertThrows(
  () =>
    LedgerService.validateBalance([
      { accountId: "a", debit: "-100" },
      { accountId: "b", credit: "-100" },
    ]),
  ValidationError,
  "số tiền âm → ValidationError",
);

console.log(`\n=== KẾT QUẢ: ${passed} pass, ${failed} fail ===\n`);
if (failed > 0) process.exit(1);
