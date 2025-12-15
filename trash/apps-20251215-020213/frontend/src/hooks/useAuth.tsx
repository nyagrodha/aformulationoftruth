import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiPost, apiGet } from "../lib/apiFailover";

export type AuthUser = { id?: string; email?: string; display_name?: string } | null;

export type AuthContextValue = {
  user: AuthUser;
  loading: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  startLogin: (email?: string, options?: any) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!user;
  const isLoading = loading;

  const setAuthenticatedUser = (userData: AuthUser) => {
    setUser(userData);
    if (userData) {
      localStorage.setItem('authUser', JSON.stringify(userData));
    } else {
      localStorage.removeItem('authUser');
    }
  };

  const startLogin = async (email?: string, options?: any) => {
    if (!email) return;
    try {
      const response = await apiPost("/api/auth/login", { email });
      if (!response.ok) {
        throw new Error('Failed to send magic link');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await apiPost("/api/auth/logout");
    } catch (error) {
      console.error('Logout error:', error);
    }
    setAuthenticatedUser(null);
  };

  const refresh = async () => {
    try {
      setLoading(true);
      // Check session with server
      const response = await apiGet("/api/auth/session");

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.user) {
          setUser(data.user);
          localStorage.setItem('authUser', JSON.stringify(data.user));
        } else {
          setUser(null);
          localStorage.removeItem('authUser');
        }
      } else {
        setUser(null);
        localStorage.removeItem('authUser');
      }
    } catch (error) {
      console.error('Refresh error:', error);
      setUser(null);
      localStorage.removeItem('authUser');
    } finally {
      setLoading(false);
    }
  };

  // Load user on mount
  useEffect(() => {
    refresh();
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated,
    isLoading,
    startLogin,
    logout,
    refresh,
  };

  // Expose setUser for internal use
  (value as any).setAuthenticatedUser = setAuthenticatedUser;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Export helper function to set authenticated user (for auth callback)
export function useSetAuthenticatedUser() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSetAuthenticatedUser must be used within an AuthProvider');
  }

  return (userData: AuthUser) => {
    (context as any).setUser?.(userData);
    if (userData) {
      localStorage.setItem('authUser', JSON.stringify(userData));
    } else {
      localStorage.removeItem('authUser');
    }
  };
}

export default useAuth;
