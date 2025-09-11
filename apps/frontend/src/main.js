import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// apps/frontend/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeProvider } from '@/context/ThemeContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
const queryClient = new QueryClient();
const rootEl = document.getElementById('root');
if (!rootEl)
    throw new Error('Failed to find the root element');
createRoot(rootEl).render(_jsx(StrictMode, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(ThemeProvider, { children: _jsx(TooltipProvider, { children: _jsxs(AuthProvider, { children: [_jsx(Router, { children: _jsx(App, {}) }), _jsx(Toaster, {})] }) }) }) }) }));
