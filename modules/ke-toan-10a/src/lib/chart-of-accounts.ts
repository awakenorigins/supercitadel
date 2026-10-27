import type { AccountType, NormalBalance } from "../types/index.js";

export interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  parentCode?: string;
  isPostable: boolean;
  isSystem: boolean;
}

/**
 * Hệ thống tài khoản kế toán chuẩn theo Thông tư 133/2016/TT-BTC
 * (áp dụng cho doanh nghiệp nhỏ và vừa).
 *
 * Bộ mặc định này đủ dùng cho phần lớn SME Việt Nam. Doanh nghiệp có thể
 * thêm/bớt tài khoản chi tiết sau. Các tài khoản đối ứng (contra) như 214
 * chưa đưa vào bản v1 để giữ báo cáo cân đối đơn giản, chính xác.
 */
export const CHART_TT133: SeedAccount[] = [
  // ---------------- TÀI SẢN ----------------
  { code: "111", name: "Tiền mặt", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "112", name: "Tiền gửi ngân hàng", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "131", name: "Phải thu của khách hàng", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "133", name: "Thuế GTGT được khấu trừ", type: "ASSET", normalBalance: "DEBIT", isPostable: false, isSystem: true },
  { code: "1331", name: "Thuế GTGT được khấu trừ của HHDV", type: "ASSET", normalBalance: "DEBIT", parentCode: "133", isPostable: true, isSystem: true },
  { code: "138", name: "Phải thu khác", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "141", name: "Tạm ứng", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "152", name: "Nguyên liệu, vật liệu", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "153", name: "Công cụ, dụng cụ", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "154", name: "Chi phí SXKD dở dang", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "155", name: "Thành phẩm", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "156", name: "Hàng hóa", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "211", name: "Tài sản cố định", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "214", name: "Hao mòn tài sản cố định", type: "ASSET", normalBalance: "CREDIT", isPostable: true, isSystem: false },

  // ---------------- NỢ PHẢI TRẢ ----------------
  { code: "331", name: "Phải trả cho người bán", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "333", name: "Thuế và các khoản phải nộp Nhà nước", type: "LIABILITY", normalBalance: "CREDIT", isPostable: false, isSystem: true },
  { code: "3331", name: "Thuế GTGT phải nộp", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: true },
  { code: "3334", name: "Thuế thu nhập doanh nghiệp", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "334", name: "Phải trả người lao động", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "338", name: "Phải trả, phải nộp khác", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "341", name: "Vay và nợ thuê tài chính", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },

  // ---------------- VỐN CHỦ SỞ HỮU ----------------
  { code: "411", name: "Vốn đầu tư của chủ sở hữu", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "421", name: "Lợi nhuận sau thuế chưa phân phối", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },

  // ---------------- DOANH THU ----------------
  { code: "511", name: "Doanh thu bán hàng và cung cấp dịch vụ", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "515", name: "Doanh thu hoạt động tài chính", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "711", name: "Thu nhập khác", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: true },

  // ---------------- CHI PHÍ ----------------
  { code: "632", name: "Giá vốn hàng bán", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "635", name: "Chi phí tài chính", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "641", name: "Chi phí bán hàng", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "642", name: "Chi phí quản lý kinh doanh", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "811", name: "Chi phí khác", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "821", name: "Chi phí thuế thu nhập doanh nghiệp", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "911", name: "Xác định kết quả kinh doanh", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
];


/**
 * Hệ thống tài khoản theo Thông tư 200/2014/TT-BTC (doanh nghiệp lớn) — bản
 * rút gọn ~52 TK phổ biến nhất, là TẬP CHA của mọi mã mặc định mà các service
 * trong module sử dụng (111/112/131/1331/141/211/214/331/3331/411/421/511/
 * 515/632/635/641/642/711/811/821/911...). DN cần chi tiết hơn có thể nhập
 * thêm qua CSV hoặc chart tùy biến JSON.
 */
export const CHART_TT200: SeedAccount[] = [
  // ---------------- TÀI SẢN ----------------
  { code: "111", name: "Tiền mặt", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "112", name: "Tiền gửi ngân hàng", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "113", name: "Tiền đang chuyển", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "121", name: "Chứng khoán kinh doanh", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "128", name: "Đầu tư nắm giữ đến ngày đáo hạn", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "131", name: "Phải thu của khách hàng", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "133", name: "Thuế GTGT được khấu trừ", type: "ASSET", normalBalance: "DEBIT", isPostable: false, isSystem: true },
  { code: "1331", name: "Thuế GTGT được khấu trừ của HHDV", type: "ASSET", normalBalance: "DEBIT", parentCode: "133", isPostable: true, isSystem: true },
  { code: "1332", name: "Thuế GTGT được khấu trừ của TSCĐ", type: "ASSET", normalBalance: "DEBIT", parentCode: "133", isPostable: true, isSystem: false },
  { code: "136", name: "Phải thu nội bộ", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "138", name: "Phải thu khác", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "141", name: "Tạm ứng", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "151", name: "Hàng mua đang đi đường", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "152", name: "Nguyên liệu, vật liệu", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "153", name: "Công cụ, dụng cụ", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "154", name: "Chi phí SXKD dở dang", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "155", name: "Thành phẩm", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "156", name: "Hàng hoá", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "157", name: "Hàng gửi đi bán", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "211", name: "Tài sản cố định hữu hình", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "213", name: "Tài sản cố định vô hình", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "214", name: "Hao mòn tài sản cố định", type: "ASSET", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "241", name: "Xây dựng cơ bản dở dang", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "242", name: "Chi phí trả trước", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  // ---------------- NỢ PHẢI TRẢ ----------------
  { code: "331", name: "Phải trả cho người bán", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "333", name: "Thuế và các khoản phải nộp Nhà nước", type: "LIABILITY", normalBalance: "CREDIT", isPostable: false, isSystem: true },
  { code: "3331", name: "Thuế GTGT phải nộp", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: true },
  { code: "3334", name: "Thuế TNDN phải nộp", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "334", name: "Phải trả người lao động", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "335", name: "Chi phí phải trả", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "338", name: "Phải trả, phải nộp khác", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "341", name: "Vay và nợ thuê tài chính", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  // ---------------- VỐN CHỦ SỞ HỮU ----------------
  { code: "411", name: "Vốn đầu tư của chủ sở hữu", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "418", name: "Các quỹ thuộc vốn chủ sở hữu", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "421", name: "Lợi nhuận sau thuế chưa phân phối", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  // ---------------- DOANH THU ----------------
  { code: "511", name: "Doanh thu bán hàng và cung cấp dịch vụ", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "515", name: "Doanh thu hoạt động tài chính", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "521", name: "Các khoản giảm trừ doanh thu", type: "INCOME", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "711", name: "Thu nhập khác", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  // ---------------- CHI PHÍ ----------------
  { code: "611", name: "Mua hàng", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "621", name: "Chi phí nguyên liệu, vật liệu trực tiếp", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "622", name: "Chi phí nhân công trực tiếp", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "627", name: "Chi phí sản xuất chung", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "632", name: "Giá vốn hàng bán", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "635", name: "Chi phí tài chính", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "641", name: "Chi phí bán hàng", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "642", name: "Chi phí quản lý doanh nghiệp", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "811", name: "Chi phí khác", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "821", name: "Chi phí thuế TNDN", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  // ---------------- XÁC ĐỊNH KQKD ----------------
  { code: "911", name: "Xác định kết quả kinh doanh", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
];

export type ChartStandard = "TT133" | "TT200";

/** Lấy bộ chart theo chuẩn. */
export function chartOf(standard: ChartStandard): SeedAccount[] {
  return standard === "TT200" ? CHART_TT200 : CHART_TT133;
}

/** Alias tương thích ngược (mặc định TT133). */
export const CHART_OF_ACCOUNTS = CHART_TT133;
