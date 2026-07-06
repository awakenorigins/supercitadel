'use client';
// R3 NumberTicker — port ý tưởng magicui number-ticker sang IntersectionObserver + rAF thuần
// (không framer-motion). Đếm số khi vào viewport, ease-out, tôn trọng prefers-reduced-motion.
import { useEffect, useRef } from 'react';

export function NumberTicker({ value, duration = 1400, suffix = '', decimals = 0, className, style }:
  { value: number; duration?: number; suffix?: string; decimals?: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (n: number) => n.toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = fmt(value);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || done.current) return;
      done.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        el.textContent = fmt(value * eased);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = fmt(value);
      };
      requestAnimationFrame(tick);
      io.disconnect();
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration, suffix, decimals]);

  return <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>0{suffix}</span>;
}
