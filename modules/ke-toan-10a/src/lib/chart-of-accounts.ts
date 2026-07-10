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

/**
 * V12 ⑧ — Hệ thống tài khoản theo Thông tư 99/2025/TT-BTC (hiệu lực 01/01/2026,
 * THAY THẾ TT200/2014; KHÔNG thay TT133 — DNVVN vẫn dùng TT133 hoặc tự chọn lên TT99).
 * Mức ② anh Nắng chốt 10/07/2026: 71 TK cấp 1 + TK cấp 2 phổ biến (~120 TK).
 * Nguồn đối chiếu: danh mục TT99 (luatvietnam/tintucketoan) + form sổ _99 trong MISA SME 2026.
 * Khác TT200: 112 đổi "Tiền gửi không kỳ hạn" · 155 "Sản phẩm" · 242 "Chi phí chờ phân bổ"
 * · 3387 "Doanh thu chờ phân bổ" · BỎ 611 · THÊM 215 tài sản sinh học, 332 phải trả cổ tức,
 * 82112 thuế tối thiểu toàn cầu.
 */
export const CHART_TT99: SeedAccount[] = [
  // ---------------- TÀI SẢN ----------------
  { code: "111", name: "Tiền mặt", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "112", name: "Tiền gửi không kỳ hạn", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "113", name: "Tiền đang chuyển", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "121", name: "Chứng khoán kinh doanh", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "128", name: "Đầu tư nắm giữ đến ngày đáo hạn", type: "ASSET", normalBalance: "DEBIT", isPostable: false, isSystem: false },
  { code: "1281", name: "Tiền gửi có kỳ hạn", type: "ASSET", normalBalance: "DEBIT", parentCode: "128", isPostable: true, isSystem: false },
  { code: "1282", name: "Trái phiếu", type: "ASSET", normalBalance: "DEBIT", parentCode: "128", isPostable: true, isSystem: false },
  { code: "1283", name: "Cho vay", type: "ASSET", normalBalance: "DEBIT", parentCode: "128", isPostable: true, isSystem: false },
  { code: "1288", name: "Các khoản đầu tư khác nắm giữ đến ngày đáo hạn", type: "ASSET", normalBalance: "DEBIT", parentCode: "128", isPostable: true, isSystem: false },
  { code: "131", name: "Phải thu của khách hàng", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "133", name: "Thuế GTGT được khấu trừ", type: "ASSET", normalBalance: "DEBIT", isPostable: false, isSystem: true },
  { code: "1331", name: "Thuế GTGT được khấu trừ của hàng hóa, dịch vụ", type: "ASSET", normalBalance: "DEBIT", parentCode: "133", isPostable: true, isSystem: true },
  { code: "1332", name: "Thuế GTGT được khấu trừ của TSCĐ", type: "ASSET", normalBalance: "DEBIT", parentCode: "133", isPostable: true, isSystem: false },
  { code: "136", name: "Phải thu nội bộ", type: "ASSET", normalBalance: "DEBIT", isPostable: false, isSystem: false },
  { code: "1361", name: "Vốn kinh doanh ở đơn vị trực thuộc", type: "ASSET", normalBalance: "DEBIT", parentCode: "136", isPostable: true, isSystem: false },
  { code: "1362", name: "Phải thu nội bộ về chênh lệch tỷ giá", type: "ASSET", normalBalance: "DEBIT", parentCode: "136", isPostable: true, isSystem: false },
  { code: "1368", name: "Phải thu nội bộ khác", type: "ASSET", normalBalance: "DEBIT", parentCode: "136", isPostable: true, isSystem: false },
  { code: "138", name: "Phải thu khác", type: "ASSET", normalBalance: "DEBIT", isPostable: false, isSystem: false },
  { code: "1381", name: "Tài sản thiếu chờ xử lý", type: "ASSET", normalBalance: "DEBIT", parentCode: "138", isPostable: true, isSystem: false },
  { code: "1388", name: "Phải thu khác", type: "ASSET", normalBalance: "DEBIT", parentCode: "138", isPostable: true, isSystem: false },
  { code: "141", name: "Tạm ứng", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "151", name: "Hàng mua đang đi đường", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "152", name: "Nguyên liệu, vật liệu", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "153", name: "Công cụ, dụng cụ", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "154", name: "Chi phí sản xuất, kinh doanh dở dang", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "155", name: "Sản phẩm", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "156", name: "Hàng hóa", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "157", name: "Hàng gửi đi bán", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "158", name: "Nguyên liệu, vật tư tại kho bảo thuế", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "171", name: "Giao dịch mua, bán lại trái phiếu chính phủ", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "211", name: "Tài sản cố định hữu hình", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "212", name: "Tài sản cố định thuê tài chính", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "213", name: "Tài sản cố định vô hình", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "214", name: "Hao mòn tài sản cố định", type: "ASSET", normalBalance: "CREDIT", isPostable: false, isSystem: false },
  { code: "2141", name: "Hao mòn TSCĐ hữu hình", type: "ASSET", normalBalance: "CREDIT", parentCode: "214", isPostable: true, isSystem: false },
  { code: "2142", name: "Hao mòn TSCĐ thuê tài chính", type: "ASSET", normalBalance: "CREDIT", parentCode: "214", isPostable: true, isSystem: false },
  { code: "2143", name: "Hao mòn TSCĐ vô hình", type: "ASSET", normalBalance: "CREDIT", parentCode: "214", isPostable: true, isSystem: false },
  { code: "2147", name: "Hao mòn BĐSĐT", type: "ASSET", normalBalance: "CREDIT", parentCode: "214", isPostable: true, isSystem: false },
  { code: "215", name: "Tài sản sinh học", type: "ASSET", normalBalance: "DEBIT", isPostable: false, isSystem: false },
  { code: "2151", name: "Súc vật nuôi cho sản phẩm định kỳ", type: "ASSET", normalBalance: "DEBIT", parentCode: "215", isPostable: true, isSystem: false },
  { code: "2152", name: "Súc vật nuôi lấy sản phẩm một lần", type: "ASSET", normalBalance: "DEBIT", parentCode: "215", isPostable: true, isSystem: false },
  { code: "2153", name: "Cây trồng theo mùa vụ hoặc lấy sản phẩm một lần", type: "ASSET", normalBalance: "DEBIT", parentCode: "215", isPostable: true, isSystem: false },
  { code: "217", name: "Bất động sản đầu tư", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "221", name: "Đầu tư vào công ty con", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "222", name: "Đầu tư vào công ty liên doanh, liên kết", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "228", name: "Đầu tư khác", type: "ASSET", normalBalance: "DEBIT", isPostable: false, isSystem: false },
  { code: "2281", name: "Đầu tư góp vốn vào đơn vị khác", type: "ASSET", normalBalance: "DEBIT", parentCode: "228", isPostable: true, isSystem: false },
  { code: "2288", name: "Đầu tư khác", type: "ASSET", normalBalance: "DEBIT", parentCode: "228", isPostable: true, isSystem: false },
  { code: "229", name: "Dự phòng tổn thất tài sản", type: "ASSET", normalBalance: "CREDIT", isPostable: false, isSystem: false },
  { code: "2291", name: "Dự phòng giảm giá chứng khoán kinh doanh", type: "ASSET", normalBalance: "CREDIT", parentCode: "229", isPostable: true, isSystem: false },
  { code: "2292", name: "Dự phòng tổn thất đầu tư vào đơn vị khác", type: "ASSET", normalBalance: "CREDIT", parentCode: "229", isPostable: true, isSystem: false },
  { code: "2293", name: "Dự phòng phải thu khó đòi", type: "ASSET", normalBalance: "CREDIT", parentCode: "229", isPostable: true, isSystem: false },
  { code: "2294", name: "Dự phòng giảm giá hàng tồn kho", type: "ASSET", normalBalance: "CREDIT", parentCode: "229", isPostable: true, isSystem: false },
  { code: "2295", name: "Dự phòng tổn thất tài sản sinh học", type: "ASSET", normalBalance: "CREDIT", parentCode: "229", isPostable: true, isSystem: false },
  { code: "241", name: "Xây dựng cơ bản dở dang", type: "ASSET", normalBalance: "DEBIT", isPostable: false, isSystem: false },
  { code: "2411", name: "Mua sắm TSCĐ", type: "ASSET", normalBalance: "DEBIT", parentCode: "241", isPostable: true, isSystem: false },
  { code: "2412", name: "Xây dựng cơ bản", type: "ASSET", normalBalance: "DEBIT", parentCode: "241", isPostable: true, isSystem: false },
  { code: "2413", name: "Sửa chữa, bảo dưỡng định kỳ TSCĐ", type: "ASSET", normalBalance: "DEBIT", parentCode: "241", isPostable: true, isSystem: false },
  { code: "2414", name: "Nâng cấp, cải tạo TSCĐ", type: "ASSET", normalBalance: "DEBIT", parentCode: "241", isPostable: true, isSystem: false },
  { code: "242", name: "Chi phí chờ phân bổ", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "243", name: "Tài sản thuế thu nhập hoãn lại", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "244", name: "Ký quỹ, ký cược", type: "ASSET", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  // ---------------- NỢ PHẢI TRẢ ----------------
  { code: "331", name: "Phải trả cho người bán", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "332", name: "Phải trả cổ tức, lợi nhuận", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "333", name: "Thuế và các khoản phải nộp Nhà nước", type: "LIABILITY", normalBalance: "CREDIT", isPostable: false, isSystem: true },
  { code: "3331", name: "Thuế giá trị gia tăng phải nộp", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: true },
  { code: "3332", name: "Thuế tiêu thụ đặc biệt", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "3333", name: "Thuế xuất, nhập khẩu", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "3334", name: "Thuế thu nhập doanh nghiệp", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "3335", name: "Thuế thu nhập cá nhân", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "3336", name: "Thuế tài nguyên", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "3337", name: "Thuế nhà đất, tiền thuê đất", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "3338", name: "Thuế bảo vệ môi trường và các loại thuế khác", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "3339", name: "Phí, lệ phí và các khoản phải nộp khác", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "333", isPostable: true, isSystem: false },
  { code: "334", name: "Phải trả người lao động", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "335", name: "Chi phí phải trả", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "336", name: "Phải trả nội bộ", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "337", name: "Thanh toán theo tiến độ hợp đồng xây dựng", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "338", name: "Phải trả, phải nộp khác", type: "LIABILITY", normalBalance: "CREDIT", isPostable: false, isSystem: false },
  { code: "3381", name: "Tài sản thừa chờ giải quyết", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "338", isPostable: true, isSystem: false },
  { code: "3382", name: "Kinh phí công đoàn", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "338", isPostable: true, isSystem: false },
  { code: "3383", name: "Bảo hiểm xã hội", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "338", isPostable: true, isSystem: false },
  { code: "3384", name: "Bảo hiểm y tế", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "338", isPostable: true, isSystem: false },
  { code: "3386", name: "Bảo hiểm thất nghiệp", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "338", isPostable: true, isSystem: false },
  { code: "3387", name: "Doanh thu chờ phân bổ", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "338", isPostable: true, isSystem: false },
  { code: "3388", name: "Phải trả, phải nộp khác", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "338", isPostable: true, isSystem: false },
  { code: "341", name: "Vay và nợ thuê tài chính", type: "LIABILITY", normalBalance: "CREDIT", isPostable: false, isSystem: false },
  { code: "3411", name: "Các khoản đi vay", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "341", isPostable: true, isSystem: false },
  { code: "3412", name: "Nợ thuê tài chính", type: "LIABILITY", normalBalance: "CREDIT", parentCode: "341", isPostable: true, isSystem: false },
  { code: "343", name: "Trái phiếu phát hành", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "344", name: "Nhận ký quỹ, ký cược", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "347", name: "Thuế thu nhập hoãn lại phải trả", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "352", name: "Dự phòng phải trả", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "353", name: "Quỹ khen thưởng, phúc lợi", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "356", name: "Quỹ phát triển khoa học và công nghệ", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "357", name: "Quỹ bình ổn giá", type: "LIABILITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  // ---------------- VỐN CHỦ SỞ HỮU ----------------
  { code: "411", name: "Vốn đầu tư của chủ sở hữu", type: "EQUITY", normalBalance: "CREDIT", isPostable: false, isSystem: true },
  { code: "4111", name: "Vốn góp của chủ sở hữu", type: "EQUITY", normalBalance: "CREDIT", parentCode: "411", isPostable: true, isSystem: true },
  { code: "4112", name: "Thặng dư vốn", type: "EQUITY", normalBalance: "CREDIT", parentCode: "411", isPostable: true, isSystem: false },
  { code: "4118", name: "Vốn khác", type: "EQUITY", normalBalance: "CREDIT", parentCode: "411", isPostable: true, isSystem: false },
  { code: "412", name: "Chênh lệch đánh giá lại tài sản", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "413", name: "Chênh lệch tỷ giá hối đoái", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "414", name: "Quỹ đầu tư phát triển", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "418", name: "Các quỹ khác thuộc vốn chủ sở hữu", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "419", name: "Cổ phiếu mua lại của chính mình", type: "EQUITY", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "421", name: "Lợi nhuận sau thuế chưa phân phối", type: "EQUITY", normalBalance: "CREDIT", isPostable: false, isSystem: true },
  { code: "4211", name: "LNST chưa phân phối lũy kế đến cuối năm trước", type: "EQUITY", normalBalance: "CREDIT", parentCode: "421", isPostable: true, isSystem: true },
  { code: "4212", name: "LNST chưa phân phối năm nay", type: "EQUITY", normalBalance: "CREDIT", parentCode: "421", isPostable: true, isSystem: true },
  // ---------------- DOANH THU ----------------
  { code: "511", name: "Doanh thu bán hàng và cung cấp dịch vụ", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: true },
  { code: "515", name: "Doanh thu hoạt động tài chính", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "521", name: "Các khoản giảm trừ doanh thu", type: "INCOME", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  // ---------------- CHI PHÍ SẢN XUẤT, KINH DOANH ----------------
  { code: "621", name: "Chi phí nguyên liệu, vật liệu trực tiếp", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "622", name: "Chi phí nhân công trực tiếp", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "623", name: "Chi phí sử dụng máy thi công", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "627", name: "Chi phí sản xuất chung", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "632", name: "Giá vốn hàng bán", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "635", name: "Chi phí tài chính", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "641", name: "Chi phí bán hàng", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  { code: "642", name: "Chi phí quản lý doanh nghiệp", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: true },
  // ---------------- THU NHẬP KHÁC / CHI PHÍ KHÁC ----------------
  { code: "711", name: "Thu nhập khác", type: "INCOME", normalBalance: "CREDIT", isPostable: true, isSystem: false },
  { code: "811", name: "Chi phí khác", type: "EXPENSE", normalBalance: "DEBIT", isPostable: true, isSystem: false },
  { code: "821", name: "Chi phí thuế thu nhập doanh nghiệp", type: "EXPENSE", normalBalance: "DEBIT", isPostable: false, isSystem: false },
  { code: "8211", name: "Chi phí thuế TNDN hiện hành", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "821", isPostable: true, isSystem: false },
  { code: "8212", name: "Chi phí thuế TNDN hoãn lại", type: "EXPENSE", normalBalance: "DEBIT", parentCode: "821", isPostable: true, isSystem: false },
  // ---------------- XÁC ĐỊNH KẾT QUẢ KINH DOANH ----------------
  { code: "911", name: "Xác định kết quả kinh doanh", type: "EQUITY", normalBalance: "CREDIT", isPostable: true, isSystem: true },
];

/** @deprecated TT200 hết hiệu lực từ 01/01/2026 — dùng TT99 cho org mới. Giữ cho org cũ. */
export type ChartStandard = "TT133" | "TT200" | "TT99";

/** Lấy bộ chart theo chuẩn. TT200 deprecated (hết hiệu lực 2026) — giữ cho org cũ. */
export function chartOf(standard: ChartStandard): SeedAccount[] {
  if (standard === "TT99") return CHART_TT99;
  return standard === "TT200" ? CHART_TT200 : CHART_TT133;
}

/** Alias tương thích ngược (mặc định TT133). */
export const CHART_OF_ACCOUNTS = CHART_TT133;
