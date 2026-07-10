'use client';
// R5 Phase D — Tutorial hệ thống kiểu game: overlay tối + spotlight cutout quanh element
// (box-shadow 0 0 0 9999px trên hole đặt theo getBoundingClientRect) + tooltip card + Tiếp/Bỏ qua/Tắt hẳn.
// Lưu localStorage 'citadel.tutorial' = { done: {tourId:true}, off: boolean }.
// Mở lại: event 'citadel:tutorial-start' (nút "?" header) — chạy lại tour trang hiện tại kể cả đã done.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';

interface Step { sel?: string; title: string; text: string }
// Quiz 3 câu kết thúc mỗi tutorial (anh Nấng chỉ thị 09/07/2026): mỗi câu 3 lựa chọn, có đáp án + giải thích.
interface QuizQ { q: string; options: string[]; answer: number; explain?: string }
// always=true → tự hiện MỔI lần vào trang (bỏ qua đã done), chỉ tôn trọng "Tắt hẳn" toàn cục.
interface Tour { id: string; ver?: number; steps: Step[]; quiz?: QuizQ[]; always?: boolean }

const LS_KEY = 'citadel.tutorial';
/** Khóa done theo version — bump ver của tour → user cũ được xem lại bản mới 1 lần (R7.5). */
const doneKey = (t: Tour) => `${t.id}@v${t.ver ?? 1}`;

export const TOURS: Record<string, Tour> = {
  '/home': {
    id: 'home',
    steps: [
      { title: 'Chào mừng đến SUPERCITADEL 🏯', text: 'Pháo đài quản trị cho quán của bạn — kế toán, CRM, kho, nhân sự chạy trên data thật, cùng trợ lý AI Tiểu Tâm. Đi một vòng 2 phút nhé!' },
      { sel: '.owned-bar', title: 'Thanh module sở hữu', text: 'Các module bạn đang sở hữu/thuê nằm ở đây. Màu chấm cho biết trạng thái: xanh = đang bật, vàng = đang thuê, đỏ = sắp hết hạn. Chạm để mở nhanh.' },
      { sel: '.sidebar', title: 'Điều hướng nhóm nghiệp vụ', text: 'Sidebar chia theo nhóm: Tổng quan, Nghiệp vụ (Kế toán/CRM/Kho/Nhân sự), Kinh tế. Có thể thu gọn bằng nút ở góc dưới.' },
      { sel: '[data-tut="nav-om"]', title: 'Ví Om — tiền tệ nội bộ', text: 'Om là đồng tiền trong SUPERCITADEL: dùng mua/thuê module và mua vật phẩm cho Tiểu Tâm. Nạp, xem lịch sử thu chi trong Ví Om.' },
      { sel: '[data-tut="nav-modules"]', title: 'Cửa hàng Module', text: 'Mua đứt hoặc THUÊ module theo gói 7/30/90 ngày. Thuê rẻ hơn để dùng thử, hết hạn thì gia hạn — không mất data.' },
      { sel: '[data-tut="biz-group"]', title: 'Trang nghiệp vụ — data thật', text: 'Kế toán sổ kép, CRM pipeline, Kho hàng cảnh báo sắp hết, Nhân sự chấm công ca. Mọi con số đều là dữ liệu thật của tổ chức bạn.' },
      { sel: '.tb-energy', title: 'Tiểu Tâm AI 🦊', text: 'Trợ lý AI của quán — hỏi doanh thu, deal, tồn kho bằng tiếng Việt. Tương lai còn có Automato Thư Ký: nhân viên AI phụ trách từng bộ phận.' },
      { title: 'Bắt đầu thôi! 🚀', text: 'Bạn có thể xem lại hướng dẫn bất cứ lúc nào bằng nút "?" trên đầu trang, hoặc tắt hẳn trong Cài đặt → Hướng dẫn sử dụng.' },
    ],
  },
  '/accounting': {
    id: 'accounting',
    steps: [
      { sel: '.tabs', title: 'Tab nghiệp vụ kế toán', text: 'Thu Chi (phiếu thu/chi ghi sổ kép), Công nợ theo đối tượng, Báo cáo lãi lỗ theo tháng.' },
      { sel: '[data-tut="excel"]', title: 'Kết nối Excel', text: 'Xuất 4 báo cáo ra .xlsx, tải file mẫu nhập hóa đơn, điền rồi nạp lên — hệ thống tự ghi sổ.' },
      { sel: '.biz-aside', title: 'Sổ bên phải', text: 'Panel tổng hợp: sổ gần đây, số dư quỹ tiền mặt/ngân hàng — cập nhật ngay khi bạn ghi sổ.' },
    ],
  },
  '/modules': {
    id: 'modules',
    ver: 2, // R7.5: thêm bước Module Company
    steps: [
      { sel: '.mod-grid', title: 'Mua / Thuê / Bật-tắt', text: 'Mỗi module có giá mua đứt và gói thuê 7/30/90 ngày. Switch trên đầu card để bật/tắt module đã sở hữu.' },
      { sel: '[data-tut="company-module-card"]', title: 'Module Company 🏢 — MAY ĐO', text: 'Mới! Mô tả doanh nghiệp của bạn qua 5 bước — đội Citadel sẽ forge module quản trị riêng và gắn thẳng vào pháo đài. Bấm 「＋ Add」 là có hướng dẫn điền từng bước.' },
      { sel: '.owned-bar', title: 'Thanh sở hữu', text: 'Module mua/thuê xong sẽ hiện ở thanh này trên mọi trang — chạm để nhảy thẳng vào module.' },
    ],
  },
  // Tour riêng Module Company — không gắn path, kích hoạt bằng event khi mở wizard (R7.5)
  '@company-wizard': {
    id: 'company-wizard',
    steps: [
      { title: 'Hồ sơ may đo Module Company 🏢', text: 'Form này gồm 5 bước — điền như kể chuyện cho người mới vào làm, không cần thuật ngữ. Càng thật càng tốt — đội Citadel thiết kế module dựa đúng trên những gì bạn kể.' },
      { sel: '.cmw-progress', title: 'Thanh tiến độ', text: '5 bước: Thông tin chung → Phòng ban → Vận hành ⭐ → Dữ liệu & Module → Ưu tiên. Bước 3 (Vận hành) quan trọng nhất — kể một vòng công việc từ lúc có khách đến lúc thu tiền.' },
      { sel: '.cmw-field', title: 'Điền tự nhiên', text: 'Dấu * là bắt buộc. Viết ngắn cũng được — ví dụ 「quán cà phê 2 chi nhánh, bán tại chỗ + ship」. Không đưa mật khẩu/khóa API vào form.' },
      { sel: '.cmw-actions', title: 'Tiếp tục → Điều khoản → Add', text: 'Điền đủ bước nào nút Tiếp tục sáng bước đó. Sau bước 5 là điều khoản beta — đồng ý xong bấm 「＋ Add Module Company」, Tiểu Tâm nhận hồ sơ ngay. 🦊' },
    ],
  },
  '/ke-toan-10a': {
    id: 'ke-toan-10a-v2',
    ver: 3,
    steps: [
      { title: 'Kế Toán 10A FULL 🧾', text: 'Sổ kép TT133/TT200 độc lập: thu/chi, hóa đơn, công nợ, ngân hàng, TSCĐ, ngân sách, tỷ giá, báo cáo và Tiểu Tâm điều khiển bằng tiếng Việt.' },
      { sel: '[data-tut="k10a-kpi"]', title: 'KPI & tự-audit', text: 'Dashboard cho tiền 111/112, phải thu 131, phải trả 331, lãi/lỗ và badge SỔ CÂN — kiểm Σ Nợ = Σ Có bất kỳ lúc nào.' },
      { sel: '[data-tut="k10a-tabs"]', title: 'Thiết lập TT133/TT200', text: 'Lần đầu seed hệ thống tài khoản TT133; có thể dùng TT200 hoặc chart JSON tùy biến. Org nào thấy dữ liệu org đó, không lẫn module kế toán cũ.' },
      { sel: '[data-tut="k10a-quy"]', title: 'Sổ quỹ + đảo phiếu', text: 'Tạo phiếu thu/chi, chọn tài khoản đối ứng, ghi sổ ngay. Sai thì dùng Đảo: hệ thống tạo bút toán ngược, không xóa lịch sử.' },
      { sel: '[data-tut="k10a-hd"]', title: 'Hóa đơn, thuế, cấn trừ', text: 'Hóa đơn bán/mua nhiều dòng, thuế GTGT, thu/trả tiền theo hóa đơn, cấn trừ công nợ; credit note/debit note xử lý điều chỉnh giảm.' },
      { sel: '[data-tut="k10a-hd"]', title: 'Công nợ & hạn mức', text: 'Xem tuổi nợ, công nợ theo đối tác, nhắc hạn, sao kê khách/NCC; đặt credit limit và điều khoản thanh toán để chặn bán vượt hạn mức.' },
      { sel: '[data-tut="k10a-vh"]', title: 'Tạm ứng & định kỳ', text: 'Quản lý khách đặt cọc, ứng trước NCC, tạm ứng nhân viên; mẫu định kỳ cho thuê mặt bằng, lương, phí cố định — bấm chạy để bắt kịp kỳ tới hạn.' },
      { sel: '[data-tut="k10a-bank"]', title: 'Bank import + auto-match + rules', text: 'Dán/import CSV sao kê tài khoản 112, tự khớp với sổ, thêm rule theo nội dung giao dịch để sinh chứng từ và báo dòng chưa khớp.' },
      { sel: '[data-tut="k10a-asset"]', title: 'TSCĐ & khấu hao', text: 'Tạo tài sản cố định, nguyên giá, thời gian sử dụng; chạy khấu hao đường thẳng Nợ 642/Có 214, tự dừng khi đủ.' },
      { sel: '[data-tut="k10a-budget"]', title: 'Cost center, ngân sách, tỷ giá', text: 'Gắn bộ phận/dự án vào bút toán, xem lãi/lỗ theo chiều; đặt ngân sách năm, so thực tế; đánh giá lại ngoại tệ vào 515/635.' },
      { sel: '[data-tut="k10a-report"]', title: 'Kết chuyển & khóa kỳ', text: 'Cuối kỳ kết chuyển 511/515/711 và chi phí về 911 rồi 421; khóa năm tài chính để chặn ghi sửa sau quyết toán.' },
      { sel: '[data-tut="k10a-report"]', title: '12 báo cáo + Excel', text: 'Sổ cái, cân đối phát sinh, KQKD, CĐKT, LCTT, VAT, nhật ký chung, sổ quỹ, tuổi nợ, công nợ, nhắc hạn, ngân sách-vs-thực tế; xuất Excel khi cần.' },
      { sel: '.tb-energy', title: 'Ra lệnh Tiểu Tâm 10A', text: 'Ví dụ: “Tạo phiếu thu 10A 5 triệu từ Anh Ba”, “Ai nợ quá hạn?”, “Chạy khấu hao tháng này”, “Đối chiếu ngân hàng 112”. Lệnh nhạy cảm luôn dry-run rồi xác nhận.' },
      { sel: '[data-tut="k10a-demo"]', title: 'Dữ liệu mẫu an toàn', text: 'Dùng nút demo để tạo nghiệp vụ mẫu và xem luồng đầy đủ trước khi vận hành thật.' },
    ],
    quiz: [
      { q: 'Badge “SỔ CÂN” trên đầu trang kiểm tra điều gì?', options: ['Tổng Nợ = Tổng Có trên cân đối thử (sổ kép cân)', 'Số dư tiền mặt dương', 'Đã nộp thuế đủ'], answer: 0, explain: 'Sổ kép luôn phải cân Σ Nợ = Σ Có — badge này tự-audit liên tục, lệch là có bút toán sai.' },
      { q: 'Ghi nhầm một phiếu thu đã vào sổ thì xử lý đúng chuẩn là gì?', options: ['Xóa thẳng phiếu đó khỏi sổ', 'Dùng ĐẢO — hệ thống tạo bút toán ngược, giữ nguyên lịch sử', 'Sửa trực tiếp số tiền trong database'], answer: 1, explain: 'Kế toán chuẩn không xóa chứng từ đã ghi sổ — đảo bút toán để giữ dấu vết kiểm toán.' },
      { q: 'Kết chuyển cuối kỳ + khóa kỳ (tab Báo cáo) làm gì?', options: ['Xuất Excel toàn bộ sổ', 'Doanh thu/chi phí → 911 → 421, rồi KHÓA kỳ chặn ghi sửa', 'Xóa dữ liệu năm cũ'], answer: 1, explain: 'Kết chuyển đưa lãi/lỗ về 421 qua 911; khóa kỳ để không ai sửa sổ sau quyết toán — cần thì Mở lại.' },
    ],
  }, 
  '/crm': {
    id: 'crm',
    steps: [
      { sel: '.biz-main', title: 'CRM — khách hàng & pipeline', text: 'Danh sách khách, deal theo giai đoạn đàm phán. Data thật từ tổ chức bạn.' },
      { sel: '.biz-aside', title: 'Thống kê nhanh', text: 'Pipeline theo giai đoạn + khách mới nhất nằm ở panel bên phải.' },
    ],
  },
  '/inventory': {
    id: 'inventory',
    steps: [
      { sel: '.biz-main', title: 'Kho hàng', text: 'Tồn kho từng mặt hàng, nhập hàng, và cảnh báo sắp hết tự động.' },
      { sel: '.biz-aside', title: 'Cảnh báo low-stock', text: 'Mặt hàng dưới ngưỡng an toàn hiện ở đây — nhập thêm trước khi hết.' },
    ],
  },
  '/hr': {
    id: 'hr',
    steps: [
      { sel: '.biz-main', title: 'Nhân sự & ca làm', text: 'Chấm công check-in/check-out, phân ca, duyệt đơn nghỉ phép. Sau check-out nhân viên hiện badge "Đã về".' },
      { sel: '.biz-aside', title: 'Hôm nay', text: 'Ai đang làm ca, đơn nghỉ chờ duyệt — nhìn một phát là biết.' },
    ],
  },
  '/om': {
    id: 'om',
    steps: [
      { sel: '.scroll', title: 'Ví Om', text: 'Số dư, nạp Om, lịch sử thu chi. Om dùng để mua/thuê module và mua vật phẩm cho Tiểu Tâm.' },
    ],
  },
  '/items': {
    id: 'items',
    steps: [
      { sel: '.scroll', title: 'Kho vật phẩm', text: 'Đồ đã mua từ Cửa hàng nằm ở đây. Chạm vật phẩm → xác nhận Dùng → hiệu ứng thật (hồi năng lượng Tiểu Tâm, đổi theme).' },
    ],
  },

  // ── SOUL-TRADE (làm kỹ, nhất là Automato) — anh Nấng chỉ thị 09/07/2026 ──
  '/soul-trade': {
    id: 'soul-trade',
    ver: 1,
    always: true, // anh Nấng: luôn tự hiện khi vào Soul-Trade
    steps: [
      { title: 'Chào mừng đến Soul-Trade 📈', text: 'Module giao dịch tự động: bạn tạo bot, chọn cặp coin, rồi bật AUTOMATO cho nó tự quét – vào lệnh theo chiến thuật + AI. Đi một vòng 2 phút nhé!' },
      { sel: '.menu', title: 'Điều khiển vs Automato 🧭', text: 'Hai chế độ: “Điều khiển” để quản lý danh sách bot (tạo/chạy/dừng), “Automato” là bàn điều khiển giao dịch tự động cho từng bot.' },
      { sel: '.pair-card', title: 'Cặp coin đề xuất 💱', text: '10 coin hot — bấm 1 cái là tự bật Shadow + ULTRA + ARM cho cặp đó. Cách nhanh nhất để cho bot chạy thử.' },
      { sel: '.cap-chip', title: 'Vốn giả lập 🏵️', text: 'Bấm để đặt số vốn giả lập (paper). Automato dùng con số này để tính size + P&L% → anh dễ hình dung kết quả như vốn thật. Ví dụ đặt 1000 USDT rồi xem lời/lỗ bao nhiêu %.' },
      { sel: '.core', title: 'Nút tròn ARM — tim của Automato ⬡', text: 'Bấm để ARM (mở phiên) hoặc DISARM. Ngay dưới chữ ARM có badge cho biết đang đặt bao nhiêu đòn bẩy (ví dụ 5×, hoặc AUTO 2–20×). Khi đang giữ lệnh, nút hiện P&L live.' },
      { sel: '.levstrip', title: 'Đòn bẩy ⚙️', text: 'Kéo thanh để chọn đòn bẩy (tối đa 125×). Bấm “Advance” để chọn Isolated/Cross, bật Auto-Leverage theo biến động, hoặc model A (giữ risk%) / B (khuếch đại size).' },
      { sel: '.at-tabs', title: '4 tab Automato 📊', text: 'Auto (bàn điều khiển), Phân tích (chỉ số + nến), Shield (risk shell: SL/TP phiên + kill-switch), Nhật ký (lịch sử vào/ra lệnh).' },
      { sel: '.card.cfg', title: 'Super Automato 🧠', text: 'Cấu hình chuyển pha SIM → VỐN THẬT theo chuỗi thắng/thua. Soft (3), Hard (5), ULTRA hoặc Custom — giả lập trước, thật sau.' },
      { title: 'Lưu ý quan trọng ⚠️', text: 'Automato hiện chạy MÔ PHỎNG (paper) theo giá live ccxt: đòn bẩy ảnh hưởng tính ký quỹ, giá thanh lý và P&L mô phỏng. Muốn đặt lệnh + set đòn bẩy THẬT trên sàn cần nối API key sàn (test testnet trước).' },
    ],
    quiz: [
      { q: 'Nút tròn ARM dùng để làm gì?', options: ['Mở/đóng phiên giao dịch tự động (ARM/DISARM)', 'Xóa bot', 'Nạp tiền'], answer: 0, explain: 'Bấm ARM để mở phiên Automato, bấm lại để DISARM. Badge dưới chữ ARM cho biết đòn bẩy đang đặt.' },
      { q: 'Đòn bẩy trong Automato hiện đang hoạt động ở đâu?', options: ['Đặt lệnh + set leverage thật lên sàn', 'Chỉ trong mô phỏng (tính ký quỹ, thanh lý, P&L)', 'Không có tác dụng gì'], answer: 1, explain: 'Automato hiện là engine paper: đòn bẩy chỉ ảnh hưởng phần mô phỏng, chưa gửi lệnh thật lên sàn.' },
      { q: 'Vốn giả lập (paper capital) dùng để làm gì?', options: ['Đặt số vốn để Automato tính size + P&L% cho dễ hình dung', 'Nạp tiền thật vào sàn', 'Không có tác dụng'], answer: 0, explain: 'Vốn giả lập là số vốn paper để mô phỏng: Automato tính size và lời/lỗ % dựa trên con số này, không ảnh hưởng tiền thật.' },
    ],
  },

  // ── SOUL-SALE (làm kỹ) ──
  '/soul-sale': {
    id: 'soul-sale',
    ver: 1,
    steps: [
      { title: 'Chào mừng đến Soul-Sale 🎯', text: 'Module bán hàng & phân phối: quản lý lead, pipeline deal, kênh đại lý/điểm bán, báo giá – đơn hàng, giá & công nợ và đối soát bảng kê. Đi một vòng nhé!' },
      { sel: '.tabs', title: '8 tab nghiệp vụ 🧭', text: 'Tổng quan, Khách hàng, Đại lý & Điểm bán, CRM, Bán hàng, Giá & Công nợ, Đối soát, Tất cả tác vụ. Chạm để chuyển nhóm.' },
      { sel: '.card', title: 'Pipeline & việc nên làm 📈', text: 'Tab Tổng quan cho thấy pipeline (số deal mở, giá trị trọng số) và gợi ý “việc nên làm ngay” như chốt báo giá, nhắc nợ, gọi lại khách.' },
      { sel: '.page-head', title: 'Hoàn tác an toàn ↩', text: 'Mọi thao tác ghi đều có lịch sử — bấm Hoàn tác để lùi lại. Thao tác nhạy cảm (chuyển tuyến, chốt bảng kê, hủy) luôn hỏi xác nhận trước.' },
      { title: 'Đối soát bảng kê đại lý 🧾', text: 'Tab Đối soát: nạp bảng kê đại lý (splitter), đối soát, xử lý dòng ngoại lệ rồi chốt. Commit chỉ ghi dòng hợp lệ, bỏ dòng trùng.' },
    ],
    quiz: [
      { q: 'Tab nào dùng để xem cây kênh phân phối và điểm bán lẻ?', options: ['Đại lý & Điểm bán', 'Giá & Công nợ', 'Đối soát'], answer: 0, explain: 'Tab Đại lý & Điểm bán hiển cây kênh phân phối và danh sách điểm bán lẻ.' },
      { q: 'Khi chạy thao tác nhạy cảm (ví dụ chốt bảng kê, hủy), hệ thống làm gì?', options: ['Chạy ngay không hỏi', 'Hỏi xác nhận trước', 'Chỉ lưu nháp'], answer: 1, explain: 'Thao tác nhạy cảm luôn hiện hộp xác nhận vì có thể ảnh hưởng dữ liệu bán hàng.' },
      { q: 'Nếu lỡ thao tác sai, làm sao lùi lại?', options: ['Không thể lùi', 'Dùng lịch sử → bấm Hoàn tác', 'Xóa toàn bộ module'], answer: 1, explain: 'Mọi thao tác ghi đều vào lịch sử, bấm Hoàn tác để lùi bước gần nhất.' },
    ],
  },

  // ── SOUL-INVENTORY ──
  '/soul-inventory': {
    id: 'soul-inventory',
    ver: 1,
    steps: [
      { title: 'Chào mừng đến Kho vận 📦', text: 'Soul-Inventory quản lý tồn kho, vật tư, nghiệp vụ nhập·xuất·chuyển và cảnh báo tồn thấp/cận hạn. Bắt đầu từ tổng quan kho nhé.' },
      { sel: '.btn-p', title: 'Chọn khu vực làm việc 🧭', text: 'Dãy nút trên chuyển giữa Tồn kho, Vật tư, Nhập·Xuất·Chuyển và Cảnh báo. Nút đang chọn sẽ nổi bật.' },
      { sel: '.card', title: 'Xem nhanh tồn kho 📊', text: 'Thẻ tổng quan hiển số vật tư, tồn khả dụng, số mặt hàng sắp hết và giá trị tồn ước tính — bảng sức khỏe nhanh của kho.' },
      { sel: '.inp', title: 'Tìm vật tư nhanh 🔎', text: 'Gõ tên hoặc SKU rồi Enter để lọc danh sách tồn kho.' },
      { sel: '.sh-panel', title: 'Thêm vật tư & ghi sổ ✅', text: 'Thêm vật tư cần SKU + tên (bắt buộc). Khi nhập/xuất/chuyển kho, hệ thống cho xem trước rồi mới “Xác nhận ghi sổ”.' },
    ],
    quiz: [
      { q: 'Tab nào để xem tồn khả dụng và tìm vật tư theo SKU?', options: ['Tồn kho', 'Cảnh báo', 'Nhập·Xuất·Chuyển'], answer: 0, explain: 'Tab Tồn kho hiển danh sách stock và có ô tìm theo tên hoặc SKU.' },
      { q: 'Khi thêm vật tư mới, thông tin nào bắt buộc?', options: ['Barcode và hạn sử dụng', 'SKU và tên vật tư', 'Kho đi và kho đến'], answer: 1, explain: 'Hệ thống bắt buộc SKU và tên vật tư trước khi lưu.' },
      { q: 'Nghiệp vụ nhập/xuất/chuyển kho theo quy trình nào?', options: ['Ghi sổ ngay không kiểm tra', 'Xem trước rồi xác nhận ghi sổ', 'Chỉ lưu nháp'], answer: 1, explain: 'Luôn xem trước (preview) rồi mới xác nhận ghi sổ.' },
    ],
  },

  // ── SOUL-MANAGER ──
  '/soul-manager': {
    id: 'soul-manager',
    ver: 1,
    steps: [
      { title: 'Bắt đầu quản lý nhân sự 👥', text: 'Soul-Manager theo dõi nhân viên, phòng ban, nghỉ phép và bảng lương trong một màn hình. Mỗi tab là một nhóm công việc.' },
      { sel: '.btn-p', title: 'Chuyển tab nghiệp vụ 🧭', text: 'Nhân viên, Tổ chức, Nghỉ phép, Bảng lương — bấm để chuyển nhanh.' },
      { sel: '.card', title: 'Danh sách nhân viên 👤', text: 'Hiển họ tên, mã NV, chức danh, phòng ban, lương cơ bản và trạng thái (Thử việc/Chính thức/Nghỉ phép/Đã nghỉ).' },
      { sel: '.inp', title: 'Xem số dư nghỉ phép 🕒', text: 'Tab Nghỉ phép: nhập mã nhân viên (ví dụ NV0001) rồi bấm Xem — hiện từng loại phép: được cấp, đã dùng, còn lại.' },
      { sel: '.sh-panel', title: 'Thêm NV & chạy lương 💰', text: 'Thêm nhân viên cần họ tên (bắt buộc). Tab Bảng lương: nhập tháng/năm rồi “Chạy lương” — trả về số NV, tổng gross và net.' },
    ],
    quiz: [
      { q: 'Tab nào hiển tổng nhân sự, chưa phân bổ và số phòng ban?', options: ['Tổ chức', 'Nghỉ phép', 'Bảng lương'], answer: 0, explain: 'Tab Tổ chức đọc org chart: tổng nhân sự, chưa phân bổ, số phòng ban.' },
      { q: 'Khi thêm nhân viên mới, trường nào bắt buộc?', options: ['Họ tên', 'Chức danh', 'Lương cơ bản'], answer: 0, explain: 'Hệ thống báo “Nhập tên nhân viên trước đã” nếu chưa có tên.' },
      { q: 'Tab Nghỉ phép cần nhập gì để xem số dư?', options: ['Tên phòng ban', 'Mã nhân viên', 'Tháng lương'], answer: 1, explain: 'Nhập mã nhân viên để gọi API số dư phép.' },
    ],
  },

  // ── SOUL-RESTAURANT ──
  '/soul-restaurant': {
    id: 'soul-restaurant',
    ver: 1,
    steps: [
      { title: 'Trung tâm điều hành nhà hàng 🍽️', text: 'Soul-Restaurant gom toàn bộ vận hành quán vào một console: bàn, order, bếp/KDS, bill, đặt bàn, khuyến mãi, khách hàng, báo cáo. Mỗi nhóm nằm trong một tab.' },
      { sel: '.tabs', title: 'Chọn nhóm nghiệp vụ 🧭', text: 'Chuyển giữa Bảng điều khiển, Sàn & Bàn, Đơn hàng, Bếp/KDS, Menu, Bill… Danh sách năng lực bên dưới đổi theo nhóm.' },
      { sel: '.grid2', title: 'Các thẻ thao tác sống ⚙️', text: 'Mỗi thẻ là một năng lực thật (Tra cứu hoặc Thao tác), gọi đúng route API tương ứng.' },
      { sel: '.pill', title: 'Thao tác nhạy cảm 🔐', text: 'Thẻ có nhãn “Cần xác nhận” (hủy món, giảm giá, gộp bàn, tạo bill, thanh toán) sẽ hỏi xác nhận trước khi chạy.' },
      { sel: '.btn-primary', title: 'Chạy thử / xác nhận ▶️', text: 'Nút chính hiện “Chạy thử” (tra cứu/thao tác thường) hoặc “Xác nhận…” (nhạy cảm). Kết quả hiện ngay bên dưới, có nút Xem JSON để đối soát.' },
    ],
    quiz: [
      { q: 'Nhóm nào dùng để xem sơ đồ bàn và thêm/sửa bàn?', options: ['Sàn & Bàn', 'Khuyến mãi', 'Báo cáo'], answer: 0, explain: 'Nhóm Sàn & Bàn có các năng lực sơ đồ bàn và thêm/sửa bàn.' },
      { q: 'Khi một năng lực là nhạy cảm, UI làm gì trước khi chạy?', options: ['Tự chạy ngay', 'Hiện xác nhận trước', 'Chỉ xem JSON'], answer: 1, explain: 'Thao tác nhạy cảm hiện hộp xác nhận trước khi gọi API.' },
      { q: 'Nút “Xem JSON” trong kết quả dùng để làm gì?', options: ['Chuyển tab', 'Hiện payload JSON gốc để đối soát', 'Tạo bàn mới'], answer: 1, explain: 'Xem JSON hiện payload gốc của kết quả để kiểm tra kỹ thuật.' },
    ],
  },

  // ── SOUL-WALLET (6 hũ + công nợ + định kỳ) ──
  '/soul-wallet': {
    id: 'soul-wallet',
    ver: 1,
    steps: [
      { title: 'Chào mừng đến Ví 6 Hũ 🏵️', text: 'Soul-Wallet quản lý tài chính cá nhân theo phương pháp 6 hũ: chia thu nhập, theo dõi chi tiêu, công nợ và khoản định kỳ.' },
      { sel: '.chip', title: 'Chia 6 hũ từ thu nhập 🥚', text: 'Nhập thu nhập tháng → hệ thống chia tự động vào 6 hũ (thiết yếu, tự do, tiết kiệm, giáo dục, hưởng thụ, cho đi) theo tỷ lệ bạn đặt.' },
      { title: 'Công nợ hai chiều 💸', text: 'Theo dõi “Họ nợ mình” và “Mình nợ họ”, ghi nợ/trả, lãi dồn và nhắc hạn — không để sót khoản nào.' },
      { title: 'Khoản định kỳ & heatmap 📅', text: 'Lưu khoản định kỳ (ngày/tuần/tháng/năm), bấm “Chạy kỳ đến hạn” để ghi sổ. Heatmap cho thấy ngày đốt tiền nhiều nhất.' },
    ],
    quiz: [
      { q: 'Soul-Wallet chia thu nhập theo phương pháp nào?', options: ['6 hũ', '3 tài khoản', 'Không chia'], answer: 0, explain: 'Module dùng phương pháp 6 hũ để chia thu nhập tháng.' },
      { q: 'Công nợ trong Ví theo dõi mấy chiều?', options: ['Chỉ mình nợ họ', 'Hai chiều: họ nợ mình & mình nợ họ', 'Không theo dõi nợ'], answer: 1, explain: 'Ví theo dõi cả “Họ nợ mình” và “Mình nợ họ”, có lãi dồn và nhắc hạn.' },
      { q: 'Nút “Chạy kỳ đến hạn” dùng để làm gì?', options: ['Ghi sổ các khoản định kỳ đã tới hạn', 'Xóa ví', 'Đổi theme'], answer: 0, explain: 'Nút này ghi sổ các khoản định kỳ đã đến kỳ đáo hạn.' },
    ],
  },
};

interface TutState { done: Record<string, boolean>; off: boolean }
export function loadTut(): TutState {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return { done: {}, off: false, ...JSON.parse(raw) }; } catch {}
  return { done: {}, off: false };
}
export function saveTut(s: TutState) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {} }

export function Tutorial() {
  const path = usePathname();
  const [tour, setTour] = useState<Tour | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Quiz state: -1 = chưa vào quiz; >=0 = đang ở câu thứ n.
  const [quizIdx, setQuizIdx] = useState(-1);
  const [quizPick, setQuizPick] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);

  const tourFor = useCallback((p: string | null): Tour | null => {
    if (!p) return null;
    const key = Object.keys(TOURS).find((k) => !k.startsWith('@') && (p === k || p.startsWith(k + '/')));
    return key ? TOURS[key] : null;
  }, []);

  // auto-start lần đầu vào trang (nếu chưa done + chưa tắt)
  useEffect(() => {
    setTour(null); setI(0); setRect(null); setCardPos(null); setQuizIdx(-1); setQuizPick(null); setQuizScore(0);
    const t = tourFor(path);
    if (!t) return;
    const st = loadTut();
    // Tắt hẳn (off) luôn ưu tiên. Tour always bỏ qua done → tự hiện mỗi lần vào.
    if (st.off) return;
    if (!t.always && st.done[doneKey(t)]) return;
    const h = setTimeout(() => { setTour(t); setI(0); }, 650); // chờ trang render
    return () => clearTimeout(h);
  }, [path, tourFor]);

  // nút "?" header — chạy lại tour trang hiện tại (bỏ qua done/off)
  useEffect(() => {
    const start = () => { const t = tourFor(path); if (t) { setTour(t); setI(0); setQuizIdx(-1); setQuizPick(null); setQuizScore(0); } };
    window.addEventListener('citadel:tutorial-start', start);
    return () => window.removeEventListener('citadel:tutorial-start', start);
  }, [path, tourFor]);

  // tour theo tên (R7.5) — component khác (ví dụ wizard Module Company) yêu cầu tour riêng
  useEffect(() => {
    const startNamed = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (!id) return;
      const t = Object.values(TOURS).find((x) => x.id === id);
      if (!t) return;
      const st = loadTut();
      const force = Boolean((e as CustomEvent).detail?.force);
      if (!force && (st.off || st.done[doneKey(t)])) return;
      setTimeout(() => { setTour(t); setI(0); setQuizIdx(-1); setQuizPick(null); setQuizScore(0); }, 450); // chờ sheet render
    };
    window.addEventListener('citadel:tutorial-tour', startNamed);
    return () => window.removeEventListener('citadel:tutorial-tour', startNamed);
  }, []);

  // đo spotlight + đặt tooltip mỗi khi đổi bước
  useEffect(() => {
    if (!tour) return;
    const step = tour.steps[i];
    if (!step) return;
    let raf = 0;
    const measure = () => {
      let r: DOMRect | null = null;
      if (step.sel) {
        const el = document.querySelector(step.sel) as HTMLElement | null;
        if (el) {
          const b = el.getBoundingClientRect();
          if (b.width > 4 && b.height > 4 && b.bottom > 0 && b.top < window.innerHeight + 400) {
            el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            r = el.getBoundingClientRect();
          }
        }
      }
      if (r) {
        const pad = 8;
        const hole = { x: Math.max(4, r.left - pad), y: Math.max(4, r.top - pad), w: Math.min(window.innerWidth - 8, r.width + pad * 2), h: r.height + pad * 2 };
        setRect(hole);
        // tooltip: dưới hole nếu đủ chỗ, không thì trên
        const ch = cardRef.current?.offsetHeight ?? 190;
        const cw = Math.min(320, window.innerWidth - 24);
        const below = hole.y + hole.h + 14;
        const top = below + ch < window.innerHeight - 12 ? below : Math.max(12, hole.y - ch - 14);
        const left = Math.min(Math.max(12, hole.x + hole.w / 2 - cw / 2), window.innerWidth - cw - 12);
        setCardPos({ top, left });
      } else {
        setRect(null); setCardPos(null); // bước center (welcome/kết) hoặc element ẩn (mobile)
      }
    };
    raf = requestAnimationFrame(() => setTimeout(measure, 80));
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [tour, i]);

  if (!tour) return null;
  const step = tour.steps[i];
  const last = i === tour.steps.length - 1;

  const finish = (markDone: boolean) => {
    if (markDone) { const st = loadTut(); st.done[doneKey(tour)] = true; saveTut(st); }
    setTour(null); setRect(null); setCardPos(null);
  };
  const killAll = () => { const st = loadTut(); st.off = true; st.done[doneKey(tour)] = true; saveTut(st); setTour(null); };

  const quiz = tour.quiz ?? [];
  const hasQuiz = quiz.length > 0;
  const inQuiz = quizIdx >= 0;
  const enterQuiz = () => { setQuizIdx(0); setQuizPick(null); setQuizScore(0); setRect(null); setCardPos(null); };
  const pickQuiz = (idx: number) => { if (quizPick != null) return; setQuizPick(idx); if (idx === quiz[quizIdx].answer) setQuizScore((s) => s + 1); };
  const nextQuiz = () => {
    if (quizIdx + 1 < quiz.length) { setQuizIdx(quizIdx + 1); setQuizPick(null); }
    else { setQuizIdx(quiz.length); setQuizPick(null); } // quiz.length = màn kết quả
  };

  // ── QUIZ CARD ─────────────────────────────────────────────
  if (inQuiz) {
    const done = quizIdx >= quiz.length; // màn tổng kết
    if (done) {
      const pass = quizScore >= Math.ceil(quiz.length * 2 / 3); // ≥2/3 là đạt
      return (
        <div className="tut-layer" role="dialog" aria-label="Quiz hướng dẫn">
          <div className="tut-dim" />
          <div ref={cardRef} className="tut-card center">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="tut-step mono">QUIZ</span>
              <b style={{ fontSize: 15 }}>{pass ? 'Đạt rồi! 🎉' : 'Gần đúng rồi 💪'}</b>
            </div>
            <p style={{ fontSize: 13, color: 'var(--mut)', lineHeight: 1.6, margin: '10px 0 0' }}>
              Bạn trả lời đúng <b style={{ color: pass ? 'var(--up,#57C88A)' : 'var(--brass,#E8B04B)' }}>{quizScore}/{quiz.length}</b> câu.
              {pass ? ' Bạn đã nắm được module này.' : ' Xem lại hướng dẫn rồi thử lại nhé.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <button className="tut-kill" onClick={killAll}>Tắt hẳn</button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="tut-skip" onClick={enterQuiz}>Làm lại quiz</button>
                <button className="tut-next" onClick={() => finish(true)}>Hoàn tất ✓</button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    const qq = quiz[quizIdx];
    const answered = quizPick != null;
    return (
      <div className="tut-layer" role="dialog" aria-label="Quiz hướng dẫn">
        <div className="tut-dim" />
        <div ref={cardRef} className="tut-card center" style={{ maxWidth: 360 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="tut-step mono">Quiz {quizIdx + 1}/{quiz.length}</span>
            <b style={{ fontSize: 14 }}>Kiểm tra nhanh 📝</b>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, margin: '10px 0 10px' }}>{qq.q}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {qq.options.map((op, idx) => {
              const correct = idx === qq.answer;
              const chosen = quizPick === idx;
              const cls = !answered ? 'quiz-opt' : correct ? 'quiz-opt ok' : chosen ? 'quiz-opt bad' : 'quiz-opt dim';
              return (
                <button key={idx} className={cls} disabled={answered} onClick={() => pickQuiz(idx)}>
                  <span className="quiz-key">{String.fromCharCode(65 + idx)}</span>{op}
                  {answered && correct ? <span className="quiz-mark"> ✓</span> : answered && chosen ? <span className="quiz-mark"> ✕</span> : null}
                </button>
              );
            })}
          </div>
          {answered && qq.explain && (
            <p style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.55, margin: '10px 0 0', borderLeft: '2px solid var(--brass,#E8B04B)', paddingLeft: 9 }}>{qq.explain}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <button className="tut-kill" onClick={killAll}>Tắt hẳn</button>
            <button className="tut-next" style={{ marginLeft: 'auto' }} disabled={!answered} onClick={nextQuiz}>
              {quizIdx + 1 < quiz.length ? 'Câu tiếp →' : 'Xem kết quả →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // R7.6: bước không có element (welcome/kết) — dùng class center, KHÔNG inline transform
  // (animation scaleIn fill both ghi đè transform inline → card văng góc phải trên mobile)
  const card = (
    <div ref={cardRef} className={`tut-card${cardPos ? '' : ' center'}`} style={cardPos ? { top: cardPos.top, left: cardPos.left } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="tut-step mono">{i + 1}/{tour.steps.length}</span>
        <b style={{ fontSize: 14.5 }}>{step.title}</b>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--mut)', lineHeight: 1.6, margin: '9px 0 0' }}>{step.text}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <button className="tut-kill" onClick={killAll}>Tắt hẳn</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!last && <button className="tut-skip" onClick={() => (hasQuiz ? enterQuiz() : finish(true))}>Bỏ qua</button>}
          <button className="tut-skip" disabled={i === 0} onClick={() => setI(Math.max(0, i - 1))}>← Quay lại</button>
          <button className="tut-next" onClick={() => (last ? (hasQuiz ? enterQuiz() : finish(true)) : setI(i + 1))}>
            {last ? (hasQuiz ? 'Làm quiz 📝' : 'Hoàn tất ✓') : 'Tiếp →'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="tut-layer" role="dialog" aria-label="Hướng dẫn sử dụng">
      {rect
        ? <div className="tut-hole" style={{ top: rect.y, left: rect.x, width: rect.w, height: rect.h }} />
        : <div className="tut-dim" />}
      {card}
    </div>
  );
}

/** Nút "?" ở header Shell — mở lại tour trang hiện tại. */
export function TutorialHelpButton() {
  return (
    <button className="tb-act" title="Hướng dẫn trang này" aria-label="Hướng dẫn trang này"
      onClick={() => window.dispatchEvent(new Event('citadel:tutorial-start'))}>
      <Icon name="help" size={16} />
    </button>
  );
}

/** R7.6: nút "?" nổi cho MOBILE (topbar desktop ẩn <1024px nên trước đây không gọi lại tour được). */
export function TutorialFab() {
  const path = usePathname();
  const has = Boolean(path && Object.keys(TOURS).find((k) => !k.startsWith('@') && (path === k || path.startsWith(k + '/'))));
  if (!has) return null;
  return (
    <button className="tut-fab" title="Gọi hướng dẫn trang này" aria-label="Gọi hướng dẫn trang này"
      onClick={() => window.dispatchEvent(new Event('citadel:tutorial-start'))}>
      <Icon name="help" size={17} />
    </button>
  );
}
