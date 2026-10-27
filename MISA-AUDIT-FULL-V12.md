# MISA SME 2026 — FULL AUDIT V12

Nguồn: `/root/.openclaw/workspace/Super-Manager-Module/Joli-Poli-Misa/MISA-JSC/MISA SME 2026`

Ghi chú: tên file trong kho có suffix rác từ crawler; báo cáo hiển thị tên đã strip suffix khi cần.

## Mục lục
1. Bản đồ cấu trúc kho
2. Template/ImportExcel — mẫu import và header chuẩn
3. Template/Tax — BC26_AC_2014 và MISA_Config_Template
4. ReportTemplate — nhãn/cột form kế toán lõi
5. ImportConfig và XMLTemplate
6. Dấu vết số chứng từ, đa tiền tệ, TSCĐ, hệ thống TK
7. Resources viVI.json — field màn hình nhập liệu
8. Gợi ý áp dụng cho ke-toan-10a


## 1. Bản đồ cấu trúc toàn kho

- `.` — 0 file trực tiếp; ext {}; 
- `Bin` — 41 file trực tiếp; ext {'.dll unknown more info (alt + →)': 20, '.txt': 7, '.log': 1, '.mqe': 5, '.xml': 4, '.pak': 1, '.exe unknown more info (alt + →)': 1, '.bat unknown more info (alt + →)': 1, '.xslt': 1}; 
- `EInvoiceTemplate` — 12 file trực tiếp; ext {'.mrt': 9, '.xml': 2, '.png image more info (alt + →)': 1}; template hóa đơn điện tử/email
- `ImportConfig` — 2 file trực tiếp; ext {'.lyt': 1, '.cfg': 1}; cấu hình import/map trường
- `Layout` — 12 file trực tiếp; ext {'.lyt': 10, '.xml': 2}; layout UI/in ấn
- `MISA Remote Support` — 5 file trực tiếp; ext {'.chm unknown more info (alt + →)': 1, '.ico image more info (alt + →)': 2, '.exe unknown more info (alt + →)': 2}; 
- `MISALending` — 1 file trực tiếp; ext {'.html html more info (alt + →)': 1}; 
- `MarketingBankHubOffline` — 1 file trực tiếp; ext {'.htm html more info (alt + →)': 1}; 
- `Report` — 0 file trực tiếp; ext {}; khối báo cáo
- `Template` — 0 file trực tiếp; ext {}; khối template dữ liệu
- `Unikey` — 0 file trực tiếp; ext {}; 
- `XMLTemplate` — 2 file trực tiếp; ext {'.xml': 2}; XML mẫu/dataset cho nghiệp vụ tích hợp
- `Bin/WebViewX86` — 41 file trực tiếp; ext {'.dll unknown more info (alt + →)': 25, '.pak': 3, '.exe unknown more info (alt + →)': 3, '.dat': 3, '.sccd': 1, '.bin': 1, '.sig': 2, '.bat unknown more info (alt + →)': 1, '.json unknown more info (alt + →)': 1, '.manifest': 1}; 
- `Bin/en` — 4 file trực tiếp; ext {'.dll unknown more info (alt + →)': 4}; 
- `Bin/ko` — 2 file trực tiếp; ext {'.dll unknown more info (alt + →)': 2}; 
- `Bin/locales` — 50 file trực tiếp; ext {'.pak': 50}; 
- `Bin/runtimes` — 0 file trực tiếp; ext {}; 
- `Bin/vi` — 5 file trực tiếp; ext {'.dll unknown more info (alt + →)': 5}; 
- `Bin/vi-VN` — 6 file trực tiếp; ext {'.dll unknown more info (alt + →)': 6}; 
- `Bin/x86` — 21 file trực tiếp; ext {'.dll unknown more info (alt + →)': 10, '.pak': 3, '.xml': 1, '.bin': 2, '.txt': 2, '.dat': 1, '.json unknown more info (alt + →)': 1, '.exe unknown more info (alt + →)': 1}; 
- `Bin/zh` — 2 file trực tiếp; ext {'.dll unknown more info (alt + →)': 2}; 
- `EInvoiceTemplate/EmailTemplateEditor` — 11 file trực tiếp; ext {'.css css more info (alt + →)': 1, '.js javascript more info (alt + →)': 6, '.html html more info (alt + →)': 1, '.md': 3}; template hóa đơn điện tử/email
- `MarketingBankHubOffline/Image` — 2 file trực tiếp; ext {'.png image more info (alt + →)': 2}; 
- `MarketingBankHubOffline/MarkettingBankHub_files` — 4 file trực tiếp; ext {'.css css more info (alt + →)': 4}; 
- `Report/CustomizeReport` — 0 file trực tiếp; ext {}; báo cáo tùy biến/user-custom reports
- `Report/PaymentOrderLogo` — 7 file trực tiếp; ext {'.png image more info (alt + →)': 4, '.jpg image more info (alt + →)': 3}; khối báo cáo
- `Report/PreviewReport` — 50 file trực tiếp; ext {'.png image more info (alt + →)': 50}; khối báo cáo
- `Report/ReportLocalization` — 1 file trực tiếp; ext {'.xml': 1}; khối báo cáo
- `Report/ReportTemplate` — 50 file trực tiếp; ext {'.mrt': 41, '.rst': 9}; Stimulsoft .mrt/.rst report forms/templates
- `Report/VATBackGround` — 7 file trực tiếp; ext {'.png image more info (alt + →)': 5, '.gif image more info (alt + →)': 2}; khối báo cáo
- `Template/IPRegister` — 4 file trực tiếp; ext {'.doc microsoft word more info (alt + →)': 4}; khối template dữ liệu
- `Template/ImportExcel` — 48 file trực tiếp; ext {'.xls': 42, '.xlsx': 6}; mẫu Excel import chứng từ/danh mục
- `Template/ListMergeField` — 23 file trực tiếp; ext {'.xls': 23}; khối template dữ liệu
- `Template/ListMergeFieldSample` — 10 file trực tiếp; ext {'.xls': 10}; khối template dữ liệu
- `Template/ReportChart` — 7 file trực tiếp; ext {'.xlsx': 7}; khối báo cáo
- `Template/Resources` — 4 file trực tiếp; ext {'.json unknown more info (alt + →)': 4}; khối template dữ liệu
- `Template/Tax` — 31 file trực tiếp; ext {'.xls': 31}; mẫu tờ khai/thuế Excel
- `Template/TemplateCopySME` — 2 file trực tiếp; ext {'.html html more info (alt + →)': 1, '.css css more info (alt + →)': 1}; khối template dữ liệu
- `Unikey/42RC4` — 2 file trực tiếp; ext {'.exe unknown more info (alt + →)': 1, '.txt': 1}; 
- `XMLTemplate/DataSet` — 50 file trực tiếp; ext {'.xml': 50}; XML mẫu/dataset cho nghiệp vụ tích hợp

### Các cụm đáng chú ý

- `Report/ReportTemplate` — tổng 50 file; {'.mrt': 41, '.rst': 9}
- `Report/CustomizeReport` — tổng 0 file; {}
- `Template/ImportExcel` — tổng 52 file; {'.xls': 42, '.xlsx': 6, '.zip compressed archive more info (alt + →)': 4}
- `Template/ImportExcel/RealName` — tổng 2 file; {'.zip compressed archive more info (alt + →)': 2}
- `Template/ImportExcel/ClossingAverage` — tổng 2 file; {'.zip compressed archive more info (alt + →)': 2}
- `Template/Tax` — tổng 31 file; {'.xls': 31}
- `XMLTemplate` — tổng 52 file; {'.xml': 52}
- `XMLTemplate/DataSet` — tổng 50 file; {'.xml': 50}
- `ImportConfig` — tổng 2 file; {'.lyt': 1, '.cfg': 1}
- `Layout` — tổng 12 file; {'.lyt': 10, '.xml': 2}
- `EInvoiceTemplate` — tổng 339 file; {'.js javascript more info (alt + →)': 186, '.png image more info (alt + →)': 69, '.gif image more info (alt + →)': 29, '.css css more info (alt + →)': 28, '.md': 10, '.mrt': 9, '.html html more info (alt + →)': 4, '.xml': 2}
- `EInvoiceTemplate/EmailTemplateEditor` — tổng 327 file; {'.js javascript more info (alt + →)': 186, '.png image more info (alt + →)': 68, '.gif image more info (alt + →)': 29, '.css css more info (alt + →)': 28, '.md': 10, '.html html more info (alt + →)': 4, '.txt': 2}
- `EInvoiceTemplate/EmailTemplateEditor/skins` — tổng 45 file; {'.png image more info (alt + →)': 22, '.css css more info (alt + →)': 20, '.md': 2, '.gif image more info (alt + →)': 1}
- `EInvoiceTemplate/EmailTemplateEditor/skins/moono-lisa` — tổng 22 file; {'.png image more info (alt + →)': 11, '.css css more info (alt + →)': 9, '.md': 1, '.gif image more info (alt + →)': 1}
- `EInvoiceTemplate/EmailTemplateEditor/skins/moono-lisa/images` — tổng 10 file; {'.png image more info (alt + →)': 9, '.gif image more info (alt + →)': 1}

## 2. Template/ImportExcel — mẫu import và header chuẩn

Tìm thấy 48 file Excel import.

- `Template/ImportExcel/B01-DN_01_Summary.xls`
- `Template/ImportExcel/B01-DN_01_UNIFY.xls`
- `Template/ImportExcel/B02-DN_01_Summary.xls`
- `Template/ImportExcel/B02-DN_01_UNIFY.xls`
- `Template/ImportExcel/B03-DN_01_Summary.xls`
- `Template/ImportExcel/B03-DN_01_UNIFY.xls`
- `Template/ImportExcel/Ban_hang.xls`
- `Template/ImportExcel/Ban_hang_TT.xls`
- `Template/ImportExcel/Ban_hang_TT_VND.xls`
- `Template/ImportExcel/Ban_hang_VND.xls`
- `Template/ImportExcel/Bang_luong_co_dinh.xls`
- `Template/ImportExcel/Bang_luong_tam_ung.xls`
- `Template/ImportExcel/Bang_luong_theo_buoi.xls`
- `Template/ImportExcel/Bang_luong_theo_gio.xls`
- `Template/ImportExcel/Bao_gia.xls`
- `Template/ImportExcel/Bao_gia_VND.xls`
- `Template/ImportExcel/CSG_cho_mat_hang_va_khach_hang.xlsx`
- `Template/ImportExcel/CSG_cho_mat_hang_va_nhom_khach_hang.xlsx`
- `Template/ImportExcel/CSG_cho_mat_hang_va_tat_ca_khach_hang.xlsx`
- `Template/ImportExcel/CSG_cho_nhom_mat_hang_va_khach_hang.xlsx`
- `Template/ImportExcel/CSG_cho_nhom_mat_hang_va_nhom_khach_hang.xlsx`
- `Template/ImportExcel/CSG_cho_nhom_mat_hang_va_tat_ca_khach_hang.xlsx`
- `Template/ImportExcel/Chi_phi_do_dang_DTTHCP.xls`
- `Template/ImportExcel/Chi_phi_do_dang_cong_trinh.xls`
- `Template/ImportExcel/Chi_phi_do_dang_don_hang.xls`
- `Template/ImportExcel/Chi_phi_do_dang_hop_dong.xls`
- `Template/ImportExcel/Chi_phi_tra_truoc.xls`
- `Template/ImportExcel/Chi_phi_tra_truoc_dau_ky.xls`
- `Template/ImportExcel/Chung_tu_khau_tru_thue_TNCN.xls`
- `Template/ImportExcel/Chung_tu_mua_dich_vu_chua_thanh_toan.xls`
- `Template/ImportExcel/Chung_tu_mua_dich_vu_chua_thanh_toan_VND.xls`
- `Template/ImportExcel/Chung_tu_quyet_toan_tam_ung.xls`
- `Template/ImportExcel/Chung_tu_quyet_toan_tam_ung_VND.xls`
- `Template/ImportExcel/Chuyen_tien_noi_bo.xls`
- `Template/ImportExcel/Chuyen_tien_noi_bo_VND.xls`
- `Template/ImportExcel/Cong_cu_dung_cu_dau_ky.xls`
- `Template/ImportExcel/Cong_cu_dung_cu_ghi_tang.xls`
- `Template/ImportExcel/Cong_no_dau_ky_khach_hang.xls`
- `Template/ImportExcel/Cong_no_dau_ky_khach_hang_VND.xls`
- `Template/ImportExcel/Cong_no_dau_ky_nha_cung_cap.xls`
- `Template/ImportExcel/Cong_no_dau_ky_nha_cung_cap_VND.xls`
- `Template/ImportExcel/Cong_no_dau_ky_nhan_vien.xls`
- `Template/ImportExcel/Cong_no_dau_ky_nhan_vien_VND.xls`
- `Template/ImportExcel/Danh_muc_VTHH_cap_nhat_gia_nhap_kho.xls`
- `Template/ImportExcel/Danh_muc_nguoi_phu_thuoc_nhan_vien.xls`
- `Template/ImportExcel/Dinh_muc_nguyen_vat_lieu_cong_trinh.xls`
- `Template/ImportExcel/Do_dang_dau_ky_DTTHCP.xls`
- `Template/ImportExcel/demo.xls`

### Headers các file quan trọng


#### `Template/ImportExcel/Ban_hang.xls`
- Sheet `Chứng từ bán hàng` (dòng header đoán: 1): Hiển thị trên sổ; Hình thức bán hàng; Phương thức thanh toán; Kiêm phiếu xuất kho; XK vào khu phi thuế quan và các TH được coi như XK; Lập kèm hóa đơn; Đã lập hóa đơn; Ngày hạch toán (*); Ngày chứng từ (*); Số chứng từ (*); Số phiếu xuất; Lý do xuất; Mẫu số HĐ; Ký hiệu HĐ; Số hóa đơn; Ngày hóa đơn; Mã khách hàng; Tên khách hàng; Địa chỉ; Mã số thuế; Diễn giải; Nộp vào TK; NV bán hàng; Loại tiền; Tỷ giá; Mã hàng (*); Tên hàng; Hàng khuyến mại; TK Tiền/Chi phí/Nợ (*); TK Doanh thu/Có (*); ĐVT; Số lượng; Đơn giá sau thuế; Đơn giá; Thành tiền; Thành tiền quy đổi; Tỷ lệ CK (%); Tiền chiết khấu; Tiền chiết khấu quy đổi; TK chiết khấu; Giá tính thuế XK; % thuế XK; Tiền thuế XK; TK thuế XK; % thuế GTGT; Tỷ lệ tính thuế (Thuế suất KHAC); Tiền thuế GTGT; Tiền thuế GTGT quy đổi; TK thuế GTGT; HH không TH trên tờ khai thuế GTGT; Kho; TK giá vốn; TK Kho; Đơn giá vốn; Tiền vốn; Hàng hóa giữ hộ/bán hộ

#### `Template/ImportExcel/Ban_hang_TT.xls`
- Sheet `Chứng từ bán hàng` (dòng header đoán: 1): Hiển thị trên sổ; Hình thức bán hàng; Là hóa đơn giảm thuế GTGT; Phương thức thanh toán; Kiêm phiếu xuất kho; XK vào khu phi thuế quan và các TH được coi như XK; Lập kèm hóa đơn; Đã lập hóa đơn; Ngày hạch toán (*); Ngày chứng từ (*); Số chứng từ (*); Số phiếu xuất; Lý do xuất; Mẫu số HĐ; Ký hiệu HĐ; Số hóa đơn; Ngày hóa đơn; Mã khách hàng; Tên khách hàng; Địa chỉ; Mã số thuế; Diễn giải; Nộp vào TK; NV bán hàng; Loại tiền; Tỷ giá; Mã hàng (*); Tên hàng; Nhóm ngành nghề; Hàng khuyến mại; TK Tiền/Chi phí/Nợ (*); TK Doanh thu/Có (*); ĐVT; Số lượng; Đơn giá; Thành tiền; Thành tiền quy đổi; Tỷ lệ CK (%); Tiền chiết khấu; Tiền chiết khấu quy đổi; TK chiết khấu; Giá tính thuế XK; % thuế XK; Tiền thuế XK; TK thuế XK; Thuế GTGT được giảm; Thuế GTGT được giảm quy đổi; TK thuế GTGT; Kho; TK giá vốn; TK Kho; Đơn giá vốn; Tiền vốn; Hàng hóa giữ hộ/bán hộ

#### `Template/ImportExcel/Ban_hang_TT_VND.xls`
- Sheet `Chứng từ bán hàng` (dòng header đoán: 1): Hiển thị trên sổ; Hình thức bán hàng; Là hóa đơn giảm thuế GTGT; Phương thức thanh toán; Kiêm phiếu xuất kho; XK vào khu phi thuế quan và các TH được coi như XK; Lập kèm hóa đơn; Đã lập hóa đơn; Ngày hạch toán (*); Ngày chứng từ (*); Số chứng từ (*); Số phiếu xuất; Lý do xuất; Số hóa đơn; Ngày hóa đơn; Mã khách hàng; Tên khách hàng; Địa chỉ; Mã số thuế; Diễn giải; Nộp vào TK; NV bán hàng; Mã hàng (*); Tên hàng; Nhóm ngành nghề; Hàng khuyến mại; TK Tiền/Chi phí/Nợ (*); TK Doanh thu/Có (*); ĐVT; Số lượng; Đơn giá; Thành tiền; Tỷ lệ CK (%); Tiền chiết khấu; TK chiết khấu; Giá tính thuế XK; % thuế XK; Tiền thuế XK; TK thuế XK; Thuế GTGT được giảm; Thuế GTGT được giảm quy đổi; TK thuế GTGT; Kho; TK giá vốn; TK Kho; Đơn giá vốn; Tiền vốn; Hàng hóa giữ hộ/bán hộ

#### `Template/ImportExcel/Ban_hang_VND.xls`
- Sheet `Chứng từ bán hàng` (dòng header đoán: 1): Hiển thị trên sổ; Hình thức bán hàng; Phương thức thanh toán; Kiêm phiếu xuất kho; XK vào khu phi thuế quan và các TH được coi như XK; Lập kèm hóa đơn; Đã lập hóa đơn; Ngày hạch toán (*); Ngày chứng từ (*); Số chứng từ (*); Số phiếu xuất; Lý do xuất; Số hóa đơn; Ngày hóa đơn; Mã khách hàng; Tên khách hàng; Địa chỉ; Mã số thuế; Diễn giải; Nộp vào TK; NV bán hàng; Mã hàng (*); Tên hàng; Hàng khuyến mại; TK Tiền/Chi phí/Nợ (*); TK Doanh thu/Có (*); ĐVT; Số lượng; Đơn giá sau thuế; Đơn giá; Thành tiền; Tỷ lệ CK (%); Tiền chiết khấu; TK chiết khấu; Giá tính thuế XK; % thuế XK; Tiền thuế XK; TK thuế XK; % thuế GTGT; Tỷ lệ tính thuế (Thuế suất KHAC); Tiền thuế GTGT; TK thuế GTGT; HH không TH trên tờ khai thuế GTGT; Kho; TK giá vốn; TK Kho; Đơn giá vốn; Tiền vốn; Hàng hóa giữ hộ/bán hộ

#### `Template/ImportExcel/Bang_luong_co_dinh.xls`
- Sheet `Bảng lương cố định` (dòng header đoán: 1): Mã nhân viên (*); Chức danh; Hệ số lương; Lương cơ bản; Phụ cấp thuộc quỹ lương; Phụ cấp khác; Tổng số; Số tiền tạm ứng; Lương đóng BH; BHXH nhân viên đóng; BHYT nhân viên đóng; BHTN nhân viên đóng; KPCĐ nhân viên đóng; Thuế TNCN; Cộng; Giảm trừ gia cảnh; Tổng thu nhập chịu thuế TNCN; Thu nhập tính thuế TNCN; Số tiền còn được lĩnh; BHXH công ty đóng; BHYT công ty đóng; BHTN công ty đóng; KPCĐ công ty đóng

#### `Template/ImportExcel/Bang_luong_tam_ung.xls`
- Sheet `Bảng lương tạm ứng` (dòng header đoán: 1): Mã nhân viên (*); Chức danh; Số tiền tạm ứng

#### `Template/ImportExcel/Bang_luong_theo_buoi.xls`
- Sheet `Bảng lương theo buổi` (dòng header đoán: 1): Mã nhân viên (*); Chức danh; Hệ số lương; Lương cơ bản; Đơn giá ngày công; Số ngày công (hưởng 100% lương); Số tiền (hưởng 100% lương); Số ngày công (không hưởng 100% lương); Số công tính theo tỷ lệ hưởng (không hưởng 100% lương); Số tiền (không hưởng 100% lương); Số giờ công (làm thêm); Số công làm thêm tính theo tỷ lệ hưởng (làm thêm); Số tiền (làm thêm); Phụ cấp thuộc quỹ lương; Phụ cấp khác; Tổng số; Số tiền tạm ứng; Lương đóng BH; BHXH nhân viên đóng; BHYT nhân viên đóng; BHTN nhân viên đóng; KPCĐ nhân viên đóng; Thuế TNCN; Cộng; Giảm trừ gia cảnh; Tổng thu nhập chịu thuế TNCN; Thu nhập tính thuế TNCN; Số tiền còn được lĩnh; BHXH công ty đóng; BHYT công ty đóng; BHTN công ty đóng; KPCĐ công ty đóng

#### `Template/ImportExcel/Bang_luong_theo_gio.xls`
- Sheet `Bảng lương theo giờ` (dòng header đoán: 1): Mã nhân viên (*); Chức danh; Hệ số lương; Lương cơ bản; Đơn giá giờ công; Số giờ công (hưởng 100% lương); Số tiền (hưởng 100% lương); Số giờ công (không hưởng 100% lương); Số công tính theo tỷ lệ hưởng (không hưởng 100% lương); Số tiền (không hưởng 100% lương); Số giờ công (làm thêm); Số công làm thêm tính theo tỷ lệ hưởng (làm thêm); Số tiền (làm thêm); Phụ cấp thuộc quỹ lương; Phụ cấp khác; Tổng số; Số tiền tạm ứng; Lương đóng BH; BHXH nhân viên đóng; BHYT nhân viên đóng; BHTN nhân viên đóng; KPCĐ nhân viên đóng; Thuế TNCN; Cộng; Giảm trừ gia cảnh; Tổng thu nhập chịu thuế TNCN; Thu nhập tính thuế TNCN; Số tiền còn được lĩnh; BHXH công ty đóng; BHYT công ty đóng; BHTN công ty đóng; KPCĐ công ty đóng

#### `Template/ImportExcel/CSG_cho_mat_hang_va_khach_hang.xlsx`
- Sheet `ERROR` (dòng header đoán: None): Excel xlsx file; not supported / openpyxl: openpyxl does not support .xlsx microsoft excel more info (alt + →) file format, please check you can open it with Excel first. Supported formats are: .xlsx,.xlsm,.xltx,.xltm

#### `Template/ImportExcel/CSG_cho_mat_hang_va_nhom_khach_hang.xlsx`
- Sheet `ERROR` (dòng header đoán: None): Excel xlsx file; not supported / openpyxl: openpyxl does not support .xlsx microsoft excel more info (alt + →) file format, please check you can open it with Excel first. Supported formats are: .xlsx,.xlsm,.xltx,.xltm

#### `Template/ImportExcel/CSG_cho_mat_hang_va_tat_ca_khach_hang.xlsx`
- Sheet `ERROR` (dòng header đoán: None): Excel xlsx file; not supported / openpyxl: openpyxl does not support .xlsx microsoft excel more info (alt + →) file format, please check you can open it with Excel first. Supported formats are: .xlsx,.xlsm,.xltx,.xltm

#### `Template/ImportExcel/CSG_cho_nhom_mat_hang_va_khach_hang.xlsx`
- Sheet `ERROR` (dòng header đoán: None): Excel xlsx file; not supported / openpyxl: openpyxl does not support .xlsx microsoft excel more info (alt + →) file format, please check you can open it with Excel first. Supported formats are: .xlsx,.xlsm,.xltx,.xltm

#### `Template/ImportExcel/CSG_cho_nhom_mat_hang_va_nhom_khach_hang.xlsx`
- Sheet `ERROR` (dòng header đoán: None): Excel xlsx file; not supported / openpyxl: openpyxl does not support .xlsx microsoft excel more info (alt + →) file format, please check you can open it with Excel first. Supported formats are: .xlsx,.xlsm,.xltx,.xltm

#### `Template/ImportExcel/CSG_cho_nhom_mat_hang_va_tat_ca_khach_hang.xlsx`
- Sheet `ERROR` (dòng header đoán: None): Excel xlsx file; not supported / openpyxl: openpyxl does not support .xlsx microsoft excel more info (alt + →) file format, please check you can open it with Excel first. Supported formats are: .xlsx,.xlsm,.xltx,.xltm

#### `Template/ImportExcel/Chi_phi_do_dang_DTTHCP.xls`
- Sheet `CP dở dang từ năm trước` (dòng header đoán: 1): Mã đối tượng THCP; NVL trực tiếp; Nhân công trực tiếp; NVL gián tiếp; Nhân công gián tiếp; Khấu hao; Chi phí mua ngoài; Chi phí chung/Chi phí khác; Tài khoản CPSXKD dở dang

#### `Template/ImportExcel/Chi_phi_do_dang_cong_trinh.xls`
- Sheet `CP dở dang CTVV từ năm trước` (dòng header đoán: 1): Mã công trình (*); CP không hợp lý; NVL trực tiếp; Nhân công trực tiếp; NVL gián tiếp (Máy thi công); Nhân công (Máy thi công); Khấu hao (Máy thi công); Chi phí mua ngoài (Máy thi công); Chi phí khác (Máy thi công)/Chi phí Máy thi công; NVL gián tiếp; Nhân công gián tiếp; Khấu hao; Chi phí mua ngoài; Chi phí khác/Chi phí chung; Số đã nghiệm thu; TK CPSXKD dở dang

#### `Template/ImportExcel/Chi_phi_do_dang_don_hang.xls`
- Sheet `CP dở dang ĐH từ năm trước` (dòng header đoán: 1): Số đơn hàng (*); CP không hợp lý; NVL trực tiếp; Nhân công trực tiếp; NVL gián tiếp; Nhân công gián tiếp; Khấu hao; Chi phí mua ngoài; Chi phí khác/Chi phí chung; Số đã nghiệm thu; TK CPSXKD dở dang

#### `Template/ImportExcel/Chi_phi_do_dang_hop_dong.xls`
- Sheet `CP dở dang HĐ từ năm trước` (dòng header đoán: 1): Nhập chi tiết theo các yếu tố chi phí; Hợp đồng (*); CP không hợp lý; NVL trực tiếp; Nhân công trực tiếp; NVL gián tiếp; Nhân công gián tiếp; Khấu hao; Chi phí mua ngoài; Chi phí khác/Chi phí chung; Số đã nghiệm thu; TK CPSXKD dở dang

#### `Template/ImportExcel/Chi_phi_tra_truoc.xls`
- Sheet `Chi phi tra truoc` (dòng header đoán: 1): Mã CP trả trước (*); Tên CP trả trước (*); Ngày ghi nhận (*); Số tiền (*); Số kỳ phân bổ (*); Số tiền phân bổ hàng kỳ (*); TK chờ phân bổ (*); Đối tượng phân bổ; Tỷ lệ phân bổ (*); TK chi phí (*); Khoản mục chi phí

#### `Template/ImportExcel/Chi_phi_tra_truoc_dau_ky.xls`
- Sheet `Chi phi tra truoc dau ky` (dòng header đoán: 1): Mã CP trả trước (*); Tên CP trả trước (*); Ngày ghi nhận (*); Số tiền (*); Số kỳ phân bổ (*); Số tiền phân bổ hàng kỳ (*); Số kỳ đã phân bổ (*); Số tiền đã phân bổ (*); TK chờ phân bổ (*); Đối tượng phân bổ; Tỷ lệ phân bổ (*); TK chi phí (*); Khoản mục chi phí

#### `Template/ImportExcel/Chung_tu_khau_tru_thue_TNCN.xls`
- Sheet `ERROR` (dòng header đoán: None): Excel xlsx file; not supported / openpyxl: openpyxl does not support .xls microsoft excel more info (alt + →) file format, please check you can open it with Excel first. Supported formats are: .xlsx,.xlsm,.xltx,.xltm

#### `Template/ImportExcel/Chung_tu_mua_dich_vu_chua_thanh_toan.xls`
- Sheet `Chứng từ mua dịch vụ` (dòng header đoán: 1): Hiển thị trên sổ; Phương thức thanh toán; Là CP mua hàng; Ngày hạch toán (*); Ngày chứng từ (*); Số chứng từ (*); Mã nhà cung cấp; Tên nhà cung cấp; Địa chỉ; Diễn giải/Lý do chi/Nội dung thanh toán; NV mua hàng; Loại tiền; Tỷ giá; Mã dịch vụ (*); Tên dịch vụ; TK chi phí/TK kho; TK công nợ/TK tiền; Đối tượng; ĐVT; Số lượng; Đơn giá; Thành tiền; Thành tiền quy đổi; % thuế GTGT; Tỷ lệ tính thuế (Thuế suất KHAC); Tiền thuế GTGT; Tiền thuế GTGT quy đổi; TK thuế GTGT; Mẫu số HĐ; Ký hiệu HĐ; Số hóa đơn; Ngày hóa đơn; Nhóm HHDV mua vào; Mã NCC; Tên NCC; Mã số thuế NCC; Địa chỉ NCC

#### `Template/ImportExcel/Chung_tu_mua_dich_vu_chua_thanh_toan_VND.xls`
- Sheet `Chứng từ mua dịch vụ` (dòng header đoán: 1): Hiển thị trên sổ; Phương thức thanh toán; Là CP mua hàng; Ngày hạch toán (*); Ngày chứng từ (*); Số chứng từ (*); Mã nhà cung cấp; Tên nhà cung cấp; Địa chỉ; Diễn giải/Lý do chi/Nội dung thanh toán; NV mua hàng; Mã dịch vụ (*); Tên dịch vụ; TK chi phí/TK kho; TK công nợ/TK tiền; Đối tượng; ĐVT; Số lượng; Đơn giá; Thành tiền; % thuế GTGT; Tỷ lệ tính thuế (Thuế suất KHAC); Tiền thuế GTGT; TK thuế GTGT; Mẫu số HĐ; Ký hiệu HĐ; Số hóa đơn; Ngày hóa đơn; Nhóm HHDV mua vào; Mã NCC; Tên NCC; Mã số thuế NCC; Địa chỉ NCC

#### `Template/ImportExcel/Chung_tu_quyet_toan_tam_ung.xls`
- Sheet `Chứng từ quyết toán tạm ứng` (dòng header đoán: 1): Hiển thị trên sổ; Ngày hạch toán (*); Ngày chứng từ (*); Số chứng từ (*); Quyết toán cho từng lần tạm ứng; Nhân viên; Số tiền quyết toán; Số tiền quyết toán QĐ; Diễn giải; Loại tiền; Tỷ giá; Diễn giải (Hạch toán); TK Nợ (*); TK Có (*); Số tiền; Số tiền quy đổi; Diễn giải thuế; % thuế GTGT; Tỷ lệ tính thuế (Thuế suất KHAC); Tiền thuế GTGT; Tiền thuế GTGT quy đổi; TK thuế GTGT; Đối tượng Nợ; Đối tượng Có; Khoản mục CP; Mẫu số HĐ; Ký hiệu HĐ; Ngày hóa đơn; Số hóa đơn; Nhóm HHDV mua vào; Mã đối tượng; Tên đối tượng; Mã số thuế; Địa chỉ

#### `Template/ImportExcel/Chung_tu_quyet_toan_tam_ung_VND.xls`
- Sheet `Chứng từ quyết toán tạm ứng` (dòng header đoán: 1): Hiển thị trên sổ; Ngày hạch toán (*); Ngày chứng từ (*); Số chứng từ (*); Quyết toán cho từng lần tạm ứng; Nhân viên; Số tiền quyết toán; Diễn giải; Diễn giải (Hạch toán); TK Nợ (*); TK Có (*); Số tiền; Diễn giải thuế; % thuế GTGT; Tỷ lệ tính thuế (Thuế suất KHAC); Tiền thuế GTGT; TK thuế GTGT; Đối tượng Nợ; Đối tượng Có; Khoản mục CP; Mẫu số HĐ; Ký hiệu HĐ; Ngày hóa đơn; Số hóa đơn; Nhóm HHDV mua vào; Mã đối tượng; Tên đối tượng; Mã số thuế; Địa chỉ

#### `Template/ImportExcel/Cong_cu_dung_cu_dau_ky.xls`
- Sheet `Công cụ dụng cụ đầu kỳ` (dòng header đoán: 1): Mã CCDC (*); Tên CCDC (*); Ngày ghi tăng (*); Mã loại CCDC; Lý do ghi tăng; TK chờ phân bổ; Đơn vị tính; Số lượng (*); Đơn giá (*); Giá trị đã phân bổ (*); Tổng số kỳ PB (tháng) (*); Số kỳ PB còn lại (tháng) (*); Số tiền phân bổ hàng kỳ; Mã đơn vị sử dụng (*); Số lượng đơn vị sử dụng (*); Đối tượng phân bổ (*); Tỷ lệ phân bổ (*); TK chi phí (*); Khoản mục chi phí

#### `Template/ImportExcel/Cong_cu_dung_cu_ghi_tang.xls`
- Sheet `Danh sách công cụ dụng cụ ghi t` (dòng header đoán: 1): Mã CCDC (*); Tên CCDC (*); Mã loại CCDC; Lý do ghi tăng; Số chứng từ ghi tăng; Ngày ghi tăng (*); TK chờ phân bổ; Đơn vị tính; Số lượng; Đơn giá; Thành tiền; Tổng số kỳ PB (tháng); Số tiền phân bổ hàng kỳ; Mã đơn vị sử dụng (*); Số lượng đơn vị  sử dụng; Đối tượng phân bổ; Tỷ lệ phân bổ; TK chi phí; Khoản mục chi phí

#### `Template/ImportExcel/Cong_no_dau_ky_khach_hang.xls`
- Sheet `Số dư khách hàng` (dòng header đoán: 1): Số tài khoản (*); Mã khách hàng (*); Loại tiền; Nhân viên; Đơn vị; Công trình; Đơn đặt hàng; Hợp đồng bán; Dư Nợ; Dư Nợ quy đổi; Dư Có; Dư Có quy đổi; Ngày hóa đơn/chứng từ; Số hóa đơn/chứng từ; Hạn thanh toán; Tỷ giá; Giá trị hóa đơn; GT hóa đơn quy đổi; Số còn phải thu; Số còn phải thu quy đổi; Số thu trước; Số thu trước quy đổi; Nhân viên (Hóa đơn)

#### `Template/ImportExcel/Cong_no_dau_ky_khach_hang_VND.xls`
- Sheet `Số dư khách hàng` (dòng header đoán: 1): Số tài khoản (*); Mã khách hàng (*); Nhân viên; Đơn vị; Công trình; Đơn đặt hàng; Hợp đồng bán; Dư Nợ; Dư Có; Ngày hóa đơn/chứng từ; Số hóa đơn/chứng từ; Hạn thanh toán; Giá trị hóa đơn; Số còn phải thu; Số thu trước; Nhân viên (Hóa đơn)

#### `Template/ImportExcel/Cong_no_dau_ky_nha_cung_cap.xls`
- Sheet `Số dư nhà cung cấp` (dòng header đoán: 1): Số tài khoản (*); Mã nhà cung cấp (*); Loại tiền; Nhân viên; Đơn vị; Công trình; Đơn mua hàng; Hợp đồng mua; Dư Nợ; Dư Nợ quy đổi; Dư Có; Dư Có quy đổi; Ngày hóa đơn/chứng từ; Số hóa đơn/chứng từ; Hạn thanh toán; Tỷ giá; Giá trị hóa đơn; GT hóa đơn quy đổi; Số còn phải trả; Số còn phải trả quy đổi; Số trả trước; Số trả trước quy đổi; Nhân viên (Hóa đơn)

#### `Template/ImportExcel/Cong_no_dau_ky_nha_cung_cap_VND.xls`
- Sheet `Số dư nhà cung cấp` (dòng header đoán: 1): Số tài khoản (*); Mã nhà cung cấp (*); Nhân viên; Đơn vị; Công trình; Đơn mua hàng; Hợp đồng mua; Dư Nợ; Dư Có; Ngày hóa đơn/chứng từ; Số hóa đơn/chứng từ; Hạn thanh toán; Giá trị hóa đơn; Số còn phải trả; Số trả trước; Nhân viên (Hóa đơn)

#### `Template/ImportExcel/Cong_no_dau_ky_nhan_vien.xls`
- Sheet `Số dư nhân viên` (dòng header đoán: 1): Số tài khoản (*); Nhân viên (*); Loại tiền; Công trình; Hợp đồng mua; Hợp đồng bán; Dư Nợ; Dư Nợ quy đổi; Dư Có; Dư Có quy đổi

#### `Template/ImportExcel/Cong_no_dau_ky_nhan_vien_VND.xls`
- Sheet `Số dư nhân viên` (dòng header đoán: 1): Số tài khoản (*); Nhân viên (*); Công trình; Hợp đồng mua; Hợp đồng bán; Dư Nợ; Dư Có

#### `Template/ImportExcel/Danh_muc_nguoi_phu_thuoc_nhan_vien.xls`
- Sheet `Danh mục người phụ thuộc` (dòng header đoán: 1): Mã nhân viên (*); Quan hệ (*); Họ và tên (*); Chỉ nhập năm sinh; Ngày sinh; Mã số thuế; Quốc tịch; Loại giấy tờ; Số giấy tờ; Tính giảm trừ từ (*); Tính giảm trừ đến; Quyển sổ; Quốc gia; Tỉnh/TP; Quận/Huyện; Xã/Phường
- Sheet `Data` (dòng header đoán: 1): Chọn quan hệ; Chọn loại giấy tờ

#### `Template/ImportExcel/Do_dang_dau_ky_DTTHCP.xls`
- Sheet `Sheet1` (dòng header đoán: 1): Mã đối tượng THCP; NVL trực tiếp; Nhân công trực tiếp; NVL gián tiếp; Nhân công gián tiếp; Khấu hao; Chi phí mua ngoài; Chi phí khác/Chi phí chung
- Sheet `Sheet2` (dòng header đoán: None): [không đọc được header]
- Sheet `Sheet3` (dòng header đoán: None): [không đọc được header]

## 3. Template/Tax — BC26_AC_2014.xls + MISA_Config_Template.xls


### `Template/Tax/BC26_AC_2014.xls`
- Sheet `BC26_AC` header dòng 19: Từ số; Đến số; Từ số; Đến số; Từ số; Đến số; Cộng; Số lượng; Số; Số lượng; Số; Số lượng; Số
- Sheet `MISA_Config1` header dòng 2: ConfigType; ExcelSheetName; ExcelRowName; GroupName; TableName; Filter; Description
- Sheet `MISA_Config2` header dòng 3: 2.0; 01; B; SortOrder; Số thứ tự
- Sheet `MISA_Config3` header dòng 4: 3.0; BC26_AC'!D10; TASystemData; CompanyTaxCode; 0.0; Mã số thuế:
- Sheet `MISA_Config4` header dòng 2: ConfigType; Position; ValueConfig; Description
- Sheet `MISA_ConfigOther` header dòng 20: 6.0; BC26_AC!F22; 0; 18.0; Validate Từ số; Kiểm tra tính hợp lệ Từ số: Nếu đến số không trống thì từ số không trống và <= đến số; <Tên cột Đến số>
- Sheet `Header` header dòng 2: Mã số thuế; Year; eof

### `Template/Tax/MISA_Config_Template.xls`
- Sheet `Tờ khai` header dòng 22: STT; CHỈ TIÊU; GIÁ TRỊ HHDV; THUẾ GTGT
- Sheet `PL 01-1_GTGT` header dòng 3: STT; Hoá đơn, chứng từ bán; Tên người mua; Mã số thuế người mua; Mặt hàng; Doanh số bán chưa có thuế; Thuế suất (%); Thuế GTGT; Ghi chú; 0.0
- Sheet `PL 01-2_GTGT` header dòng 5: (1); (2); (3); (4); (5); (6); (7); (8); (9); (10); (11); (12)
- Sheet `PL 01-3_GTGT` header dòng 7: (1); (2); (3); (4); (5); (6); (7); (8); (9); (10); (11); (12); (13); (14); (15); (16); (17); (18); (19); (20); (21); (22); (23); (24); (25); (26); (27); (28); (29); (30); (31); (32); (33)
- Sheet `PL 01-4A_GTGT` header dòng 15: STT; Chỉ tiêu; Số tiền
- Sheet `PL 01-4B_GTGT` header dòng 15: STT; Chỉ tiêu; Số tiền
- Sheet `PL 01-5_GTGT` header dòng 3: STT; Số chứng từ nộp tiền thuế; Ngày nộp thuế; Nơi nộp tiền thuế (Kho bạc Nhà nước); Cơ quan thuế quản lý hoạt động kinh doanh xây dựng, lắp đặt, bán hàng, bất động sản ngoại tỉnh; Số tiền thuế đã nộp; Ma CQT; Mã cấp cục
- Sheet `PL 01-6_GTGT` header dòng 3: STT; Tên cơ sở 
sản xuất trực thuộc; Mã số thuế; Cơ quan thuế; Doanh thu của sản phẩm sản xuất 
của cơ sở sản xuất trực thuộc; Số thuế phải nộp 
cho từng địa phương nơi có cơ sở sản xuất trực thuộc; Số thuế phải nộp cho từng địa phương nơi có cơ sở sản xuất trực thuộc trong trường hợp [06] < [16]
- Sheet `PL 01-7_GTGT` header dòng 3: STT; Loại xe; Đơn vị tính; Tổng số lượng xe bán ra; Tổng số lượng xe bán ra cho người tiêu dùng và số lượng xe xuất cho đại lý bán hưởng hoa hồng; Giá bán ghi trên hóa đơn (bao gồm cả thuế giá trị gia tăng); Ghi chú
- Sheet `PL 01-1_TĐ-GTGT` header dòng 4: STT; Tên nhà máy thủy điện; Mã số thuế; Số thuế GTGT đầu ra của hoạt động sản xuất thủy điện; Cơ quan thuế quản lý hoạt động kinh doanh vãng lai; Số thuế GTGT đầu vào của hoạt động sản xuất thủy điện; Số thuế GTGT phải nộp của hoạt động sản xuất thủy điện
- Sheet `PL 01-2_TĐ-GTGT` header dòng 1: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM; Mẫu số:; 01- 1/TĐ-GTGT
- Sheet `KHBS` header dòng 6: STT; Chỉ tiêu điều chỉnh; Mã số chỉ tiêu; Số đã kê khai; Số điều chỉnh; Chênh lệch giữa số điều chỉnh với số đã kê khai
- Sheet `Header` header dòng 2: Mã số thuế; 2; 2; 2; 2; 2; 2; 2; 2; 2; 2; Year; 2014; SoTK
- Sheet `Sheet14` header dòng 2: '='Tờ khai'.B7; 3.0; MaSoThue; mã số thuế
- Sheet `Data` header dòng 4: 1.0; 3.0; HD3; KH3; SHD3; 41978.0; ngọc anh; 102324.0; Bút bi 3; 20000002.0; 1002.0; 1002.0; 122002.0; String; InvNo; Số hóa đơn
- Sheet `draft` header dòng 1: Position; ConfigType; ValueConfig; Description; CauTruc; TenNhom; TenBang; HangExcel; CotExcel; Cot; TenSheet
- Sheet `01_KHBS` header dòng 6: STT; Chỉ tiêu điều chỉnh; Mã số chỉ tiêu; Số đã kê khai; Số điều chỉnh; Chênh lệch giữa số điều chỉnh với số đã kê khai; Hạn nộp (b); 0.0; 0.0
- Sheet `MISA_Config1` header dòng 3: 1.0; 01_KHBS; 9.0; 01GTGTBS1; TAAdjustmentDetail; GroupName='01GTGTBS1'; 1.0; I. Chỉ tiêu điều chỉnh tăng số thuế phải nộp
- Sheet `MISA_Config2` header dòng 3: 2.0; 01GTGTBS1; C; DescriptionName; Chỉ tiêu điều chỉnh
- Sheet `MISA_Config3` header dòng 3: 3.0; 01_KHBS'!D22; TADeclarationGeneral; KHBS1; 9.0; Số ngày nộp chậm
- Sheet `MISA_Config4` header dòng 2: ConfigType; Position; ValueConfig; Description
- Sheet `MISA_ConfigOther` header dòng 9: 11.0; Tờ khai'!L47; 7;True; Định dạng số tiền quy đổi (True: Xác định đây có phải là dòng Tổng không để không thay đổi Canfocus, backcolor - Ngầm định là False)
- Sheet `Ý nghĩa các config` header dòng 30: 28.0; AdditionDeclarationItemList; Chỉ tiêu so sánh cho bảng giải trình kê khai bổ sung (chỉ dùng cho sinh dữ liệu cho sheet bổ sung)
Không sử dụng chung được; Config trên sheet MISA_ConfigOther
- ConfigType: 28
- Position: không liên quan
- ValueConfig: 
+ Code fix 2 loại config: Value1;Value2 (2 tham số) hoặc Value1;Value2;Value3( 3 tham số); Item30a;KHBS2;KHBS1 (Chỉ tiêu Item30a của Tờ khai mới nếu lớn hơn chỉ tiêu Item30a của Tờ khai cũ thì set vào chỉ tiêu KHBS2 của Bản giải trình bổ sung, nếu không thì set vào chỉ tiêu KHBS1)

'Item32;KHBS3 (Chỉ tiêu Item32 luôn set vào chỉ tiêu KHBS3 của Bản giải trình bổ sung)

## 4. Report/ReportTemplate — nhãn/cột form kế toán lõi


### `Report/ReportTemplate/AccountingVoucher.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String; ReportFormNoOther,System.String; ReportTitle,System.String

### `Report/ReportTemplate/AccountingVoucherDetail.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String; ReportFormNoOther,System.String; ReportTitle,System.String

### `Report/ReportTemplate/AccountingVoucherExchange.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String; ReportFormNoOther,System.String; ReportTitle,System.String

### `Report/ReportTemplate/AgribankUNC.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; IsShowBarcodeWhenPrintReportVoucher,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankNameWithBranch,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String

### `Report/ReportTemplate/AgribankUNC_A5.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; IsShowBarcodeWhenPrintReportVoucher,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankNameWithBranch,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String

### `Report/ReportTemplate/Announcement_Of_Debt.rst`
THÔNG BÁO CÔNG NỢ; Ngày in:; Kính gửi; Kỳ; Đơn vị:..................................&#xD;&#xA;; Số dư đầu kỳ; Mã số thuế:............................; Số dư cuối kỳ; Địa chỉ:....................................; Diễn giải; Số chứng từ; Ngày; Số dư; Số tiền; Chưa đến hạn; Quá hạn 1-30 ngày; Quá hạn 31-60 ngày; Tổng số&#xD;&#xA;dư Nợ; Quá hạn 61-90 ngày; Quá hạn trên 120 ngày; Quá hạn 91 - 120 ngày; Không có hạn nợ; Người lập phiếu; (Ký, họ tên)

### `Report/ReportTemplate/Announcement_Of_Debt_CCY.rst`
THÔNG BÁO CÔNG NỢ; Ngày in:; Kính gửi; Kỳ; Đơn vị:..................................&#xD;&#xA;; Số dư đầu kỳ; Mã số thuế:............................; Đơn vị tiền tệ:; Địa chỉ:....................................; Diễn giải; Số chứng từ; Ngày; Số dư; Số tiền; Tỷ giá; Chưa đến hạn; Quá hạn 1-30 ngày; Quá hạn 31-60 ngày; Tổng số&#xD;&#xA;dư Nợ; Quá hạn 61-90 ngày; Quá hạn trên 120 ngày; Quá hạn 91 - 120 ngày; Không có hạn nợ; Người lập phiếu; (Ký, họ tên); Số dư cuối kỳ

### `Report/ReportTemplate/Announcement_Of_Debt_Supplier.rst`
THÔNG BÁO CÔNG NỢ VỚI NHÀ CUNG CẤP; Ngày in:; Kính gửi; Kỳ; Đơn vị:..................................&#xD;&#xA;; Số dư đầu kỳ; Mã số thuế:............................; Số dư cuối kỳ; Địa chỉ:....................................; Diễn giải; Số chứng từ; Ngày; Số dư; Số tiền; Chưa đến hạn; Quá hạn 1-30 ngày; Quá hạn 31-60 ngày; Tổng số&#xD;&#xA;dư Nợ; Quá hạn 61-90 ngày; Quá hạn trên 120 ngày; Quá hạn 91 - 120 ngày; Không có hạn nợ; Người lập phiếu; (Ký, họ tên)

### `Report/ReportTemplate/BAPaymentOrderSalary.mrt`
MISAObjectClass; AccountingSystem,System.Int32; BranchCode,System.String; BranchName,System.String; CashierName,System.String; CashierTitle,System.String; ChiefAccountantName,System.String; ChiefAccountantTitle,System.String; CompanyAddress,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; CompanyBankName,System.String; CompanyCode,System.String; CompanyDistrict,System.String; CompanyEmail,System.String; CompanyFax,System.String; CompanyLogo,System.Drawing.Image; CompanyName,System.String; CompanyProvince,System.String; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyWebsite,System.String; CurrentSubSystemCode,System.String; DirectorName,System.String; DirectorTitle,System.String; FromDate,System.DateTime; FromYearReport,System.Int32; IsPrintA3,System.Boolean; IsPrintSignerReport,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowCompanyInfo,System.Boolean; IsShowCompanyLogo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyTelAndFax,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; IssueNo,System.Int32; IsWorkingOnMultiBranch,System.Boolean; LanguageID,System.String; LicenseLogoAlign,System.Int32; LicensePositionVSLogo,System.Int32; MainCurrency,System.String; MoneyUnit,System.Decimal; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; PrintBalanceOnInvoice,System.Boolean; ProductName,System.String; RepeatHeaderWhenPrintReport,System.Boolean; ReporterName,System.String; ReporterTitle,System.String; ReportFormNo,System.String; ReportParameterList,System.Object; ReportPeriod,System.String; ReportTitle,System.String; ReportType,System.Int32; StartDate,System.DateTime; StoreKeeperName,System.String; StoreKeeperTitle,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentContract,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentDistrict,System.String; TaxAgentEmail,System.String; TaxAgentEmployee,System.String; TaxAgentFax,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentNo,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; TaxAgentTel,System.String; TelAndFaxAlign,System.Int32; Todate,System.DateTime; ToYearReport,System.Int32; VATBackGround,System.Object; VATFontList,System.Object; VATFontListString,System.String

### `Report/ReportTemplate/BIDVUNC.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; IsShowBarcodeWhenPrintReportVoucher,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String; ReportFormNoOther,System.String

### `Report/ReportTemplate/BIDVUNC_New.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; IsShowBarcodeWhenPrintReportVoucher,System.Boolean; CompanyLogo,Logo_x0020_công_x0020_ty,System.Drawing.Image; CompanyCode,Mã_x0020_công_x0020_ty,System.String; CompanyName,Tên_x0020_công_x0020_ty,System.String; CompanyAddress,Địa_x0020_chỉ_x0020_công_x0020_ty,System.String; ReporterName,Người_x0020_lập_x0020_báo_x0020_cáo,System.String; DirectorName,Tên_x0020_giám_x0020_đốc,System.String; ChiefAccountantName,Kế_x0020_toán_x0020_trưởng,System.String; CashierName,Thủ_x0020_quỹ,System.String; StoreKeeperName,Thủ_x0020_kho,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTel,Điện_x0020_thoại_x0020_của_x0020_công_x0020_ty,System.String; CompanyFax,Số_x0020_Fax_x0020_của_x0020_công_x0020_ty,System.String; CompanyWebsite,Website_x0020_của_x0020_công_x0020_ty,System.String; CompanyBankAccount,Số_x0020_tài_x0020_khoản_x0020_ngân_x0020_hàng,System.String; TaxAgentName,Tên_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentAddress,Địa_x0020_chỉ_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentCity,Tỉnh_x002F_TP_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentDistrict,Quận_x002F_Huyện_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentTel,SĐT_x0020_của_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentFax,Fax_x0020_của_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentEmail,Email_x0020_của_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentContract,Hợp_x0020_đồng_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentEmployee,Nhân_x0020_viên_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentNo,Chứng_x0020_chỉ_x0020_hành_x0020_nghề_x0020_số,System.String; OwnerCompanyName,Tên_x0020_đơn_x0020_vị_x0020_chủ_x0020_quản,System.String; IsWorkingOnMultiBranch,System.Boolean; BusinessRegistrationNumber,System.String; ReportFormNo,Mẫu_x0020_số_x0020_của_x0020_báo_x0020_cáo,System.String; ReportFormNoENG,System.String; ReportFormNoOtherENG,System.String; ReportFormNoZHC,System.String; ReportFormNoOtherZHC,System.String; ReportFormNoKOR,System.String; ReportFormNoOtherKOR,System.String; ReportTitle,Tiêu_x0020_đề_x0020_báo_x0020_cáo,System.String; MoneyUnit,Đơn_x0020_vị_x0020_tiền_x0020_tệ,System.Decimal; StartDate,Ngày_x0020_bắt_x0020_đầu_x0020_hạch_x0020_toán,System.DateTime; ReportPeriod,Kỳ_x0020_xem_x0020_báo_x0020_cáo,System.String; SignerDate,Ngày_x0020_ký,System.String; PeriodDefine,System.Int32; SignerDateWithCreate,System.String; BranchCode,Mã_x0020_chi_x0020_nhánh_x0020_xem_x0020_báo_x0020_cáo,System.String; CurrentSubSystemCode,System.String

### `Report/ReportTemplate/CheckBalancingAccount.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; IsShowBarcodeWhenPrintReportVoucher,System.Boolean; CompanyLogo,Logo_x0020_công_x0020_ty,System.Drawing.Image; CompanyCode,Mã_x0020_công_x0020_ty,System.String; CompanyName,Tên_x0020_công_x0020_ty,System.String; CompanyAddress,Địa_x0020_chỉ_x0020_công_x0020_ty,System.String; ReporterName,Người_x0020_lập_x0020_báo_x0020_cáo,System.String; DirectorName,Tên_x0020_giám_x0020_đốc,System.String; ChiefAccountantName,Kế_x0020_toán_x0020_trưởng,System.String; CashierName,Thủ_x0020_quỹ,System.String; StoreKeeperName,Thủ_x0020_kho,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTel,Điện_x0020_thoại_x0020_của_x0020_công_x0020_ty,System.String; CompanyFax,Số_x0020_Fax_x0020_của_x0020_công_x0020_ty,System.String; CompanyWebsite,Website_x0020_của_x0020_công_x0020_ty,System.String; CompanyBankAccount,Số_x0020_tài_x0020_khoản_x0020_ngân_x0020_hàng,System.String; TaxAgentName,Tên_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentAddress,Địa_x0020_chỉ_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentCity,Tỉnh_x002F_TP_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentDistrict,Quận_x002F_Huyện_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentTel,SĐT_x0020_của_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentFax,Fax_x0020_của_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentEmail,Email_x0020_của_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentContract,Hợp_x0020_đồng_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentEmployee,Nhân_x0020_viên_x0020_đại_x0020_lý_x0020_thuế,System.String; TaxAgentNo,Chứng_x0020_chỉ_x0020_hành_x0020_nghề_x0020_số,System.String; OwnerCompanyName,Tên_x0020_đơn_x0020_vị_x0020_chủ_x0020_quản,System.String; IsWorkingOnMultiBranch,System.Boolean; BusinessRegistrationNumber,System.String; ReportFormNo,Mẫu_x0020_số_x0020_của_x0020_báo_x0020_cáo,System.String; ReportFormNoENG,System.String; ReportFormNoOtherENG,System.String; ReportFormNoZHC,System.String; ReportFormNoOtherZHC,System.String; ReportFormNoKOR,System.String; ReportFormNoOtherKOR,System.String; ReportTitle,Tiêu_x0020_đề_x0020_báo_x0020_cáo,System.String; MoneyUnit,Đơn_x0020_vị_x0020_tiền_x0020_tệ,System.Decimal; StartDate,Ngày_x0020_bắt_x0020_đầu_x0020_hạch_x0020_toán,System.DateTime; ReportPeriod,Kỳ_x0020_xem_x0020_báo_x0020_cáo,System.String; SignerDate,Ngày_x0020_ký,System.String; PeriodDefine,System.Int32; SignerDateWithCreate,System.String; BranchCode,Mã_x0020_chi_x0020_nhánh_x0020_xem_x0020_báo_x0020_cáo,System.String; CurrentSubSystemCode,System.String

### `Report/ReportTemplate/CompareConfirmDebt.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; IsShowBarcodeWhenPrintReportVoucher,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankNameWithBranch,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String

### `Report/ReportTemplate/CompareConfirmDebtEmployee.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String; ReportTitle,System.String; MoneyUnit,System.Decimal

### `Report/ReportTemplate/ConstructionBankUNC.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; IsShowBarcodeWhenPrintReportVoucher,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String; ReportFormNoOther,System.String

### `Report/ReportTemplate/DaiABankUNC.mrt`
vi-VN; MISAObjectClass; IsShowCompanyInfo,System.Boolean; IsShowCompanyName,System.Boolean; IsShowCompanyAddress,System.Boolean; IsShowOwnerCompanyName,System.Boolean; IsShowProductInfo,System.Boolean; PrintDiagonLine,System.Int32; IsShowCompanyTelAndFax,System.Boolean; IsShowCompanyTaxCode,System.Boolean; IsShowCompanyTel,System.Boolean; IsShowCompanyFax,System.Boolean; IsShowCompanyEmail,System.Boolean; IsShowCompanyWebsite,System.Boolean; TelAndFaxAlign,System.Int32; TaxCodeAlign,System.Int32; TelAlign,System.Int32; FaxAlign,System.Int32; EmailAlign,System.Int32; WebsiteAlign,System.Int32; TaxCodeSortOrder,System.Int32; TelSortOrder,System.Int32; FaxSortOrder,System.Int32; EmailSortOrder,System.Int32; WebsiteSortOrder,System.Int32; IsShowCompanyLogo,System.Boolean; LicensePositionVSLogo,System.Int32; LicenseLogoAlign,System.Int32; PrintBalanceOnInvoice,System.Boolean; RepeatHeaderWhenPrintReport,System.Boolean; IsShowSignerDate,System.Boolean; CompanyLogo,System.Drawing.Image; CompanyCode,System.String; CompanyName,System.String; CompanyAddress,System.String; CompanyProvince,System.String; CompanyDistrict,System.String; ReporterName,System.String; DirectorName,System.String; ChiefAccountantName,System.String; CashierName,System.String; StoreKeeperName,System.String; ReporterTitle,System.String; DirectorTitle,System.String; ChiefAccountantTitle,System.String; CashierTitle,System.String; StoreKeeperTitle,System.String; IsPrintSignerReport,System.Boolean; CompanyTaxCode,System.String; CompanyTel,System.String; CompanyFax,System.String; CompanyEmail,System.String; CompanyWebsite,System.String; CompanyBankName,System.String; CompanyBankAccount,System.String; CompanyBankAddress,System.String; TaxAgentIsDisplayOnDeclaration,System.String; TaxAgentName,System.String; TaxAgentTaxCode,System.String; TaxAgentAddress,System.String; TaxAgentCity,System.String; TaxAgentDistrict,System.String; TaxAgentTel,System.String; TaxAgentDeadLineDate,System.DateTime; TaxAgentFax,System.String; TaxAgentEmail,System.String; TaxAgentContract,System.String; TaxAgentEmployee,System.String; TaxAgentNo,System.String; OwnerCompanyName,System.String; OwnerCompanyTaxCode,System.String; IsWorkingOnMultiBranch,System.Boolean; TaxAgentCertificateNoUnit,System.String; TaxAgentProvideUnit,System.String; TaxAgentTaxationBureauCode,System.String; TaxAgentTaxOrganManagementCode,System.String; TaxAgentTaxOrganManagementName,System.String; ReportFormNo,System.String; ReportFormNoOther,System.String; ReportTitle,System.String

## 5. ImportConfig/ + XMLTemplate/


### ImportConfig: 2 file
- `ImportConfig/ColumnConfig.lyt` (.lyt)
- `ImportConfig/ImportConfig.cfg` (.cfg)

### XMLTemplate: 52 file
- `XMLTemplate/DataSet/01-TAIN_TT119_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct1, ct2, ct3, ct4, ct5, ct6, ct7, ct8, ct9, ct10, CTieuTKhaiChinh, BangChiTietTNguyen
- `XMLTemplate/DataSet/01-TAIN_TT119_PLuc.xml` (.xml)
  - Tags: ct2, ct3, ct4, ct5, ct6, PLuc, PL01_KHBS, NDUNGKHAIBOSUNGDIEUCHINH, DieuChinhTang, KHBSDieuChinhTang, DieuChinhGiam, KHBSDieuChinhGiam
- `XMLTemplate/DataSet/01-TAIN_TT80_CTieuTKhaiChinh.xml` (.xml)
  - Tags: stt, ct3, ct4, ct5, ct6, ct7, ct8, ct2_maTaiNguyen, ct2_tenTaiNguyen, CTieuTKhaiChinh, Header, CT09
- `XMLTemplate/DataSet/01-TAIN_TT80_PLuc.xml` (.xml)
  - Tags: ChiTiet, ct2_ma, ct2_ten, ct3, stt, ct05, ct06, ct08_tinh_ma, Header, maTKhai, tenTKhai, maGiaoDich
- `XMLTemplate/DataSet/01-TTDB_ND373_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct10, stt, ct2_maHH, ct2_tenHH, ct3, ct4, ct6, ct7, ct8, ct9, ct11, ct5
- `XMLTemplate/DataSet/01-TTDB_ND373_PLuc.xml` (.xml)
  - Tags: ChiTiet, ct2_ma, ct2_ten, ct3, ct7, ct8, stt, ct10, ct14, ct15, ct16, ct17
- `XMLTemplate/DataSet/01-TTDB_TT119_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct2, ct3, ct4, ct5, NDungHHoaKhongThue, ct2_maHH, NDungTKhaiTTDB, ct2_maHHDV, ct6, ct7, ct8, ct9
- `XMLTemplate/DataSet/01-TTDB_TT119_PLuc.xml` (.xml)
  - Tags: ct2, ct3, ct4, ct5, ct6, ct7, ct8, ct9, tong_ct7, PLuc, PL01_KHBS, NDUNGKHAIBOSUNGDIEUCHINH
- `XMLTemplate/DataSet/01-TTDB_TT195_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct2, ct3, ct4, ct5, NDungHHoaKhongThue, ct2_maHH, NDungTKhaiTTDB, ct2_maHHDV, ct6, ct7, ct8, ct9
- `XMLTemplate/DataSet/01-TTDB_TT195_PLuc.xml` (.xml)
  - Tags: ct2, ct3, ct4, ct5, ct6, ct7, tong_ct7, PLuc, PL01_KHBS, NDUNGKHAIBOSUNGDIEUCHINH, DieuChinhTang, KHBSDieuChinhTang
- `XMLTemplate/DataSet/01-TTDB_TT80_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct10, stt, ct2_maHH, ct2_tenHH, ct3, ct4, ct5, ct6, ct7, ct8, ct9, ct11
- `XMLTemplate/DataSet/01-TTDB_TT80_PLuc.xml` (.xml)
  - Tags: ChiTiet, ct2_ma, ct2_ten, ct3, ct7, ct8, stt, ct10, ct14, ct15, ct16, ct17
- `XMLTemplate/DataSet/01GTGT_TT119_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, tieuMucHachToan, ct21, ct22, GiaTriVaThueGTGTHHDVMuaVao, ct23, ct24, ct25, ct26, HHDVBRaChiuThueGTGT, ct27, ct28
- `XMLTemplate/DataSet/01GTGT_TT119_PLuc.xml` (.xml)
  - Tags: kyHieuMauHDon, kyHieuHDon, soHDon, ngayPHanh, matHang, thueGTGT, ghiChu, tongGTriMVao, tongThueMVao, ct2, ct3, ct4
- `XMLTemplate/DataSet/01GTGT_TT26_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, ma_NganhNghe, ten_NganhNghe, tieuMucHachToan, ct21, ct22, GiaTriVaThueGTGTHHDVMuaVao, ct23, ct24, ct25, ct26, HHDVBRaChiuThueGTGT
- `XMLTemplate/DataSet/01GTGT_TT26_PLuc.xml` (.xml)
  - Tags: ct2, ct3, ct4, ct5, ct6, maCQTQLy_CCT, cqtQLy_CCT, maCQTQLy_CT, cqtQLy_CT, tongCong, PLuc, PL01_KHBS
- `XMLTemplate/DataSet/01GTGT_TT80_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, ma_NganhNghe, ten_NganhNghe, tieuMucHachToan, Header, ct09, ct10, DiaChiHDSXKDKhacTinhNDTSC, ct11a_phuongXa_ma, ct11a_phuongXa_ten, ct11b_quanHuyen_ma, ct11b_quanHuyen_ten
- `XMLTemplate/DataSet/01GTGT_TT80_PLuc.xml` (.xml)
  - Tags: ChiTiet, ct2_ma, ct2_ten, ct06, ct3_ma, ct3_ten, ct7, BangKeTenHHDV, BKeHSo, ma_HSo, ten_HSo, CTietHSo
- `XMLTemplate/DataSet/02GTGT_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, maHoSoKhaiDuAnDauTu, cqtQLyNoiCoDADT, maCQT, tenCoQuanthue, TTDuAnDauTu, tenDuAn, diaChiThucHienDuAn, chuDuAnDauTu, maSoThueDuAnDauTu, VBPheDuyetDuAnDauTu, so
- `XMLTemplate/DataSet/02GTGT_PLuc.xml` (.xml)
  - Tags: ct2, ct3, ct4, ct5, ct6, PLuc, PL01_KHBS, NDUNGKHAIBOSUNGDIEUCHINH, DieuChinhTang, KHBSDieuChinhTang, DieuChinhGiam, KHBSDieuChinhGiam
- `XMLTemplate/DataSet/02GTGT_TT80_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, Header, ct01a, ct06, ct07, ct08_ma, ct08_ten, ct09_ma, ct09_ten, ct10_ma, ct10_ten, VBPheDuyetDuAnDauTu
- `XMLTemplate/DataSet/02GTGT_TT80_PLuc.xml` (.xml)
  - Tags: ChiTiet, ct2_ma, ct2_ten, ct3, Header, maTKhai, tenTKhai, maGiaoDich, KyKKhaiThue, kieuKy, kyKKhai, kyKKhaiTuNgay
- `XMLTemplate/DataSet/03-TNDN-TT119_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, tieuMucHachToan, doanhNghiepCoQuyMoVuaVaNho, doanhNghiepCoCSoHToanPThuoc, doanhNghiepKeKhaiTTinLienKet, ct_04_ma, ct_04_ten, ct_05, ctA1, ctB1, ctB2, ctB3
- `XMLTemplate/DataSet/03-TNDN-TT119_PLuc.xml` (.xml)
  - Tags: namPSinhLo, soLoPSinh, soLoDaChuyen, soLoKyNay, soLoChuyenSau, ct2, ct3, ct4, ct5, ct6, ct10, ct11
- `XMLTemplate/DataSet/03-TNDN-TT80_CTieuTKhaiChinh.xml` (.xml)
  - Tags: soKK, tieuMuc1052, tieuMuc1056, tieuMuc1057, tieuMuc1099, CTieuTKhaiChinh, Header, kyTaiChinh_Tu, kyTaiChinh_Den, ma_THQuyetToan, ten_THQuyetToan, ct04_ma
- `XMLTemplate/DataSet/03-TNDN-TT80_PLuc.xml` (.xml)
  - Tags: ct3, ct2, ct4, ct5, ct6, ChiTiet, ct2_ma, ct2_ten, ct04, ct05, ct06, ct10
- `XMLTemplate/DataSet/03GTGT_TT119_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, ct21, ct22, ct23, ct24, ct25, ct26, ct27
- `XMLTemplate/DataSet/03GTGT_TT119_PLuc.xml` (.xml)
  - Tags: ct2, ct3, ct4, ct5, ct6, PLuc, PL01_KHBS, NDUNGKHAIBOSUNGDIEUCHINH, DieuChinhTang, KHBSDieuChinhTang, DieuChinhGiam, KHBSDieuChinhGiam
- `XMLTemplate/DataSet/03GTGT_TT80_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, ct21, ct22, ct23, ct24, ct25, ct26, ct26a, ct26b, ct27, ct27a, ct27b
- `XMLTemplate/DataSet/03GTGT_TT80_PLuc.xml` (.xml)
  - Tags: ChiTiet, ct2_ma, ct2_ten, ct3, Header, maTKhai, tenTKhai, maGiaoDich, KyKKhaiThue, kieuKy, kyKKhai, kyKKhaiTuNgay
- `XMLTemplate/DataSet/04-GTGT-TT119_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, hoatDongThuHo, ct21, PPhoiCCapHHoa, ct22, ct23, DVuXDungKoBaoThauNVL, ct24, ct25, HHoaXDungCoBaoThauNVL, ct26, ct27
- `XMLTemplate/DataSet/04-GTGT-TT119_PLuc.xml` (.xml)
  - Tags: ct2, ct3, ct4, ct5, ct6, PLuc, PL01_KHBS, NDUNGKHAIBOSUNGDIEUCHINH, DieuChinhTang, KHBSDieuChinhTang, DieuChinhGiam, KHBSDieuChinhGiam
- `XMLTemplate/DataSet/04-GTGT-TT80_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, Header, khaiRiengThuHo, ct09, ct10, ct11, ct11a_ma, ct11a_ten, ct11b_ma, ct11b_ten, ct11c_ma, ct11c_ten
- `XMLTemplate/DataSet/04-GTGT-TT80_PLuc.xml` (.xml)
  - Tags: ChiTiet, ct2_ma, ct2_ten, ct3_ma, ct3_ten, ct7, BangKeTenHHDV, BKeHSo, ma_HSo, ten_HSo, CTietHSo, ct3_1_ma
- `XMLTemplate/DataSet/B01-DN-MidYear_01_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct100, ct110, ct111, ct112, ct120, ct121, ct122, ct123, ct130, ct131, ct132, ct133
- `XMLTemplate/DataSet/B01-DN-MidYear_01_PLuc.xml` (.xml)
  - Tags: ct01, ct02, ct20, ct21, ct22, ct23, ct25, ct26, ct30, ct31, ct32, ct40
- `XMLTemplate/DataSet/B01-DNSN_133_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct110, ct120, ct130, ct140, ct150, ct160, ct200, ct300, ct310, ct320, ct330, ct340
- `XMLTemplate/DataSet/B01-DNSN_133_PLuc.xml` (.xml)
  - Tags: ct01, ct02, ct03, ct04, ct05, ct06, ct07, PLuc, PL_KQHDXSKD, ThuyetMinh, NamNay, NamTruoc
- `XMLTemplate/DataSet/B01-DN_01_133_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct100, ct110, ct120, ct121, ct122, ct123, ct130, ct131, ct132, ct133, ct134, ct135
- `XMLTemplate/DataSet/B01-DN_01_133_PLuc.xml` (.xml)
  - Tags: ct01, ct02, ct20, ct21, ct22, ct23, ct24, ct30, ct31, ct32, ct40, ct50
- `XMLTemplate/DataSet/B01-DN_01_133a_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct110, ct120, ct121, ct122, ct123, ct124, ct130, ct131, ct132, ct133, ct134, ct135
- `XMLTemplate/DataSet/B01-DN_01_133a_PLuc.xml` (.xml)
  - Tags: ct01, ct02, ct20, ct21, ct22, ct23, ct24, ct30, ct31, ct32, ct40, ct50
- `XMLTemplate/DataSet/B01-DN_01_48_CTieuTKhaiChinh.xml` (.xml)
  - Tags: SoCuoiNam, SoDauNam, taiSanThueNgoai, hangHoaNhanGiuHo, hangHoaNhanBanHo, noKhoDoiDaXLy, ngoaiTeCacLoai, CTieuTKhaiChinh, bctcDaKiemToan, maYKienKToan, tenYKienKToan, ThuyetMinh
- `XMLTemplate/DataSet/B01-DN_01_48_PLuc.xml` (.xml)
  - Tags: ThuyetMinh, ct01_tMinh, ct02_tMinh, ct20_tMinh, ct21_tMinh, ct22_tMinh, ct23_tMinh, ct24_tMinh, ct30_tMinh, ct31_tMinh, ct32_tMinh, ct40_tMinh
- `XMLTemplate/DataSet/B01-DN_01_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ct100, ct110, ct111, ct112, ct120, ct121, ct122, ct123, ct130, ct131, ct132, ct133
- `XMLTemplate/DataSet/B01-DN_01_PLuc.xml` (.xml)
  - Tags: ct01, ct02, ct20, ct21, ct22, ct23, ct25, ct26, ct30, ct31, ct32, ct40
- `XMLTemplate/DataSet/InvoiceStatement_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, kyBCaoCuoi, chuyenDiaDiem, ngayDauKyBC, ngayCuoiKyBC, HoaDon, ChiTiet, maHoaDon, tenHDon, kHieuMauHDon, kHieuHDon, soTonMuaTrKy_tongSo
- `XMLTemplate/DataSet/NoticeReleaseInvoice_CTieuTKhaiChinh.xml` (.xml)
  - Tags: ten, mst, CTieuTKhaiChinh, HoaDon, ChiTiet, tenLoaiHDon, mauSo, kyHieu, soLuong, tuSo, denSo, ngayBDauSDung
- `XMLTemplate/DataSet/PAVoucherUsage_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, ChungTu, ChiTiet, kyHieuCTu, soCTu, ngayCTu, hoVaTen, mst_CMT_HoChieu, soTienThue, ghiChu, tongSoTienThue, nguoiDaiDien
- `XMLTemplate/DataSet/TA_05KK_TNCN_CTieuTKhaiChinh.xml` (.xml)
  - Tags: CTieuTKhaiChinh, ct21, ct22, ct23, ct24, ct25, ct26, ct27, ct28, ct29, ct30, ct31
- `XMLTemplate/ReportInfoAndSupportExtension.xml` (.xml)
  - Tags: ReportInfoAndSupportExtension, ReportFile, ReportTaxID, ReportName, ReportFileCode, Extension, AccountingSystem, IsTypeReport, DescriptionSample, PbanTKhaiXML, PbanTKhaiXMLbs, ReportInfoAndSupportExtensions
- `XMLTemplate/TTinChung.xml` (.xml)
  - Tags: TTinChung, TTinDVu, maDVu, tenDVu, pbanDVu, ttinNhaCCapDVu, TTinTKhaiThue, TKhaiThue, maTKhai, tenTKhai, moTaBMau, pbanTKhaiXML

## 6. Dấu vết nghiệp vụ đặc biệt


### Số chứng từ
- `Template/Tax/01_GTGT_2014.xls` — PT, PC, NK
- `Template/Tax/05QTT_TNCN_TT80_2025.xls` — PT, NK, BH
- `Template/Tax/01_TTDB_ND373.xls` — PT, PC, NK, UNC
- `Template/Tax/03_TNDN_2013.xls` — PT, PC, NK, BH, UNC
- `Template/Tax/02_GTGT_2014.xls` — PT, PC, NK
- `Template/Tax/03_GTGT_2014_TT80.xls` — PT, NK
- `Template/Tax/02_TAIN_2013.xls` — PT, PC, NK, BH
- `Template/Tax/02KK_TNCN_2014.xls` — PT, PC, NK, UNC
- `Template/Tax/01_TBVMT_2014.xls` — PT, PC, NK, BH
- `Template/Tax/01_GTGT_TT26.xls` — PT, PC, NK
- `Template/Tax/05KK_TNCN_2022.xls` — PT, PC, NK, UNC
- `Template/Tax/01_GTGT_Banra.xls` — PT, NK
- `Template/Tax/01B_TNDN_2014.xls` — PT, PC, NK, BH, UNC
- `Template/Tax/01_TAIN_TT80.xls` — PT, PC, NK, BH
- `Template/Tax/05QTT_TNCN_TT80_2022.xls` — PT, NK, BH
- `Template/Tax/03_TNDN_2025_TT80.xls` — PT, NK, BH, UNC
- `Template/Tax/03_TNDN_2021_TT80.xls` — PT, NK, BH, UNC
- `Template/Tax/02_GTGT_2021.xls` — PT, PC, NK
- `Template/Tax/01_GTGT_TT80.xls` — PT, PC, NK
- `Template/Tax/BC26_AC_2014.xls` — PT, NK
- `Template/Tax/02_GTGT_From_2021_TT80.xls` — PT, NK
- `Template/Tax/05QTT_TNCN_2015.xls` — PT, NK
- `Template/Tax/01_TAIN_2014.xls` — PT, PC, NK, BH
- `Template/Tax/01A_TNDN_2014.xls` — PT, PC, NK, BH, UNC
- `Template/Tax/03_GTGT_2014.xls` — PT, NK
- `Template/Tax/MISA_Config_Template.xls` — RefNo, PT, PC, NK, UNC
- `Template/Tax/01_TTDB_TT80.xls` — PT, PC, NK, BH, UNC
- `Template/Tax/05KK_TNCN_2015.xls` — PT, NK, UNC
- `Template/Tax/01_TTDB_2014.xls` — PT, PC, NK, BH, UNC
- `Template/Tax/04_GTGT_2021_TT80.xls` — RefNo, PT, PC, NK, UNC
- `Template/Tax/04_GTGT_2014.xls` — RefNo, PT, PC, NK, UNC
- `Template/ListMergeField/Phieu_thu.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/ChungTuBanHang.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/ChungTuNVK.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/ChungTuKeToan.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/ChungTuQTTU.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/ChuyenKho.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/HoaDonBanHang.xls` — PT, NK
- `Template/ListMergeField/PhieuChi.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/HopDongBan.xls` — PT, PC, NK
- `Template/ListMergeField/ThuTienGui.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/GiamGiaHangBan.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/DonMuaHang.xls` — RefNo, RefDate, PT, NK, BH
- `Template/ListMergeField/HoaDonBanLeXangDau.xls` — PT, PC, NK
- `Template/ListMergeField/Sec, UyNhiemChi.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/GiamGiaHangMua.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/PhieuXuat.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/TraLaiHangMua.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/ChungTuMuaHHDV.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/PhieuNhap.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/TraLaiHangBan.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/ChuyenTienNoiBo.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/DonDatHang.xls` — RefNo, RefDate, PT, NK, BH
- `Template/ListMergeField/BaoGia.xls` — RefNo, RefDate, PT, NK
- `Template/ListMergeField/Email/BaoCaoKhac.xls` — PT
- `Template/ListMergeField/Email/MinutesInvoiceEmailTemplate.xls` — PT, NK
- `Template/ListMergeField/Email/MuaHangHoaDichVu.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/Email/DeletedNoticeEmailTemplate.xls` — PT, NK
- `Template/ListMergeField/Email/BaoCaoCongNoPhaiThu.xls` — PT, NK
- `Template/ListMergeField/Email/BanHang.xls` — RefNo, RefDate, PostedDate, PT, NK
- `Template/ListMergeField/Email/BaoCaoCongNoPhaiTra.xls` — PT
- `Template/ListMergeField/Email/HopDongBan.xls` — RefNo, PT, NK, BH, UNC
- `Template/ListMergeField/Email/MinutesAdjustEmailTemplate.xls` — PT, NK
- `Template/ListMergeField/Email/EmailTemplate.xls` — PT, NK
- `Template/ListMergeField/Email/DonMuaHang.xls` — RefNo, RefDate, PT, NK
- `Template/ListMergeField/Email/BaoCaoCongNoNhanVien.xls` — PT
- `Template/ListMergeField/Email/DonDatHang.xls` — RefNo, RefDate, PT, NK
- `Template/ListMergeField/Email/BaoGia.xls` — RefNo, RefDate, PT, NK
- `Template/ImportExcel/Bang_luong_theo_gio.xls` — PT, PC, NK
- `Template/ImportExcel/Ban_hang_TT_VND.xls` — NK
- `Template/ImportExcel/Danh_muc_nguoi_phu_thuoc_nhan_vien.xls` — NK
- `Template/ImportExcel/Bang_luong_tam_ung.xls` — PT, PC, NK
- `Template/ImportExcel/Bao_gia.xls` — PT, PC, NK
- `Template/ImportExcel/Ban_hang_TT.xls` — PT, NK
- `Template/ImportExcel/Cong_no_dau_ky_nhan_vien.xls` — PT, PC, NK
- `Template/ImportExcel/Chi_phi_do_dang_cong_trinh.xls` — NK
- `Template/ImportExcel/Dinh_muc_nguyen_vat_lieu_cong_trinh.xls` — PC, NK
- `Template/ImportExcel/Ban_hang.xls` — NK, BH
- `Template/ImportExcel/Cong_no_dau_ky_khach_hang_VND.xls` — NK
- `Template/ImportExcel/Bao_gia_VND.xls` — PT, PC, NK

### Đa tiền tệ
- `Template/ListMergeField/Phieu_thu.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/ChungTuBanHang.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/ChungTuNVK.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/ChungTuKeToan.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/ChungTuQTTU.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/ChuyenKho.xls` — ExchangeRate
- `Template/ListMergeField/HoaDonBanHang.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/PhieuChi.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/HopDongBan.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/ThuTienGui.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/GiamGiaHangBan.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/DonMuaHang.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/HoaDonBanLeXangDau.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/Sec, UyNhiemChi.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/GiamGiaHangMua.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/PhieuXuat.xls` — ExchangeRate, AmountOC
- `Template/ListMergeField/TraLaiHangMua.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/ChungTuMuaHHDV.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/PhieuNhap.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/TraLaiHangBan.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/ChuyenTienNoiBo.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/DonDatHang.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/BaoGia.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/Email/MuaHangHoaDichVu.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/Email/BanHang.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/Email/DonMuaHang.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/Email/DonDatHang.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeField/Email/BaoGia.xls` — CurrencyID, ExchangeRate, AmountOC
- `Template/ListMergeFieldSample/PhieuChiMau.xls` — ExchangeRate, AmountOC
- `Template/ListMergeFieldSample/DonMuaHangMau.xls` — AmountOC
- `Template/ListMergeFieldSample/Phieu_thuMau.xls` — ExchangeRate, AmountOC
- `Template/ListMergeFieldSample/PhieuNhapMau.xls` — AmountOC
- `Template/ListMergeFieldSample/DonDatHangMau.xls` — AmountOC
- `Template/ListMergeFieldSample/BaoGiaMau.xls` — AmountOC
- `Template/ListMergeFieldSample/PhieuXuatMau.xls` — AmountOC
- `Template/ListMergeFieldSample/ChungTuMuaHHDVMau.xls` — AmountOC
- `Template/ListMergeFieldSample/ChungTuBanHangMau.xls` — AmountOC
- `Bin/01GTKT_0000001Empty.xml` — ExchangeRate, AmountOC
- `Layout/frmCAPaymentDetailTax.xml` — AmountOC
- `Report/ReportTemplate/BarcodeA5_1.mrt` — ExchangeRate
- `Report/ReportTemplate/CheckBalancingAccount.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/BarcodeA4_1.mrt` — ExchangeRate
- `Report/ReportTemplate/BarcodeA4_2.mrt` — ExchangeRate
- `Report/ReportTemplate/BarcodeA4_3.mrt` — ExchangeRate
- `Report/ReportTemplate/02_VT_ManageSize.mrt` — ExchangeRate, AmountOC
- `Report/ReportTemplate/AccountingVoucherDetail.mrt` — CurrencyID, ExchangeRate, AmountOC, Quy đổi, Tỷ giá
- `Report/ReportTemplate/AccountingVoucher.mrt` — CurrencyID, ExchangeRate, AmountOC, Quy đổi, Tỷ giá
- `Report/ReportTemplate/02_VT_VoucherQuantity.mrt` — ExchangeRate, AmountOC
- `Report/ReportTemplate/CompareConfirmDebtEmployee.mrt` — CurrencyID, ExchangeRate
- `Report/ReportTemplate/CompareConfirmDebt.mrt` — CurrencyID, ExchangeRate
- `Report/ReportTemplate/ACB_Uy_Nhiem_Chi.rst` — CurrencyID, ExchangeRate, AmountOC, Quy đổi, Tỷ giá
- `Report/ReportTemplate/02_VT.mrt` — ExchangeRate, AmountOC
- `Report/ReportTemplate/DaiABankUNC.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/Announcement_Of_Debt_CCY.rst` — CurrencyID, ExchangeRate, AmountOC, Tỷ giá
- `Report/ReportTemplate/CompareConfirmPayableDebt.mrt` — CurrencyID, ExchangeRate
- `Report/ReportTemplate/01_VT_StockDetail.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/CustomerReceivableVoucherList.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/BarcodeA5_2.mrt` — ExchangeRate
- `Report/ReportTemplate/ABBANK_Uy_Nhiem_Chi.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/AccountingVoucherExchange.mrt` — CurrencyID, ExchangeRate, AmountOC, Quy đổi, Tỷ giá
- `Report/ReportTemplate/ConstructionBankUNC.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/05_VT.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/AgribankUNC.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/02_VT_LotExpiry.mrt` — ExchangeRate, AmountOC
- `Report/ReportTemplate/02_VT_LotExpiry_INInventoryBook.mrt` — ExchangeRate, AmountOC
- `Report/ReportTemplate/DAIA_Uy_Nhiem_Chi.rst` — CurrencyID, ExchangeRate, AmountOC, Quy đổi, Tỷ giá
- `Report/ReportTemplate/01_VT_MultiUnit.mrt` — ExchangeRate, AmountOC
- `Report/ReportTemplate/ABBank_Uy_Nhiem_Chi.rst` — CurrencyID, ExchangeRate, AmountOC, Quy đổi, Tỷ giá
- `Report/ReportTemplate/CreditInvoice.rst` — CurrencyID, ExchangeRate, AmountOC, Quy đổi, Tỷ giá
- `Report/ReportTemplate/01_VT_LotExpiry.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/01_VT.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/BankReconcileOnline.mrt` — ExchangeRate, AmountOC
- `Report/ReportTemplate/AgribankUNC_A5.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/BAPaymentOrderSalary.mrt` — ExchangeRate
- `Report/ReportTemplate/BIDVUNC.mrt` — CurrencyID, ExchangeRate, AmountOC, Quy đổi, Tỷ giá
- `Report/ReportTemplate/01_VT_LotExpiry_INInventoryBook.mrt` — CurrencyID, ExchangeRate, AmountOC
- `Report/ReportTemplate/Barcode3_3.mrt` — ExchangeRate
- `Report/ReportTemplate/BIDVUNC_New.mrt` — CurrencyID, ExchangeRate, AmountOC, Quy đổi, Tỷ giá
- `Report/ReportTemplate/BarcodeA5_3.mrt` — ExchangeRate
- `Report/ReportTemplate/01_VT_ManageSize.mrt` — CurrencyID, ExchangeRate, AmountOC

### TSCĐ
- `Template/Tax/01_GTGT_2014.xls` — FA
- `Template/Tax/05QTT_TNCN_TT80_2025.xls` — FA
- `Template/Tax/01_TTDB_ND373.xls` — FA
- `Template/Tax/03_TNDN_2013.xls` — FA
- `Template/Tax/02_GTGT_2014.xls` — FA
- `Template/Tax/03_GTGT_2014_TT80.xls` — FA
- `Template/Tax/02_TAIN_2013.xls` — FA
- `Template/Tax/02KK_TNCN_2014.xls` — FA
- `Template/Tax/01_TBVMT_2014.xls` — FA
- `Template/Tax/01_GTGT_TT26.xls` — FA
- `Template/Tax/05KK_TNCN_2022.xls` — FA
- `Template/Tax/01_GTGT_Banra.xls` — FA
- `Template/Tax/01B_TNDN_2014.xls` — FA
- `Template/Tax/01_TAIN_TT80.xls` — FA
- `Template/Tax/05QTT_TNCN_TT80_2022.xls` — FA
- `Template/Tax/03_TNDN_2025_TT80.xls` — FA
- `Template/Tax/03_TNDN_2021_TT80.xls` — FA
- `Template/Tax/02_GTGT_2021.xls` — FA
- `Template/Tax/01_GTGT_TT80.xls` — FA
- `Template/Tax/BC26_AC_2014.xls` — FA
- `Template/Tax/02_GTGT_From_2021_TT80.xls` — FA
- `Template/Tax/05QTT_TNCN_2015.xls` — FA
- `Template/Tax/01_TAIN_2014.xls` — FA
- `Template/Tax/01A_TNDN_2014.xls` — FA
- `Template/Tax/03_GTGT_2014.xls` — FA
- `Template/Tax/MISA_Config_Template.xls` — FA
- `Template/Tax/01_TTDB_TT80.xls` — FA
- `Template/Tax/05KK_TNCN_2015.xls` — FA
- `Template/Tax/01_TTDB_2014.xls` — FA
- `Template/Tax/04_GTGT_2021_TT80.xls` — FA
- `Template/Tax/04_GTGT_2014.xls` — FA
- `Template/ListMergeField/Phieu_thu.xls` — FA
- `Template/ListMergeField/ChungTuBanHang.xls` — FA
- `Template/ListMergeField/ChungTuNVK.xls` — FA
- `Template/ListMergeField/ChungTuKeToan.xls` — FA
- `Template/ListMergeField/ChungTuQTTU.xls` — FA
- `Template/ListMergeField/ChuyenKho.xls` — FA
- `Template/ListMergeField/HoaDonBanHang.xls` — FA
- `Template/ListMergeField/PhieuChi.xls` — FA
- `Template/ListMergeField/HopDongBan.xls` — FA
- `Template/ListMergeField/ThuTienGui.xls` — FA
- `Template/ListMergeField/GiamGiaHangBan.xls` — FA
- `Template/ListMergeField/DonMuaHang.xls` — FA
- `Template/ListMergeField/HoaDonBanLeXangDau.xls` — FA
- `Template/ListMergeField/Sec, UyNhiemChi.xls` — FA
- `Template/ListMergeField/GiamGiaHangMua.xls` — FA
- `Template/ListMergeField/PhieuXuat.xls` — FA
- `Template/ListMergeField/TraLaiHangMua.xls` — FA
- `Template/ListMergeField/ChungTuMuaHHDV.xls` — FA
- `Template/ListMergeField/PhieuNhap.xls` — FA
- `Template/ListMergeField/TraLaiHangBan.xls` — FA
- `Template/ListMergeField/ChuyenTienNoiBo.xls` — FA
- `Template/ListMergeField/DonDatHang.xls` — FA
- `Template/ListMergeField/BaoGia.xls` — FA
- `Template/ListMergeField/Email/BaoCaoKhac.xls` — FA
- `Template/ListMergeField/Email/MuaHangHoaDichVu.xls` — FA
- `Template/ListMergeField/Email/BaoCaoCongNoPhaiThu.xls` — FA
- `Template/ListMergeField/Email/BanHang.xls` — FA
- `Template/ListMergeField/Email/BaoCaoCongNoPhaiTra.xls` — FA
- `Template/ListMergeField/Email/HopDongBan.xls` — FA, Depreciation
- `Template/ListMergeField/Email/DonMuaHang.xls` — FA
- `Template/ListMergeField/Email/BaoCaoCongNoNhanVien.xls` — FA
- `Template/ListMergeField/Email/DonDatHang.xls` — FA
- `Template/ListMergeField/Email/BaoGia.xls` — FA
- `Template/ImportExcel/Bang_luong_theo_gio.xls` — FA
- `Template/ImportExcel/Bang_luong_tam_ung.xls` — FA
- `Template/ImportExcel/Bao_gia.xls` — FA
- `Template/ImportExcel/Ban_hang_TT.xls` — FA
- `Template/ImportExcel/Cong_no_dau_ky_nhan_vien.xls` — FA
- `Template/ImportExcel/Dinh_muc_nguyen_vat_lieu_cong_trinh.xls` — FA
- `Template/ImportExcel/Ban_hang.xls` — FA
- `Template/ImportExcel/Bao_gia_VND.xls` — FA
- `Template/ImportExcel/Cong_no_dau_ky_khach_hang.xls` — FA
- `Template/ImportExcel/B02-DN_01_UNIFY.xls` — FA
- `Template/ImportExcel/B01-DN_01_UNIFY.xls` — FA
- `Template/ImportExcel/B01-DN_01_Summary.xls` — FA
- `Template/ImportExcel/Chuyen_tien_noi_bo_VND.xls` — FA
- `Template/ImportExcel/B03-DN_01_Summary.xls` — FA
- `Template/ImportExcel/demo.xls` — FA
- `Template/ImportExcel/Chung_tu_quyet_toan_tam_ung.xls` — FA

### Hệ thống TK
- `Template/Tax/01_GTGT_2014.xls` — AccountObject
- `Template/Tax/05QTT_TNCN_TT80_2025.xls` — TK
- `Template/Tax/01_TTDB_ND373.xls` — AccountObject, TK
- `Template/Tax/03_TNDN_2013.xls` — TK
- `Template/Tax/02_GTGT_2014.xls` — AccountObject
- `Template/Tax/01_GTGT_TT26.xls` — AccountObject, TK
- `Template/Tax/01_GTGT_Banra.xls` — AccountObject
- `Template/Tax/01B_TNDN_2014.xls` — TK
- `Template/Tax/05QTT_TNCN_TT80_2022.xls` — TK
- `Template/Tax/03_TNDN_2025_TT80.xls` — TK
- `Template/Tax/02_GTGT_2021.xls` — AccountObject
- `Template/Tax/01_GTGT_TT80.xls` — AccountObject, TK
- `Template/Tax/BC26_AC_2014.xls` — TK
- `Template/Tax/02_GTGT_From_2021_TT80.xls` — AccountObject, TK
- `Template/Tax/MISA_Config_Template.xls` — AccountNumber, AccountObject, TK
- `Template/Tax/01_TTDB_TT80.xls` — AccountObject, TK
- `Template/Tax/01_TTDB_2014.xls` — AccountObject, TK
- `Template/Tax/04_GTGT_2021_TT80.xls` — AccountNumber, AccountObject, TK
- `Template/Tax/04_GTGT_2014.xls` — AccountNumber, AccountObject, TK
- `Template/ListMergeField/Phieu_thu.xls` — AccountObject, TK
- `Template/ListMergeField/ChungTuBanHang.xls` — AccountObject, TK
- `Template/ListMergeField/ChungTuNVK.xls` — AccountObject, TK
- `Template/ListMergeField/ChungTuKeToan.xls` — AccountNumber, AccountObject, TK
- `Template/ListMergeField/ChungTuQTTU.xls` — AccountObject, TK
- `Template/ListMergeField/ChuyenKho.xls` — AccountObject, TK
- `Template/ListMergeField/HoaDonBanHang.xls` — AccountObject, TK
- `Template/ListMergeField/PhieuChi.xls` — AccountNumber, AccountObject, TK
- `Template/ListMergeField/HopDongBan.xls` — AccountObject
- `Template/ListMergeField/ThuTienGui.xls` — AccountNumber, AccountObject, TK
- `Template/ListMergeField/GiamGiaHangBan.xls` — AccountObject, TK
- `Template/ListMergeField/DonMuaHang.xls` — AccountObject, TK
- `Template/ListMergeField/HoaDonBanLeXangDau.xls` — AccountObject, TK
- `Template/ListMergeField/Sec, UyNhiemChi.xls` — AccountNumber, AccountObject, TK
- `Template/ListMergeField/GiamGiaHangMua.xls` — AccountObject, TK
- `Template/ListMergeField/PhieuXuat.xls` — AccountObject, TK
- `Template/ListMergeField/TraLaiHangMua.xls` — AccountNumber, AccountObject, TK
- `Template/ListMergeField/ChungTuMuaHHDV.xls` — AccountObject, TK
- `Template/ListMergeField/PhieuNhap.xls` — AccountObject, TK
- `Template/ListMergeField/TraLaiHangBan.xls` — AccountNumber, AccountObject, TK
- `Template/ListMergeField/ChuyenTienNoiBo.xls` — AccountNumber, TK
- `Template/ListMergeField/DonDatHang.xls` — AccountObject, TK
- `Template/ListMergeField/BaoGia.xls` — AccountObject
- `Template/ListMergeField/Email/BaoCaoKhac.xls` — AccountObject
- `Template/ListMergeField/Email/MinutesInvoiceEmailTemplate.xls` — AccountObject
- `Template/ListMergeField/Email/MuaHangHoaDichVu.xls` — AccountObject, TK
- `Template/ListMergeField/Email/DeletedNoticeEmailTemplate.xls` — AccountObject
- `Template/ListMergeField/Email/BanHang.xls` — AccountObject
- `Template/ListMergeField/Email/HopDongBan.xls` — TK
- `Template/ListMergeField/Email/MinutesAdjustEmailTemplate.xls` — AccountObject
- `Template/ListMergeField/Email/EmailTemplate.xls` — AccountObject
- `Template/ListMergeField/Email/DonMuaHang.xls` — AccountObject
- `Template/ListMergeField/Email/DonDatHang.xls` — AccountObject
- `Template/ListMergeField/Email/BaoGia.xls` — AccountObject
- `Template/ImportExcel/Ban_hang_TT_VND.xls` — TK
- `Template/ImportExcel/Ban_hang_TT.xls` — TK
- `Template/ImportExcel/Ban_hang.xls` — TK
- `Template/ImportExcel/Chi_phi_tra_truoc.xls` — TK
- `Template/ImportExcel/Cong_cu_dung_cu_dau_ky.xls` — TK
- `Template/ImportExcel/Chuyen_tien_noi_bo_VND.xls` — TK
- `Template/ImportExcel/Chung_tu_quyet_toan_tam_ung.xls` — TK
- `Template/ImportExcel/Chuyen_tien_noi_bo.xls` — TK
- `Template/ImportExcel/Chung_tu_mua_dich_vu_chua_thanh_toan.xls` — TK
- `Template/ImportExcel/Chi_phi_tra_truoc_dau_ky.xls` — TK
- `Template/ImportExcel/Ban_hang_VND.xls` — TK
- `Template/ImportExcel/Chung_tu_khau_tru_thue_TNCN.xls` — TK
- `Template/ImportExcel/Cong_cu_dung_cu_ghi_tang.xls` — TK
- `Template/ImportExcel/Chung_tu_quyet_toan_tam_ung_VND.xls` — TK
- `Template/ImportExcel/Chung_tu_mua_dich_vu_chua_thanh_toan_VND.xls` — TK
- `Template/ListMergeFieldSample/PhieuChiMau.xls` — AccountObject
- `Template/ListMergeFieldSample/DonMuaHangMau.xls` — AccountObject
- `Template/ListMergeFieldSample/Phieu_thuMau.xls` — AccountObject, TK
- `Template/ListMergeFieldSample/DonDatHangMau.xls` — AccountObject
- `Template/ListMergeFieldSample/BaoGiaMau.xls` — AccountObject
- `Template/ListMergeFieldSample/PhieuXuatMau.xls` — AccountObject
- `Template/ListMergeFieldSample/ChungTuMuaHHDVMau.xls` — AccountObject
- `Template/ListMergeFieldSample/ChungTuKeToanMau.xls` — AccountObject
- `Template/ListMergeFieldSample/ChungTuBanHangMau.xls` — AccountObject, TK
- `Bin/ColumnCollection.XML` — AccountNumber, AccountObject
- `Bin/01GTKT_0000001Empty.xml` — AccountObject, TK
- `Bin/x86/CefSharp.Core.Runtime.xml` — TK

## 7. Template/Resources/viVI.json — field màn hình nhập liệu chính

File: `Template/Resources/viVI.json Unknown More info (Alt + →)`

### frmReceipt
[không có match trực tiếp theo key form]

### frmPayment
[không có match trực tiếp theo key form]

### frmSAInvoice
[không có match trực tiếp theo key form]

### frmPUInvoice
[không có match trực tiếp theo key form]

### frmFA
[không có match trực tiếp theo key form]

### FixedAsset
- 0||grdList|FixedAssetCategoryName = Loại tài sản
- 0||grdList|FixedAssetName = Tên tài sản
- 0||grdList|FixedAssetCode = Mã tài sản
- 0|grbVoucherInfo|grdDetail|FixedAssetName = Tên tài sản
- 0|grbVoucherInfo|grdDetail|FixedAssetCode = Mã tài sản
- 0|grbVoucherInfo|grdDetail|FixedAssetCategoryID = Loại tài sản
- 0||grdList|FixedAssetCode = Mã tài sản
- 0||grdList|FixedAssetName = Tên tài sản
- 0||grdList|FixedAssetCategoryName = Loại tài sản

### SAInvoice
- 0||grdSAInvoice|TotalAmount = Tổng tiền thanh toán
- 0||grdSAInvoice|InvTemplateNo = Mẫu số
- 0||grdSAInvoice|InvSeries = Ký hiệu
- 0||grdSAInvoice|JournalMemo = Diễn giải
- 0||grdSAInvoice|RefTypeName = Loại chứng từ
- 0||grdSAInvoice|InvNo = Số hóa đơn
- 0||grdSAInvoice|TotalAmount = Tổng tiền thanh toán

### PUInvoice
- tpPUInvoice|grbInvoice = Hóa đơn
- tpPUInvoice|grbInvoiceGeneral = TT chung

## 8. GỢI Ý ÁP DỤNG CHO KE-TOAN-10A

### ⑤ Số chứng từ
- Thiết kế `voucher_series` theo loại nghiệp vụ: thu/chi tiền mặt, ngân hàng/UNC, bán hàng, mua hàng, nhập kho/xuất kho, tổng hợp. Tách `prefix`, `running_no`, `fiscal_year`, `reset_policy`, `display_no`. Cho phép import giữ nguyên số MISA cũ (`RefNo`/`VoucherNo`) và kiểm tra trùng theo năm + loại.

### ⑥ Đa tiền tệ
- Schema chứng từ nên có `currency_id`, `exchange_rate`, cặp tiền nguyên tệ/quy đổi cho từng dòng (`amount_oc`/`amount`, tax, discount, debit/credit). Báo cáo và import phải map các cột tỷ giá/ngoại tệ thay vì chỉ lưu VND.

### ⑦ TSCĐ multi-TK
- TSCĐ cần bảng phân bổ khấu hao nhiều dòng: `fixed_asset_id`, `department/cost_object`, `expense_account`, `allocation_rate`, `depreciation_amount`, `accumulated_depreciation_account`. Không hard-code một TK chi phí duy nhất.

### ⑧ TT99 / hệ thống tài khoản
- Cần chart-of-accounts versioning: TT200/TT133/TT99 dưới dạng `coa_scheme`, hiệu lực theo kỳ, mapping import tài khoản MISA, và lớp chuyển đổi khi doanh nghiệp nâng chế độ kế toán.


---
Báo cáo sinh tự động bằng Python; các header Excel là dòng có nhiều ô text nhất trong 30 dòng đầu, nên cần review thủ công trước khi dùng làm migration contract cứng.
