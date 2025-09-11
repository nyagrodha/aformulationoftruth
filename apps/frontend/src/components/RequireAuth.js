import { jsx as _jsx } from "react/jsx-runtime";
import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import LoadingOverlay from './LoadingOverlay'; // Assuming you have this for a loading state
export default function RequireAuth({ children }) {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();
    // If the auth state is still loading (e.g., checking for a token), show a loading screen.
    // We will add 'isLoading' to our useAuth hook later. For now, it is false.
    if (isLoading) {
        return _jsx(LoadingOverlay, { isVisible: true, title: "Verifying identity..." });
    }
    // If the user is NOT authenticated, the Dvārapāla denies entry.
    // It redirects them to the /login page, but it cleverly remembers 
    // the page they were trying to access (location.pathname).
    if (!isAuthenticated) {
        return _jsx(Navigate, { to: "/login", state: { from: location }, replace: true });
    }
    // If the user IS authenticated, the Dvārapāla grants passage.
    // It renders the protected page (the children).
    return children;
}
