import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route } from 'react-router-dom';
import RequireAuth from '@/components/RequireAuth';
// Import all pages
import AuthPortalPage from '@/pages/auth-portal';
import AuthCallbackPage from '@/pages/auth-callback';
import QuestionnairePage from '@/pages/questionnaire';
import CompletionPage from '@/pages/completion';
import ReviewDeclinedPage from '@/pages/review-declined';
import SharedQuestionnairePage from '@/pages/shared-questionnaire';
import AdminPage from '@/pages/admin';
import NotFoundPage from '@/pages/not-found';
import AatmaarpanastutiPage from '@/pages/aatmaarpanastuti';
import HomePage from '@/pages/home';
import StartPage from '@/pages/start';
import ThankYouPage from '@/pages/thank-you';
import AboutPage from '@/pages/about';
import ContactPage from '@/pages/contact';
import LoginPage from '@/pages/login';
export default function App() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(AuthPortalPage, {}) }), _jsx(Route, { path: "/home", element: _jsx(HomePage, {}) }), _jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/auth/callback", element: _jsx(AuthCallbackPage, {}) }), _jsx(Route, { path: "/start", element: _jsx(StartPage, {}) }), _jsx(Route, { path: "/thank-you", element: _jsx(ThankYouPage, {}) }), _jsx(Route, { path: "/about", element: _jsx(AboutPage, {}) }), _jsx(Route, { path: "/contact", element: _jsx(ContactPage, {}) }), _jsx(Route, { path: "/aatmaarpanastuti", element: _jsx(AatmaarpanastutiPage, {}) }), _jsx(Route, { path: "/questionnaire", element: _jsx(RequireAuth, { children: _jsx(QuestionnairePage, {}) }) }), _jsx(Route, { path: "/completion", element: _jsx(RequireAuth, { children: _jsx(CompletionPage, {}) }) }), _jsx(Route, { path: "/review-declined", element: _jsx(RequireAuth, { children: _jsx(ReviewDeclinedPage, {}) }) }), _jsx(Route, { path: "/shared/:id", element: _jsx(RequireAuth, { children: _jsx(SharedQuestionnairePage, {}) }) }), _jsx(Route, { path: "/admin", element: _jsx(RequireAuth, { children: _jsx(AdminPage, {}) }) }), _jsx(Route, { path: "*", element: _jsx(NotFoundPage, {}) })] }));
}
