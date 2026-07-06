# SUPERCITADEL — Sự cố "web không vào được sau deploy" + Fix triệt để

## Triệu chứng
Sau khi redeploy (`docker compose -p supercitadel up -d --build web`), người dùng (đặc biệt trên trình duyệt đã mở app từ trước) bị **màn hình trắng / không vào được** `https://supercitadel.62.146.238.213.sslip.io/`, dù server trả 200 và container healthy.

## Nguyên nhân gốc (đã xác định bằng log)
1. **Next.js standalone tự gắn `Cache-Control: s-maxage=31536000` cho tài liệu HTML** (mặc định của Next khi trang render tĩnh, hàm `getCacheControlHeader` trả `s-maxage=CACHE_ONE_YEAR` khi `revalidate` undefined).
2. HTML này tham chiếu các chunk JS/CSS theo **hash filename** (vd `785-778584e14f2dca51.js`). Mỗi lần build lại → hash MỚI.
3. Cache HTML 1 năm ở CDN/proxy/trình duyệt → sau vài lần deploy, client giữ **HTML cũ trỏ chunk hash cũ** đã bị build mới xóa → tải chunk 404 / abort → **màn hình trắng**.
4. Ngay tại thời điểm deploy, container web restart → request đang bay bị cắt (`broken pipe` / `client disconnected` trong log Caddy) — cửa sổ lỗi tạm thời.

Log Caddy bằng chứng (IP người dùng, iPhone, vi-VN):
```
"aborting with incomplete response" upstream 127.0.0.1:3000
uri:/_next/static/chunks/785-778584e14f2dca51.js
error:"write: broken pipe" / "client disconnected"
```

## Fix triệt để (đã áp dụng tại host Caddy `/etc/caddy/Caddyfile`, block supercitadel)
Tách cache theo loại tài nguyên — **HTML không bao giờ cache dài, asset immutable mới cache dài**:

- `/_next/static/*` (hashed, bất biến) → `Cache-Control: public, max-age=31536000, immutable` — vẫn nhanh.
- Mọi thứ khác (HTML/RSC) → `Cache-Control: no-cache, must-revalidate` (dùng operator `>Cache-Control` để GHI ĐÈ header `s-maxage` từ Next) → client luôn revalidate → deploy mới ăn ngay, không kẹt HTML cũ.

Xem block chuẩn: `ops/caddy-supercitadel.block.conf` (bản sao versioned của block trong Caddyfile).

## Cách áp lại nếu Caddyfile bị reset (KHÔNG để lặp lại)
1. Mở `/etc/caddy/Caddyfile`, tìm block `supercitadel.62.146.238.213.sslip.io { ... }`.
2. Thay bằng nội dung `ops/caddy-supercitadel.block.conf`.
3. `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` → phải "Valid configuration".
4. `systemctl reload caddy` (reload, KHÔNG restart — không rớt kết nối).
5. Verify:
   - `curl -sI https://supercitadel.62.146.238.213.sslip.io/ | grep -i cache-control` → `no-cache, must-revalidate`.
   - `curl -sI .../_next/static/chunks/<bất kỳ>.js | grep -i cache-control` → `immutable`.

## Khuyến nghị deploy về sau
- Sau mỗi `docker compose up -d --build web`, client cũ tự lấy HTML mới ở lần điều hướng kế (nhờ no-cache). Không cần người dùng xóa cache thủ công.
- Nếu muốn zero-downtime tuyệt đối lúc build: build image trước, `up -d` sau (compose đã làm gần vậy); cửa sổ cắt kết nối chỉ ~vài giây và giờ không còn để lại hậu quả cache.
- Backup Caddyfile trước khi sửa: đã lưu `Caddyfile.bak-<timestamp>` trong repo root khi áp fix này.
