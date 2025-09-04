import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRequireAuth } from "@/hooks/useRequireAuth";
export default function RequireAuth({ children, redirectTo = "/login", showSpinner = true, }) {
    const { ready, isLoading } = useRequireAuth({ redirectTo });
    if (!ready) {
        if (!showSpinner)
            return null;
        return (_jsx("div", { className: "min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 flex items-center justify-center", children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" }), _jsx("p", { className: "text-slate-600 dark:text-slate-400", children: "Checking session\u2026" })] }) }));
    }
    return _jsx(_Fragment, { children: children });
}
