import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
//requires 
function ProtectedRoute({ children }) {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading) { /* …spinner… */ }
    if (!isAuthenticated)
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(_Fragment, { children: children });
}
