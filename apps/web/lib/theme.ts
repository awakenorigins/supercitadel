// Theme từ vật phẩm decor (R7.7) — đổi accent + gradient + glow + veil toàn app + avatar biến hình.
// Theme lưu server-side trong tt_soul_state.theme; client cache localStorage để áp tức thì khi load.
// Non-consumable: mua 1 lần → sở hữu vĩnh viễn → bật/tắt/về Cơ Bản (jade) bất kỳ lúc nào.
export interface ThemeDef {
  accent: string; accentD: string; accentSoft: string;
  gradient: string; glow: string; veil: string;
  label: string; avatar: 'fox' | 'tiger' | 'crane'; motion: 'breathe' | 'shimmer' | 'sway';
}

export const THEMES: Record<string, ThemeDef> = {
  jade: {
    accent: '#34d399', accentD: '#059669', accentSoft: '#0f2f29',
    gradient: 'linear-gradient(135deg,#34d399 0%,#22d3ee 48%,#a7f3d0 100%)',
    glow: '0 0 32px rgba(52,211,153,.32)',
    veil: 'radial-gradient(circle at 30% 20%,rgba(52,211,153,.22),transparent 42%)',
    label: 'Ngọc Bích', avatar: 'fox', motion: 'breathe',
  },
  gold: {
    accent: '#f6c453', accentD: '#b7791f', accentSoft: '#33230f',
    gradient: 'linear-gradient(135deg,#fff2b8 0%,#f6c453 34%,#d8891c 68%,#7a3f12 100%)',
    glow: '0 0 38px rgba(246,196,83,.38),0 0 80px rgba(216,137,28,.14)',
    veil: 'radial-gradient(circle at 50% 0%,rgba(246,196,83,.24),transparent 44%)',
    label: 'Hổ Phách', avatar: 'tiger', motion: 'shimmer',
  },
  sage: {
    accent: '#9caf88', accentD: '#5f7358', accentSoft: '#18231b',
    gradient: 'linear-gradient(135deg,#d8e7c8 0%,#9caf88 38%,#6f8565 70%,#3f5242 100%)',
    glow: '0 0 34px rgba(156,175,136,.28),0 0 70px rgba(111,133,101,.12)',
    veil: 'radial-gradient(circle at 20% 10%,rgba(156,175,136,.18),transparent 46%)',
    label: 'Sage', avatar: 'crane', motion: 'sway',
  },
};

const KEY = '***';

export function themeOf(theme: string): ThemeDef { return THEMES[theme] ?? THEMES.jade; }

export function applyTheme(theme: string) {
  const t = themeOf(theme);
  const r = document.documentElement.style;
  r.setProperty('--jade', t.accent);
  r.setProperty('--jade-d', t.accentD);
  r.setProperty('--jade-soft', t.accentSoft);
  r.setProperty('--theme-gradient', t.gradient);
  r.setProperty('--theme-glow', t.glow);
  r.setProperty('--theme-veil', t.veil);
  document.documentElement.setAttribute('data-theme', theme in THEMES ? theme : 'jade');
  try { localStorage.setItem(KEY, theme in THEMES ? theme : 'jade'); } catch {}
}

/** Áp theme đã cache khi app load (Shell mount) — server vẫn là nguồn sự thật. */
export function applyStoredTheme() {
  try { const t = localStorage.getItem(KEY); if (t) applyTheme(t); } catch {}
}
