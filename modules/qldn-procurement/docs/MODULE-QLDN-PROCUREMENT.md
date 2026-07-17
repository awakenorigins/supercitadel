# QLDN Procurement

Beat 12 mở module `qldn-procurement` với supplier master duy nhất toàn hệ.

## Scope Beat 12
- `qpr_suppliers` là master NCC lifecycle; `ketoan10a.contacts(type=VENDOR/BOTH)` chỉ là đối tác kế toán/công nợ, liên thông mềm qua `accounting_contact_id`/event.
- 3-NCC: PR từ 2.000.000đ trở lên phải có ít nhất 3 `qpr_supplier_quotes` từ 3 supplier khác nhau trước submit.
- Threshold workflow: dùng definition `vanhanh.qt-mua-hang-de-ban`; ngưỡng 20.000.000đ thêm GĐ tài chính theo QT mua hàng để bán. Service phân loại route 2tr/5tr/20tr để UI/Beat 13 dùng tiếp.
- PR approved tạo PO idempotent; goods receipt chỉ emit event cho inventory tham chiếu, không ghi bảng inventory.

## HR Plus backfill note
`qhr_training_vendor_proposals.vendor_ref` có thể nullable soft-ref sang `qpr_suppliers.id` ở Beat sau. Beat 12 chỉ ghi contract liên thông, không sửa `qldn-hr-plus` để tránh phá module đã pass.

## Beat 13 còn lại
Routes/UI đầy đủ, đấu thầu mua 4-5 cấp, service acceptance sâu, docs route builder.
