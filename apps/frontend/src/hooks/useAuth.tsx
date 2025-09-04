import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { api } from '@/lib/api';

// ... (User and AuthContextType interfaces remain the same)
interface User { id: string; email: string; }
interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (email: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as true on initial load

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Ask the backend "who am I?" when the app loads
        const response = await api.get('/auth/session');
        if (response.data) {
          setUser(response.data);
        }
      } catch (error) {
        console.log("No active session found.");
      } finally {
        setIsLoading(false); // Stop loading once the check is complete
      }
    };
    checkSession();
  }, []);

  const login = async (email: string) => {
    setIsLoading(true);
    try {
      const response = await api.post('/auth/login', { email });
      setUser(response.data);
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => { /* ... */ };

  const value = { isAuthenticated: !!user, isLoading, user, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { /* ... */ }
