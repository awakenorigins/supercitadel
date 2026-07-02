// API client + auth state. JWT in localStorage; helpers for fetch with bearer.
export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3002';

export interface Session {
  jwt: string;
  user: { id: string; orgId: string; role: string; displayName: string | null };
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem('citadel.session'); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function setSession(s: Session) { localStorage.setItem('citadel.session', JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem('citadel.session'); }

export async function apiLogin(token: string): Promise<Session> {
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? 'Đăng nhập thất bại');
  const s: Session = { jwt: d.jwt, user: d.user };
  setSession(s);
  return s;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const s = getSession();
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.jwt}` } : {}), ...(init.headers ?? {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as any)?.error?.message ?? `Lỗi ${r.status}`);
  return d as T;
}
