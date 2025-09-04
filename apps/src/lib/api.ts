// src/lib/api.ts
const API_BASE = "/api";

type Opts = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: opts.method ?? "GET",
    credentials: "include",                // <-- send/receive auth cookie
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  // Parse JSON safely
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    const error = new Error(msg) as Error & { status?: number; data?: any };
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data as T;
}
