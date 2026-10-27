# Soul-Restaurant — Bảng điều khiển (web)

Mọi năng lực của module (42) đều là **một nút thật, sống 100%** trên bảng điều khiển.
UI render **động** từ `src/ui-catalog.ts#restoUiCatalog` — thêm tool là phải thêm mục
catalog (audit ép 1:1 với registry ⇒ không bao giờ có "nút chết").

## 3 cách dùng

### 1) Component React trong apps/web (khuyến nghị)
```tsx
import { RestaurantConsole } from '@citadel/module-soul-restaurant/web/RestaurantConsole';

export default function Page() {
  return <RestaurantConsole />; // JWT do host gắn qua cookie/session
}
```
Mount tại route `/restaurant` (đã khai trong `manifest.module.json` → `menu` + `ui.mount`).
Component tự gọi `GET /api/v1/soul-restaurant/dashboard` cho trang tổng quan và dựng form
cho từng năng lực từ catalog.

### 2) Endpoint catalog cho UI bất kỳ
```
GET /api/v1/soul-restaurant/capabilities
→ { summary: { total, read, action, groups }, capabilities: [ { tool, group, label, kind, method, path, sensitive?, fields[] } ] }
```
Bất kỳ front-end nào cũng có thể đọc endpoint này để tự sinh nút — không cần biết trước
danh sách năng lực.

### 3) Demo tĩnh bấm được (không cần build)
Mở `web/soul-restaurant-console.html` — self-contained (catalog nhúng sẵn), có:
- **Chế độ Demo (mock)**: mọi nút chạy trên backend giả lập trong bộ nhớ (mở bàn → gọi món
  → xem đơn → thanh toán… đều phản hồi) để xem toàn bộ tác vụ mà không cần server.
- **Chế độ Live (API thật)**: nhập Base URL (mặc định `/api/v1/soul-restaurant`) + JWT →
  nút gọi thẳng API module.

Sinh lại demo sau khi đổi catalog:
```
npx tsx scripts/gen-console-html.ts   # → web/soul-restaurant-console.html + web/capabilities.json
```

## Nhạy cảm (dry-run → confirm)
Nút của action `sensitive` (🔒) hiển thị bước **"Chuẩn bị… → Xác nhận chạy"** trước khi gọi
(gửi `confirm:true`) — khớp giao thức host `executeAction` của SuperCitadel.

## Nhóm nút
`Bảng điều khiển · Sàn & Bàn · Đơn hàng · Bếp / KDS · Menu & Định lượng · Bill & Thanh toán ·
Đặt bàn · Khuyến mãi · Khách & Điểm · Báo cáo · Cấu hình` — khai trong `UI_GROUPS`.
