// src/hooks/useAuth.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";

type User = { id: string | number; email: string };

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);
  const didInit = useRef(false);

  const me = useCallback(async (signal?: AbortSignal) => {
    try {
      const resp = await api<{ ok: boolean; user?: User }>("/auth/me", { signal });
      if (resp?.ok && resp.user) {
        setUser(resp.user);
        return resp.user;
      }
      setUser(null);
      return null;
    } catch (e: any) {
      if (e?.status !== 401) console.error("[auth/me]", e?.message || e);
      setUser(null);
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const ctrl = new AbortController();
    const u = await me(ctrl.signal);
    return u;
  }, [me]);

  const startLogin = useCallback(async (email: string) => {
    // POST /api/auth/start { email }
    await api("/auth/start", { method: "POST", body: { email } });
    // backend will email a magic link; user will click it and be redirected
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      await me(ctrl.signal);
      setLoading(false);
    })();

    return () => ctrl.abort();
  }, [me]);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    refresh,
    startLogin,
    logout,
  };
}
