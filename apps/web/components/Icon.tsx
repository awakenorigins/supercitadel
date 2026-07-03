// Icon — inline SVG sprite (taste rule: anti-emoji, stroke 1.6).
const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5" />,
  chat: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l.8-5.5A8 8 0 1 1 21 12Z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>,
  spark: <><path d="M12 3v4M12 17v4M5 12H3M21 12h-2M6.3 6.3 7.7 7.7M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4" /><circle cx="12" cy="12" r="3" /></>,
  bell: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5h3.2a2 2 0 0 1 0 4H9.5m0-4V15m0-1.5h4" /></>,
  coffee: <path d="M4 9h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9ZM17 10h2a2 2 0 0 1 0 4h-2M7 4v2M11 4v2M14 4v2" />,
  up: <path d="M5 16l5-5 3 3 6-7M16 7h4v4" />,
  box: <path d="m12 2 8 4.5v9L12 20l-8-4.5v-9L12 2ZM4 6.5 12 11l8-4.5M12 11v9" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3.5 3.5 0 0 1 0 6.9M21 20c0-2.6-1.7-4.8-4-5.6" /></>,
  check: <path d="M5 12.5 10 17l9-10" />,
  cart: <><path d="M3 4h2l2.4 12.2a1.5 1.5 0 0 0 1.5 1.3h8.5a1.5 1.5 0 0 0 1.5-1.2L21 8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L16 2H8l-.6 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 3 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L8 22h8l.6-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  shield: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.2 4 20Z" />,
  send: <path d="M5 12 19 5l-4 14-3.5-5.5L5 12Z" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 6-6 6 6 6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  gift: <><rect x="3" y="8" width="18" height="13" rx="1.5" /><path d="M3 12h18M12 8v13M12 8S10 3 7.5 4.5 9.5 8 12 8Zm0 0s2-5 4.5-3.5S14.5 8 12 8Z" /></>,
  logout: <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M9 16l-4-4 4-4M5 12h10" />,
  // V7A P3 — item system
  bag: <path d="M6 8h12l1 12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 8ZM9 8V6a3 3 0 0 1 6 0v2" />,
  cake: <path d="M4 13h16v7H4v-7Zm2 0v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M12 9V6M12 6c-1 0-1.8-.9-1.8-1.9C10.2 3 12 2 12 2s1.8 1 1.8 2.1C13.8 5.1 13 6 12 6ZM4 16.5c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0" />,
  leaf: <path d="M5 20C5 10 11 4 20 4c0 9-6 15-15 16ZM5 20c2-6 6-10 11-12" />,
  battery: <><rect x="2" y="8" width="17" height="8" rx="2" /><path d="M22 11v2M6 11l2 2-2 2M10 11l2 2-2 2" /></>,
  palette: <path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3-3.5 3H15a2 2 0 0 0-1.5 3.3c.5.6.2 1.7-1.5 1.7ZM7.5 11.5h.01M11 7.5h.01M16 9h.01" />,
  // SUPERCITADEL R1 — sidebar nav
  book: <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6.5A2.5 2.5 0 0 0 4 21.5V19Zm0 0a2.5 2.5 0 0 0 2.5 2.5H19M8 7h7M8 11h5" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M14 12h4m0 0-1.8-1.8M18 12l-1.8 1.8" /></>,
  fox: <path d="M5 4c2 2.2 4.3 3 7 3s5-.8 7-3c.6 3 .3 5.8-1 8.2 1 1.5 1 3.3.2 4.8-1.3 2.4-3.6 4-6.2 4s-4.9-1.6-6.2-4c-.8-1.5-.8-3.3.2-4.8C4.7 9.8 4.4 7 5 4ZM9.5 12.5h.01M14.5 12.5h.01M12 15.5l-1-1h2l-1 1Z" />,
  // R4 — aside panels
  bank: <path d="M3 9.5 12 4l9 5.5M4.5 9.5V18M9 9.5V18M15 9.5V18M19.5 9.5V18M3 18h18M3 21h18" />,
  alert: <path d="M12 3 2.5 20h19L12 3Zm0 7v4m0 3h.01" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  quote: <path d="M5 7h5v5H7a3 3 0 0 0 3 3v2a5 5 0 0 1-5-5V7Zm9 0h5v5h-3a3 3 0 0 0 3 3v2a5 5 0 0 1-5-5V7Z" />,
};

export function Icon({ name, size, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" style={{ ...(size ? { width: size, height: size } : {}), ...style }}>
      {PATHS[name] ?? null}
    </svg>
  );
}
