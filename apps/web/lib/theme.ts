// Theme từ vật phẩm decor (V7A P3) — đổi accent color toàn app, hiệu ứng thấy được NGAY.
// Theme lưu server-side trong tt_soul_state.theme; client cache localStorage để áp tức thì khi load.
export const THEMES: Record<string, { accent: string; accentD: string; accentSoft: string; label: string }> = {
  jade: { accent: '#34d3b8', accentD: '#1c9784', accentSoft: 'rgba(52, 211, 184, .12)', label: 'Ngọc Bích' },
  gold: { accent: '#e8b366', accentD: '#b07e35', accentSoft: 'rgba(232, 179, 102, .14)', label: 'Hổ Phách' },
  sage: { accent: '#9fbf8f', accentD: '#6f9260', accentSoft: 'rgba(159, 191, 143, .14)', label: 'Sage' },
};

const KEY = 'citadel.theme';

export function applyTheme(theme: string) {
  const t = THEMES[theme] ?? THEMES.jade;
  const r = document.documentElement.style;
  r.setProperty('--jade', t.accent);
  r.setProperty('--jade-d', t.accentD);
  r.setProperty('--jade-soft', t.accentSoft);
  try { localStorage.setItem(KEY, theme in THEMES ? theme : 'jade'); } catch {}
}

/** Áp theme đã cache khi app load (Shell mount) — server vẫn là nguồn sự thật. */
export function applyStoredTheme() {
  try { const t = localStorage.getItem(KEY); if (t && t !== 'jade') applyTheme(t); } catch {}
}
