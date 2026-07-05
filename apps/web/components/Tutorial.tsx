'use client';
// R5 Phase D — Tutorial hệ thống kiểu game: overlay tối + spotlight cutout quanh element
// (box-shadow 0 0 0 9999px trên hole đặt theo getBoundingClientRect) + tooltip card + Tiếp/Bỏ qua/Tắt hẳn.
// Lưu localStorage 'citadel.tutorial' = { done: {tourId:true}, off: boolean }.
// Mở lại: event 'citadel:tutorial-start' (nút "?" header) — chạy lại tour trang hiện tại kể cả đã done.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';

interface Step { sel?: string; title: string; text: string }
interface Tour { id: string; ver?: number; steps: Step[] }

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
    ver: 2,
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

  const tourFor = useCallback((p: string | null): Tour | null => {
    if (!p) return null;
    const key = Object.keys(TOURS).find((k) => !k.startsWith('@') && (p === k || p.startsWith(k + '/')));
    return key ? TOURS[key] : null;
  }, []);

  // auto-start lần đầu vào trang (nếu chưa done + chưa tắt)
  useEffect(() => {
    setTour(null); setI(0); setRect(null); setCardPos(null);
    const t = tourFor(path);
    if (!t) return;
    const st = loadTut();
    if (st.off || st.done[doneKey(t)]) return;
    const h = setTimeout(() => { setTour(t); setI(0); }, 650); // chờ trang render
    return () => clearTimeout(h);
  }, [path, tourFor]);

  // nút "?" header — chạy lại tour trang hiện tại (bỏ qua done/off)
  useEffect(() => {
    const start = () => { const t = tourFor(path); if (t) { setTour(t); setI(0); } };
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
      setTimeout(() => { setTour(t); setI(0); }, 450); // chờ sheet render
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
          {!last && <button className="tut-skip" onClick={() => finish(true)}>Bỏ qua</button>}
          <button className="tut-skip" disabled={i === 0} onClick={() => setI(Math.max(0, i - 1))}>← Quay lại</button>
          <button className="tut-next" onClick={() => last ? finish(true) : setI(i + 1)}>
            {last ? 'Hoàn tất ✓' : 'Tiếp →'}
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
