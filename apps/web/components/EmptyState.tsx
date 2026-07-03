'use client';
// R4 EmptyState — illustration SVG inline vẽ tay (hộp/tờ giấy/kính lúp/người) + headline + CTA.
// Không dependency; stroke style đồng bộ Icon.tsx (1.6, round).

const ILLUS: Record<string, React.ReactNode> = {
  // hộp mở — kho trống
  box: (
    <>
      <path d="M12 30 32 20l20 10-20 10-20-10Z" />
      <path d="M12 30v14l20 10V40M52 30v14L32 54V40" />
      <path d="M32 20 24 8l-14 6 10 12M32 20l8-12 14 6-10 12" opacity=".55" />
      <circle cx="50" cy="12" r="1.6" fill="currentColor" stroke="none" opacity=".5" />
      <circle cx="10" cy="22" r="1.2" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  // tờ giấy — chưa có phiếu/hoá đơn
  doc: (
    <>
      <path d="M18 8h20l8 8v40H18V8Z" />
      <path d="M38 8v8h8" />
      <path d="M25 26h14M25 34h14M25 42h9" opacity=".6" />
      <circle cx="52" cy="50" r="1.6" fill="currentColor" stroke="none" opacity=".5" />
    </>
  ),
  // biên lai răng cưa — sổ quỹ trống
  receipt: (
    <>
      <path d="M20 8h24v46l-4-3-4 3-4-3-4 3-4-3-4 3V8Z" />
      <path d="M26 18h12M26 26h12M26 34h7" opacity=".6" />
      <circle cx="50" cy="14" r="1.4" fill="currentColor" stroke="none" opacity=".5" />
    </>
  ),
  // kính lúp — không tìm thấy
  search: (
    <>
      <circle cx="28" cy="28" r="14" />
      <path d="m38 38 14 14" />
      <path d="M22 26a7 7 0 0 1 6-4" opacity=".55" />
      <circle cx="52" cy="16" r="1.5" fill="currentColor" stroke="none" opacity=".5" />
    </>
  ),
  // người — chưa có nhân viên/khách
  people: (
    <>
      <circle cx="26" cy="20" r="8" />
      <path d="M10 50c0-9 7-16 16-16s16 7 16 16" />
      <circle cx="46" cy="24" r="6" opacity=".55" />
      <path d="M44 34c6 1 10 6 10 12" opacity=".55" />
    </>
  ),
  // đồng xu — ví/giao dịch trống
  coin: (
    <>
      <circle cx="32" cy="32" r="18" />
      <path d="M27 26h7a4.5 4.5 0 0 1 0 9h-7m0-9v13m0-6.5h9" />
      <path d="M50 14l3-3M53 20h4" opacity=".5" />
    </>
  ),
};

export function EmptyState({
  icon = 'box', title, sub, cta, onCta,
}: {
  icon?: string; title: string; sub?: string; cta?: string; onCta?: () => void;
}) {
  return (
    <div className="empty-state fade-up">
      <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ILLUS[icon] ?? ILLUS.box}
      </svg>
      <b>{title}</b>
      {sub && <p>{sub}</p>}
      {cta && onCta && <button className="es-cta" onClick={onCta}>{cta}</button>}
    </div>
  );
}
