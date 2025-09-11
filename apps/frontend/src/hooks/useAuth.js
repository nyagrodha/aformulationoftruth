import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo } from "react";
const AuthContext = createContext(undefined);
const defaultValue = {
    user: null,
    loading: false,
    startLogin: async (email) => {
        if (!email)
            return;
        try {
            await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
        }
        catch {
            // swallow; UI can show a toast elsewhere if needed
        }
    },
    logout: async () => { },
};
export function useAuth() {
    return useContext(AuthContext) ?? defaultValue;
}
export function AuthProvider({ children }) {
    const value = useMemo(() => defaultValue, []);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export default useAuth;
