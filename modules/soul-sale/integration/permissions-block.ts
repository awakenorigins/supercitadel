/**
 * SOUL-SALE 1A — khối permission để nạp vào packages/core/src/permissions.ts của host.
 * NẠP-MODULE Beat 2 sẽ chèn nội dung này vào PERMISSION_REGISTRY (đúng chỗ các module khác),
 * và thêm 'soulsale.*' vào wildcard của role manager.
 * Ghi chú level/sensitive khớp registry: mọi *.write nhạy cảm tài chính/cấu trúc = level 2.
 */
export const SOUL_SALE_PERMISSIONS_BLOCK = `
  // ===== Soul-Sale 1A — Bán Hàng & Kênh Phân Phối =====
  p('soulsale.customer.read',  'Soul-Sale — Xem khách hàng', 1, false),
  p('soulsale.customer.write', 'Soul-Sale — Tạo/sửa/gộp khách hàng', 2, true),
  p('soulsale.channel.read',   'Soul-Sale — Xem cây kênh/đại lý/điểm bán', 1, false),
  p('soulsale.channel.write',  'Soul-Sale — Quản trị kênh (tạo/chuyển tuyến/khu vực)', 2, true),
  p('soulsale.lead.read',      'Soul-Sale — Xem lead', 1, false),
  p('soulsale.lead.write',     'Soul-Sale — Ghi nhận/gán/convert lead', 1, false),
  p('soulsale.deal.read',      'Soul-Sale — Xem pipeline/deal/hoạt động', 1, false),
  p('soulsale.deal.write',     'Soul-Sale — Tạo/di chuyển deal, ghi hoạt động', 1, false),
  p('soulsale.quote.read',     'Soul-Sale — Xem báo giá', 1, false),
  p('soulsale.quote.write',    'Soul-Sale — Tạo/chốt báo giá', 1, false),
  p('soulsale.order.read',     'Soul-Sale — Xem đơn hàng', 1, false),
  p('soulsale.order.write',    'Soul-Sale — Tạo/xác nhận/hủy/giữ đơn', 2, true),
  p('soulsale.finance.read',   'Soul-Sale — Xem công nợ/hoa hồng', 1, false),
  p('soulsale.finance.write',  'Soul-Sale — Thu tiền/hạn mức/hoa hồng/chốt kỳ nợ', 2, true),
  p('soulsale.price.read',     'Soul-Sale — Tra giá', 1, false),
  p('soulsale.price.write',    'Soul-Sale — Đặt rule giá', 2, true),
  p('soulsale.target.read',    'Soul-Sale — Xem chỉ tiêu', 1, false),
  p('soulsale.target.write',   'Soul-Sale — Giao chỉ tiêu', 1, false),
  p('soulsale.import.read',    'Soul-Sale — Xem batch đối soát', 1, false),
  p('soulsale.import.write',   'Soul-Sale — Nạp/đối soát/chốt bảng kê đại lý', 2, true),
  p('soulsale.report.read',    'Soul-Sale — Báo cáo/dự báo/next-best-actions', 1, false),
`;
