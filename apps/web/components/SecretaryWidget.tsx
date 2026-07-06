'use client';
// R5 Phase C — Automato Thư Ký: floating widget góc phải-dưới (demo, KHÔNG gọi API thật).
// Persist qua các trang bằng localStorage 'citadel.secretary.widget' = 'open' | 'min' (đóng hẳn → xóa key).
// Kích hoạt từ trang /modules qua custom event 'citadel:secretary-demo'.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type WState = 'closed' | 'open' | 'min';
const LS_KEY = 'citadel.secretary.widget';

const INTRO = 'Em đang trong quá trình Khởi tạo... 🤖 Tương lai anh/chị có thể thêm nhiều nhân viên AI phụ trách toàn bộ hoặc từng bộ phận.';

export function SecretaryWidget() {
  const [st, setSt] = useState<WState>('closed');
  const [typing, setTyping] = useState(false);
  const [shown, setShown] = useState(''); // text đã "gõ" xong (hiện 1 lần, không animate lại khi đổi trang)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // khôi phục trạng thái từ localStorage (persist qua trang)
  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v === 'open') { setSt('open'); setShown(INTRO); }
      else if (v === 'min') setSt('min');
    } catch {}
  }, []);

  // sự kiện demo từ /modules: mở widget + typing dots → nói câu intro
  useEffect(() => {
    const onDemo = () => {
      setSt('open'); setShown(''); setTyping(true);
      try { localStorage.setItem(LS_KEY, 'open'); } catch {}
      timers.current.push(setTimeout(() => { setTyping(false); setShown(INTRO); }, 1700));
    };
    window.addEventListener('citadel:secretary-demo', onDemo);
    return () => { window.removeEventListener('citadel:secretary-demo', onDemo); timers.current.forEach(clearTimeout); };
  }, []);

  const minimize = () => { setSt('min'); try { localStorage.setItem(LS_KEY, 'min'); } catch {} };
  const reopen = () => { setSt('open'); setShown(INTRO); setTyping(false); try { localStorage.setItem(LS_KEY, 'open'); } catch {} };
  const close = () => { setSt('closed'); try { localStorage.removeItem(LS_KEY); } catch {} };

  if (st === 'closed') return null;

  if (st === 'min') {
    return (
      <button className="secw-fab" onClick={reopen} title="Thư Ký số 1" aria-label="Mở Thư Ký số 1">
        <Icon name="robot" size={22} />
        <span className="secw-fab-dot" />
      </button>
    );
  }

  return (
    <div className="secw" role="dialog" aria-label="Thư Ký số 1">
      <div className="secw-head">
        <div className="secw-ava"><Icon name="robot" size={19} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 13.5 }}>Thư Ký số 1</b>
          <div style={{ fontSize: 10.5, color: 'var(--jade)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--jade)', display: 'inline-block' }} />
            Automato · đang khởi tạo
          </div>
        </div>
        <button className="secw-act" onClick={minimize} title="Thu nhỏ" aria-label="Thu nhỏ"><Icon name="minus" size={14} /></button>
        <button className="secw-act" onClick={close} title="Đóng" aria-label="Đóng"><Icon name="x" size={14} /></button>
      </div>
      <div className="secw-body">
        {typing
          ? <div className="typing"><span /><span /><span /></div>
          : <div className="secw-bub">{shown || INTRO}</div>}
      </div>
      <div className="secw-foot">
        <span style={{ fontSize: 10.5, color: 'var(--faint)' }}>Bản demo — model LLM riêng sẽ ra mắt sau</span>
      </div>
    </div>
  );
}
