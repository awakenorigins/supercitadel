/**
 * SOUL-RESTAURANT — web/api-client.ts
 * Client gọi API module dưới /api/v1/soul-restaurant. Dùng chung cho console
 * React (apps/web) và bất kỳ UI nào. Không phụ thuộc framework.
 *
 * Xác thực: host đã gắn JWT qua cookie/session; nếu cần Bearer thủ công (demo),
 * truyền token vào constructor.
 */
import type { UiCapability } from '../src/ui-catalog.js';

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: { code?: string; message?: string; issues?: unknown };
}

export class RestaurantApi {
  constructor(
    private baseUrl = '/api/v1/soul-restaurant',
    private token?: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  /** Lấy catalog năng lực để render nút động. */
  async capabilities(): Promise<{ summary: unknown; capabilities: UiCapability[] }> {
    const r = await fetch(`${this.baseUrl}/capabilities`, { headers: this.headers() });
    return r.json();
  }

  /** Gọi một năng lực theo mô tả trong catalog + payload người dùng nhập. */
  async call<T = unknown>(cap: Pick<UiCapability, 'method' | 'path'>, params: Record<string, unknown>): Promise<ApiResult<T>> {
    // path nội bộ '/restaurant/...' → bỏ tiền tố (đã nằm dưới baseUrl)
    const rel = cap.path.replace(/^\/restaurant/, '');
    let url = `${this.baseUrl}${rel}`;
    const init: RequestInit = { method: cap.method, headers: this.headers() };

    if (cap.method === 'GET') {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
      }
      const q = qs.toString();
      if (q) url += `?${q}`;
    } else {
      init.body = JSON.stringify(params);
    }

    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status, error: (body as any)?.error ?? body };
      return { ok: true, status: res.status, data: body as T };
    } catch (e) {
      return { ok: false, status: 0, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }
}
