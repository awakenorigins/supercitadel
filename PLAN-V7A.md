# KẾ HOẠCH BUILD — CITADEL V7A

> Nguồn spec: "Ý Tưởng Cốt Lõi CITADEL v5.1" (bản đọc cho sáng lập & nhà đầu tư)
> Nền tảng kế thừa: codebase Citadel V8 (production-ready, đã verify chạy thật)
> Ngày lập: 2026-07-02 · Người lập: Tiểu Tâm 🦊

---

## 1. TẦM NHÌN (chốt từ spec)

Citadel = siêu app quản lý doanh nghiệp: **lõi pháo đài + module rời + Tiểu Tâm AI ở trung tâm**.
Không phải "phần mềm gắn AI" — mà là **AI có phần mềm mọc quanh nó**. Tiểu Tâm sinh trước, module mọc sau.

**3 ý tưởng lõi:**
1. Lõi + module tháo–lắp tự do, cùng một bộ quy chuẩn 8 mặt cắt
2. Tiểu Tâm là trái tim — hồn tách khỏi động cơ, đổi model AI không mất trí nhớ
3. Cửa vào bằng token 13 ký tự — 30 giây thành người dùng, bảo mật lũy tiến

**Hiến pháp 8 điều bất biến** (§08 spec) được nhúng vào CI làm gate — vi phạm là build đỏ.

## 2. NỀN TẢNG KẾ THỪA (đã có, đã chạy thật)

Codebase V8 hiện tại (`/opt/NewCitadelV21`, ~150 file, monorepo pnpm+turbo):

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Auth token 13 ký tự (argon2id→JWT), multi-tenant, RBAC | ✅ | test tenant isolation thật |
| Module runtime (manifest, lifecycle, gate 403, mua bằng Om) | ✅ | audit gate flow 46/46 |
| Tiểu Tâm core (intent, tool xuyên module, SSE stream, stub/live LLM) | ✅ | integration API→WS→client |
| **M0 Kế Toán** (fork domain ERPNext): GL sổ kép bất biến, chart TK VN TT133, hóa đơn, thu chi knock-off công nợ, hủy=bút toán đảo, báo cáo lãi lỗ/cân đối thử | ✅ | 36 asserts, audit 76/76, journey 41/41 |
| HR v2 (fork frappe/hrms): chấm công, ca, nghỉ phép full vòng đời | ✅ | 23 asserts |
| CRM, Kho hàng, Om wallet ledger, Notification, Search, Chat realtime | ✅ | audit endpoints PASS |
| UI design system (off-black/jade, 12 màn web) | ✅ 90/100 | multi-review 96/100 |
| Docker deploy 1 lệnh, CI GitHub Actions, docs API/USER/DEV | ✅ | deploy.sh + healthcheck |

## 3. GAP ANALYSIS — Spec v5.1 vs hiện trạng

| # | Yêu cầu spec | Hiện trạng | Việc V7A |
|---|---|---|---|
| G1 | Hồn tách động cơ: kho trí nhớ trung lập, đổi model giữ nguyên trí nhớ + nhân cách (§03, 5 nguyên tắc) | Một phần (stub/live mode) | **Xây Memory Store trung lập** (sự kiện/người/chủ đề/tóm tắt dạng text thuần trong Postgres) + Context Assembler (1 cổng ngữ cảnh) + Adapter per model (Claude/GPT/nội bộ) + bài test swap bắt buộc |
| G2 | Tâm trạng + thanh năng lượng (§02): 4 trạng thái, hao theo dùng, hồi 3 đường, Beta mode không giới hạn | ❌ Chưa có | **Energy Service**: đo lượt dùng → hao; hồi theo thời gian / cho ăn vật phẩm / nạp gói; 4 trạng thái ảnh hưởng behavior; cờ BETA_MODE bật/tắt |
| G3 | Kho chứa vật phẩm + "sử dụng" tạo hiệu ứng thật (§04 — mắt xích đứt của vòng kinh tế) | ❌ (kho hiện tại = tồn kho hàng hóa, khác kho vật phẩm) | **Item System**: bảng items+effects, xem info đầy đủ, nút Sử dụng → hiệu ứng thấy được (cho Tiểu Tâm ăn +energy, trang trí đổi giao diện, module sáng đèn) |
| G4 | Cửa hàng bán vật phẩm + model AI (§04) | Một phần (mới bán module) | Mở rộng store: vật phẩm + AI model rental, trừ Om thật |
| G5 | Bảo mật lũy tiến lớp 2: gắn email/SĐT, hành động nhạy cảm đòi lớp 2, chủ động nhắc khi tài khoản có giá trị (§06) | ❌ | **Progressive Security**: bind email/phone, sensitive-action gate, nhắc tự động |
| G6 | Tài liệu module = giáo trình Tiểu Tâm (quy chuẩn ⑧) | Một phần | Mỗi module: intro + hướng dẫn + mô tả chức năng + ví dụ + changelog → Tiểu Tâm đọc thành bản đồ năng lực |
| G7 | Kế toán kết nối Excel/Claude (§07) | ❌ | Export/Import Excel (xlsx) cho sổ cái, hóa đơn, báo cáo; endpoint cho Claude-on-Excel |
| G8 | Audit log "ai làm gì lúc nào" (§06) | ❌ | Bảng audit_logs, ghi mọi thao tác nhạy cảm |
| G9 | Khu vực riêng của Tiểu Tâm (§02) — "nơi chốn thực sự" | Một phần (sheet SSE) | Trang /tieu-tam: avatar sống, mood bar, energy bar, trí nhớ, lịch sử |
| G10 | Mọi nút bấm đều sống 100% (§07) | ~95% | Rà toàn bộ + audit script tự động |

## 4. KIẾN TRÚC V7A

```
citadel-v7a/
├── apps/web/            # Next.js 15 — 13 màn + /tieu-tam mới
├── services/api/        # Hono gateway (REST + SSE)
├── services/ws/         # Realtime WebSocket
├── packages/core/       # Luật chơi thuần (hiến pháp 8 điều)
├── packages/db/         # Drizzle + Postgres/pgvector, org_id mọi bảng
├── packages/tieu-tam/   # HỒN: memory store, context assembler, adapters, mood/energy
└── modules/             # 8 mặt cắt: manifest + migrations + server + docs/
    ├── accounting/      # M0 — mặc định mọi tài khoản
    ├── chat/ crm/ hr/ inventory/ notification/ om/
```

- Phụ thuộc một chiều: web → services → packages. Module chỉ nói chuyện qua event bus.
- Bí mật: chỉ `.env` (gitignore) + `.env.example`. Secret scan trong CI.
- Tiền: numeric chính xác tuyệt đối, không float.

## 5. LỘ TRÌNH 7 PHASE (map §09 spec)

| Phase | Nội dung | Nghiệm thu | Ước lượng |
|---|---|---|---|
| **P0 — Repo chuẩn** ✅ HÔM NAY | Fork nền V8 → repo `citadel-v7a`, rebrand, CI, secret scan, plan | Repo trên GitHub, CI xanh, deploy 1 lệnh chạy | 0.5 ngày |
| **P1 — Nền móng hardening** | Audit log (G8), progressive security lớp 2 (G5), rà nút sống (G10) | Thao tác nhạy cảm đòi lớp 2 + ghi vết; audit UI 100% sống | 1–1.5 ngày |
| **P2 — Trái tim** | Memory store trung lập + context assembler + model adapters (G1); mood/energy + Beta mode (G2) | **Test swap model: hỏi cùng bộ câu trước/sau đổi model → nhất quán tuyệt đối**; energy hao/hồi/nhắc nghỉ đúng đặc tả | 2–3 ngày |
| **P3 — Vòng kinh tế khép kín** | Item system + kho chứa + use effects (G3); store mở rộng (G4) | Chuỗi điểm→mua→kho→dùng→hiệu ứng khép kín, thấy được | 1.5–2 ngày |
| **P4 — M0 Kế Toán hoàn thiện** | Excel connect (G7); tài liệu trọn bộ 8 mặt cắt cho MỌI module (G6) → Tiểu Tâm học được | Kế toán chạy đủ, Tiểu Tâm hướng dẫn + thao tác được, Excel mượt | 1.5–2 ngày |
| **P5 — Trải nghiệm premium** | Trang /tieu-tam (G9), polish UI/UX toàn app, mobile responsive | Review UI ≥ 95/100; khu vực Tiểu Tâm sống động | 1.5–2 ngày |
| **P6 — Vận hành vững** | Chạy trọn bộ 9 chuẩn nghiệm thu §09, monitoring, release v7a.1.0 | 9/9 ✓ checklist spec PASS, tag release | 1 ngày |

**Tổng: ~9–12 ngày forge** (làm theo mạch OpenBuild: mỗi phase kết thúc = `docker compose up` chạy thật + test xanh mới đi tiếp).

## 6. CHUẨN NGHIỆM THU CUỐI (từ §09 spec — 9 gạch)

1. Đổi model AI → trí nhớ/nhân cách nhất quán tuyệt đối
2. Người công ty A truy dữ liệu công ty B bằng mọi ngả → chặn + ghi vết
3. Mọi vật phẩm xem được info; Sử dụng → hiệu ứng thật
4. 100% nút và màn hình sống
5. Người mới: token → đặt tên → dùng trong 30 giây; hành động nhạy cảm đòi lớp 2
6. Beta mode bật/tắt được; tắt → energy hao/hồi/nhắc đúng
7. M0 Kế Toán đủ chức năng + tài liệu + Tiểu Tâm vận hành được + Excel
8. Tạm tắt module bất kỳ → không gãy, quyền thu hồi sạch
9. Rà mã nguồn → 0 bí mật trong code

## 7. QUY TRÌNH LÀM VIỆC

- Mỗi phase: build → test tự động → audit endpoint → user-journey script → STATE.md cập nhật → commit + push
- Báo cáo tiến độ về group sau mỗi phase kèm ảnh chụp màn hình
- Không phase nào FINAL khi test chưa xanh
