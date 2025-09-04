import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
/**
 * Redirects to /login (by default) when the user is not authenticated.
 * Returns { user, ready, isLoading } so you can show a spinner while checking.
 */
export function useRequireAuth(opts) {
    const redirectTo = opts?.redirectTo ?? "/login";
    const { user, isAuthenticated, isLoading, refresh } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    useEffect(() => {
        // We wait for the initial /auth/me check to complete
        if (isLoading)
            return;
        if (!isAuthenticated) {
            // Preserve where the user was trying to go so we can bounce back after login
            navigate(redirectTo, { replace: true, state: { from: location } });
        }
    }, [isLoading, isAuthenticated, navigate, redirectTo, location]);
    return {
        user,
        isLoading,
        ready: !isLoading && isAuthenticated,
        refresh,
    };
}
