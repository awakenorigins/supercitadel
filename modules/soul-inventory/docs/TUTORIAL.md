# SOUL-INVENTORY — Full Tutorial (người dùng cuối + Tiểu Tâm dẫn đường)

> Tutorial từng bước cho người dùng mới của module Soul-Inventory.
> Tiểu Tâm dùng tài liệu này để **dẫn tour trong app**: mỗi bài học là một
> chuỗi hội thoại + hành động thật. Host cũng có thể render thành trang
> hướng dẫn tương tác (onboarding checklist).

---

## Bài 0 — Module này làm được gì? (30 giây)

Soul-Inventory quản lý **toàn bộ vòng đời hàng hóa trong kho**:

| Nhóm | Khả năng |
|---|---|
| 📦 Danh mục | Vật tư/SKU, đơn vị tính, định mức tồn, mã vạch, theo dõi lô/serial/hạn dùng |
| 🏭 Địa điểm | Nhiều kho, kho mặc định tự tạo, chuyển hàng giữa kho |
| ↕️ Nhập–Xuất | Phiếu nhập 01-VT, phiếu xuất 02-VT, giá vốn bình quân tự động |
| 🔒 Giữ hàng | Đặt chỗ cho đơn hàng, hủy giữ, xuất phần đã giữ |
| 🚨 Cảnh báo | Tồn dưới định mức, lô cận hạn sử dụng (FEFO) |
| 📋 Kiểm kê | Mẫu 05-VT: đếm thực tế, xem lệch, chốt điều chỉnh có sổ sách |
| 📈 Báo cáo | Thẻ kho S10-DN, tổng quan kho, giá trị tồn ước tính |

Tất cả thao tác được bằng **2 cách**: nói với Tiểu Tâm bằng tiếng Việt, hoặc màn hình /inventory.

---

## Bài 1 — Thêm mặt hàng đầu tiên (2 phút)

**Nói với Tiểu Tâm:**
> "Thêm mặt hàng gạo ST25, mã GAO-ST25, đơn vị kg, khi nào dưới 50 ký thì báo"

Tiểu Tâm sẽ xác nhận rồi tạo. Kết quả: mặt hàng xuất hiện trong danh mục, chưa có tồn.

**Nâng cao — hàng cần quản theo LÔ (thực phẩm, mỹ phẩm, thuốc):**
> "Thêm sữa tươi Vinamilk 1L, quản lý theo lô, dưới 20 hộp báo tôi"

→ từ giờ mọi lần nhập/xuất sữa, Tiểu Tâm sẽ hỏi **số lô + hạn sử dụng**.

**Hàng quản theo SERIAL (tivi, máy móc — mỗi cái một số máy):**
> "Thêm Tivi Samsung 55 inch, quản lý theo serial"

💡 Mẹo: chọn đúng chế độ ngay từ đầu — hàng thường / theo lô / theo serial — đổi sau vẫn được nhưng dữ liệu cũ không tự gắn lô.

---

## Bài 2 — Nhập kho lần đầu (2 phút)

> "Nhập 200 ký gạo ST25, giá 28 nghìn một ký, hàng của Vinafood"

Tiểu Tâm xác nhận: *"Em nhập 200kg GAO-ST25, đơn giá 28.000đ, vào Kho chính — đúng không ạ?"* → OK → xong. Hệ thống tự:
- Tăng tồn lên 200kg
- Ghi một dòng **sổ nhật ký** (đối chiếu Phiếu nhập kho 01-VT)
- Cập nhật **giá vốn bình quân** = 28.000đ

**Nhập hàng theo lô:**
> "Hàng về: 60 hộp sữa Vinamilk, lô LOT-A, hạn 15/7, giá 25 nghìn"

**Nhập hàng theo serial:**
> "Nhập 1 tivi SS55, serial SN-001"  (mỗi serial nhập riêng một lệnh, số lượng luôn 1)

✅ Kiểm tra: hỏi *"Gạo còn bao nhiêu?"* → phải thấy 200kg.

---

## Bài 3 — Xuất kho & hiểu "khả dụng" (3 phút)

> "Xuất 30 ký gạo giao anh Minh"

Khái niệm quan trọng nhất của cả module — **3 con số tồn**:

| Số | Nghĩa |
|---|---|
| `stocked` | Tồn vật lý trong kho |
| `reserved` | Đang giữ chỗ cho đơn chưa lấy |
| **`available`** | **= stocked − reserved → số THẬT còn bán được** |

Hệ thống **không bao giờ** cho xuất quá `available`. Nếu thiếu, Tiểu Tâm báo số thật và gợi ý phương án — không có chuyện âm kho, không có chuyện lệch sổ.

**Xuất hàng theo lô — quy tắc FEFO (hết hạn trước xuất trước):**
> "Xuất 20 hộp sữa" → Tiểu Tâm: *"Lô LOT-A hết hạn sau 10 ngày, em xuất lô này trước nhé (FEFO)?"*

---

## Bài 4 — Giữ hàng cho khách (3 phút)

Tình huống: khách chốt đơn nhưng mai mới lấy — không muốn lỡ bán mất phần của khách.

> "Giữ 20 ký gạo cho chị Lan, mai lấy"

→ tồn vẫn 170kg nhưng **khả dụng chỉ còn 150kg**. Ai hỏi mua 160kg sẽ không xuất được.

Ngày mai, 3 khả năng:
- Khách lấy hàng: > "Chị Lan lấy gạo rồi" → xuất thật phần đã giữ, xong.
- Khách hủy: > "Chị Lan không lấy nữa" → trả 20kg về khả dụng.
- Xem đang giữ gì: > "Đang giữ hàng cho những ai?"

---

## Bài 5 — Cảnh báo: đừng để hết hàng, đừng để hết hạn (2 phút)

**Mỗi sáng hỏi một câu:**
> "Hôm nay kho có gì cần chú ý không?"

Tiểu Tâm chạy 2 cảnh báo:
1. **Tồn thấp** — mặt hàng dưới định mức, kèm gợi ý số cần nhập
2. **Cận hạn** — lô còn tồn sắp hết hạn (mặc định nhìn trước 30 ngày)

> 💡 Chỉnh khoảng nhìn: "Lô nào hết hạn trong 2 tuần tới?"

---

## Bài 6 — Chuyển kho (2 phút)

Mở thêm điểm bán? Tạo kho mới rồi chuyển:
> "Tạo kho mới mã KHO-Q7 tên Kho Quận 7"
> "Chuyển 50 ký gạo từ kho chính sang kho Quận 7"

Chuyển là **một giao dịch nguyên khối**: trừ bên này + cộng bên kia cùng lúc, ghi 2 dòng sổ — không bao giờ "hàng lơ lửng giữa đường".

---

## Bài 7 — Kiểm kê cuối kỳ (5 phút)

Cuối tháng đếm kho thực tế:

> "Kiểm kê kho chính: gạo đếm được 148 ký, sữa lô A đếm 28 hộp"

Tiểu Tâm làm theo **quy trình 2 bước an toàn**:
1. **Xem trước**: bảng đối chiếu sổ sách vs thực tế, chỉ ra từng dòng lệch — chưa đụng gì vào tồn.
2. Mày xác nhận → **chốt**: tồn điều chỉnh về số thực tế, mỗi dòng lệch ghi một bút toán `adjust` vào sổ — kiểm toán truy nguyên được 100%.

✅ Sau kiểm kê, hỏi *"thẻ kho gạo ST25"* → thấy đủ lịch sử: nhập 200 → xuất 30 → giữ-xuất 20 → điều chỉnh −2.

---

## Bài 8 — Báo cáo nhanh cho chủ doanh nghiệp (1 phút)

| Hỏi | Nhận |
|---|---|
| "Kho đang thế nào?" | Tổng quan: số mặt hàng, tổng khả dụng, số hàng dưới định mức, **giá trị tồn ước tính** |
| "Thẻ kho [tên hàng]" | Lịch sử N-X-T đầy đủ + tổng nhập/xuất/số dư |
| "[Tên hàng] còn bao nhiêu?" | Tồn chi tiết theo kho, theo lô |

---

## Bài 9 — Chuyển từ hệ cũ sang (dành cho ai đã dùng module inventory cũ)

Nếu org đã có dữ liệu ở module inventory cũ, khi cài Soul-Inventory:
- Migration `0002` **tự động hút toàn bộ** mặt hàng + tồn cũ sang (chạy lại nhiều lần không nhân đôi)
- Hàng cũ không có SKU được cấp mã `LEGACY-xxxxxxxx`
- Mỗi số tồn mang sang có một dòng sổ `initial backfill` — biết rõ số nào từ đâu ra

Không mất gì, không phải nhập tay lại.


---

## Bài 10 — Đơn vị quy đổi: nhập thùng, bán lẻ lon (3 phút) ⭐ v2

Hàng mua theo thùng nhưng bán theo lon? Khai một lần:

> "Bia 333 một thùng 24 lon, mã vạch thùng 8934822101343"

Từ giờ:
- **Nhập:** "Hàng về 5 thùng bia" → hệ tự ghi 120 lon, đơn giá thùng tự chia về lon
- **Xuất:** "Xuất 2 thùng cho đại lý" → trừ 48 lon
- **Quét mã thùng** → Tiểu Tâm tự hiểu quy cách, khỏi nhớ hệ số

💡 Khai được nhiều quy cách cho một mặt hàng: lốc 6, thùng 24, pallet 1200...

---

## Bài 11 — Xuất hàng thông minh với FEFO (3 phút) ⭐ v2

Hàng có hạn dùng thì **lô cận hạn phải xuất trước** (FEFO) — không là ôm nguyên lô hết date. Đừng tự nhớ, hỏi:

> "Xuất 35 hộp sữa TH thì lấy lô nào?"

Tiểu Tâm trả **kế hoạch từng lô**: "Lô L-A lấy 20 (hết hạn 15/7 — cận nhất), lô L-B lấy 15". Duyệt xong Tiểu Tâm xuất đúng thứ tự đó, có số phiếu PXK từng dòng.

Hàng không hạn dùng → hệ tự dùng FIFO (nhập trước xuất trước).

---

## Bài 12 — Sản xuất & lắp ráp với định mức BOM (5 phút) ⭐ v2

Xưởng nhỏ, quán làm combo, shop gói giỏ quà — đều là "lắp ráp":

**Bước 1 — khai định mức một lần:**
> "Tạo định mức giỏ quà Tết: 1 rượu vang + 2 hộp bánh quy"

**Bước 2 — hỏi trước khi nhận đơn:**
> "Giỏ quà lắp được tối đa bao nhiêu?" → "7 giỏ (giới hạn bởi rượu vang còn 7)"

**Bước 3 — lắp:**
> "Lắp 3 giỏ quà" → nguyên liệu tự trừ (backflush), thành phẩm cộng vào kho, **giá vốn giỏ tự tính** từ giá vốn nguyên liệu. Có lệnh LSX- để truy nguyên.

**Tháo cũng được:** "Tháo 1 giỏ" → hoàn nguyên liệu về kho (trừ phần hao hụt định mức).

---

## Bài 13 — Nhập cả kho từ Excel trong 2 phút ⭐ v2

Đang quản kho bằng Excel? Chuyển sang không cần gõ lại:

1. **Danh mục:** file có cột SKU / Tên / ĐVT / Định mức / Barcode → "Nhập danh mục từ file này"
2. **Tồn đầu kỳ:** file có cột SKU / Số lượng / Đơn giá / Lô / HSD → "Nhập tồn đầu kỳ từ file"

Hệ báo **từng dòng OK hay lỗi** (dòng lỗi không phá cả file). Header Việt/Anh đều nhận, ngày kiểu Excel hay dd/mm/yyyy đều hiểu.

**Chiều ngược lại:** "Xuất báo cáo tồn kho ra Excel" / "Xuất thẻ kho gạo ST25 ra Excel" → nhận file .xlsx.

---

## Bài 14 — Hàng hỏng, hàng hết hạn: hủy đúng cách (2 phút) ⭐ v2

Đừng "trừ đại cho khớp" — hủy có sổ sách:

> "5 hộp sữa lô L-A bị vỡ, hủy đi"

Tiểu Tâm xác nhận trước (kèm **giá trị thiệt hại** theo giá vốn) → chốt → phiếu SCR- ghi sổ, lô hết tồn tự đánh dấu đã tiêu. Cuối kỳ nhìn tổng scrap là biết thất thoát bao nhiêu.

---

## Bài 15 — Để hệ thống tự nhắc đặt hàng (3 phút) ⭐ v2

Nâng cấp từ "định mức tối thiểu" đơn giản → **rule min-max có nhà cung cấp**:

> "Bia 333 giữ tồn từ 60 đến 200 lon, NCC Sabeco, giao 3 ngày"

Mỗi sáng hỏi: "Cần đặt hàng gì?" → danh sách hàng dưới min, **số đề xuất** (đưa tồn về max), NCC và lead time từng món. Copy là thành đơn đặt hàng.

---

## Bài 16 — Biết hàng nào đáng tiền: ABC + tồn kho già (3 phút) ⭐ v2

Cuối tháng chạy một lệnh:

> "Chạy phân loại ABC"

Hệ xếp theo **giá trị xuất 90 ngày**: lớp A (80% giá trị — số ít hàng nuôi cả kho), B, C. Từ đó:
- "Nên kiểm kê gì?" → hàng lớp A đến hạn kiểm (30 ngày/lần), B (60), C (120) — kiểm ít mà trúng
- "Hàng nào nằm kho lâu?" → tồn >90 ngày kèm vốn đọng — biết đường xả hàng


---

## Bài 17 — Để hệ tự tính "khi nào đặt, đặt bao nhiêu" (5 phút) ⭐ v2.1

Nâng cấp từ min-max tay lên **bổ hàng theo toán**:

**Bước 1 — khai tham số một lần cho hàng quan trọng:**
> "Tính điểm đặt lại cho bia 333: độ phủ 95%, NCC giao 7 ngày, mỗi lần đặt tốn 100 nghìn, lưu kho 20% một năm"

Hệ tự tính từ lịch sử bán thật: **tồn an toàn** (đệm cho ngày bán đột biến), **điểm đặt lại** (chạm mức này là đặt), **EOQ** (mỗi lần đặt bao nhiêu là rẻ nhất).

**Bước 2 — mỗi sáng hỏi một câu:**
> "Theo dự báo cần bổ hàng gì?"

→ danh sách hàng chạm điểm đặt, số đề xuất theo EOQ, còn đủ bán mấy ngày, NCC nào. Hàng bán đều đặn thì gần như khỏi nghĩ về đặt hàng nữa.

**Bước 3 — nhìn xa hơn:**
> "Với tốc độ này thì hàng nào sắp cạn?"

→ chiếu tồn tương lai: bao nhiêu ngày nữa hết, rủi ro CAO khi thời gian còn lại ngắn hơn thời gian NCC giao — tức đặt hôm nay cũng chỉ vừa kịp.

💡 Khác min-max thường ở chỗ: điểm đặt lại **tự cập nhật theo nhu cầu thật** mỗi lần chạy automation — bán nhanh lên thì điểm đặt tự nhích lên.

---

## Bài 18 — ABC-XYZ: biết hàng nào đáng tự động hóa (3 phút) ⭐ v2.1

ABC cho biết hàng nào **đáng tiền**; XYZ cho biết hàng nào **dễ đoán**. Ghép lại thành ma trận 9 ô:

> "Chạy phân tích ABC-XYZ"

| | X (ổn định) | Y (dao động) | Z (thất thường) |
|---|---|---|---|
| **A** (đáng tiền) | 🏆 Tự động hóa mạnh | Theo dõi sát | Mua theo đơn, đừng ôm |
| **B** | Auto-reorder chuẩn | Min-max thường | Tồn thấp |
| **C** | Đặt lô lớn thưa | Gộp đơn định kỳ | Cân nhắc bỏ SKU |

Nhóm **AX** là mỏ vàng: đặt tham số bổ hàng (Bài 17) cho nhóm này trước, hệ lo phần còn lại.

**Hàng chết thì sao?**
> "Hàng nào ế 3 tháng nay?" → danh sách kèm **vốn đọng** từng món — biết chính xác bao nhiêu tiền đang nằm im để quyết giảm giá/thanh lý.

**Cho chủ doanh nghiệp lười:** dặn Tiểu Tâm (hoặc để host chạy tự động mỗi đêm):
> "Cập nhật dự báo kho" → một lệnh chạy cả pipeline: thống kê → dự báo → cập nhật điểm đặt → quét cảnh báo. Có log minh bạch từng lần chạy.

---

## Checklist onboarding 7 ngày (Tiểu Tâm theo dõi và nhắc)

- [ ] Ngày 1: thêm 3 mặt hàng đầu tiên + nhập tồn đầu kỳ
- [ ] Ngày 1: hỏi thử "còn bao nhiêu" — quen với khái niệm khả dụng
- [ ] Ngày 2: xuất kho đơn đầu tiên
- [ ] Ngày 3: đặt định mức tồn tối thiểu cho hàng bán chạy
- [ ] Ngày 4: thử giữ hàng cho một đơn hẹn lấy sau
- [ ] Ngày 5: nếu có hàng hạn dùng — bật track_lot cho nhóm đó
- [ ] Ngày 6: khai quy đổi thùng↔lẻ cho hàng mua sỉ bán lẻ; thử quét barcode
- [ ] Ngày 7: kiểm kê nhỏ 3-5 mặt hàng để quen quy trình 2 bước
- [ ] Tuần 2: nhập danh mục + tồn từ Excel nếu còn dữ liệu cũ; đặt rule min-max cho top hàng bán chạy
- [ ] Cuối tháng: chạy ABC lần đầu, xem hàng tồn già
- [ ] Cuối tháng: chạy ABC-XYZ, đặt tham số bổ hàng cho nhóm AX; xem hàng chết + vốn đọng

Hoàn thành checklist = đã dùng đủ 29 năng lực của module. 🎓
