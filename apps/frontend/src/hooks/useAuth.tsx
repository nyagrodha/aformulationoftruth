import { createContext, useContext, useMemo, type ReactNode } from "react";

export type AuthUser = { id?: string; email?: string; name?: string } | null;

export type AuthContextValue = {
  user: AuthUser;
  loading: boolean;
  startLogin: (email?: string) => Promise<void> | void;
  logout: () => Promise<void> | void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const defaultValue: AuthContextValue = {
  user: null,
  loading: false,
  startLogin: async (email?: string) => {
    if (!email) return;
    try {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // swallow; UI can show a toast elsewhere if needed
    }
  },
  logout: async () => {},
};

export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? defaultValue;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthContextValue>(() => defaultValue, []);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default useAuth;
