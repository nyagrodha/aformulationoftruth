import React from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import RequireAuth from '@/components/useReqAuth';

// --- New: small shared UI bits ----------------------------------------------
function Navbar() {
  const { theme, setTheme } = useTheme();
  return (
    <header className="w-full border-b border-slate-200 dark:border-slate-800">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <a href="/" className="font-bold tracking-wide">a formulation of truth</a>
        <nav className="flex items-center gap-4">
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="/login">Login</a>
          <select
            aria-label="Theme"
            className="rounded-md border px-2 py-1 text-sm bg-transparent"
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
          >
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="neon">💡 Neon</option>
          </select>
        </nav>
      </div>
    </header>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) {
    // Send non-authed users to login/auth page
    window.location.assign("/login");
    return null;
  }
  return <>{children}</>;
}

// --- Your “modern” app pages (from your wouter-based entry) ------------------
import AuthPage from "@/pages/auth";
import AuthPortalPage from "@/pages/auth-portal";
import AuthCallbackPage from "@/pages/auth-callback";
import QuestionnairePage from "@/pages/questionnaire";
import CompletionPage from "@/pages/completion";
import ReviewDeclinedPage from "@/pages/review-declined";
import SharedQuestionnairePage from "@/pages/shared-questionnaire";
import AdminPage from "@/pages/admin";
import NotFoundPage from "@/pages/not-found";
import AatmaarpanastutiPage from "@/pages/aatmaarpanastuti";

// --- Your “classic” simple pages (from your older snippet) -------------------
import HomePage from "./pages/Home";
import AboutPage from "./pages/About";
import ContactPage from "./pages/Contact";
import LoginPage from "./pages/Login";

// If you still want these specific legacy pages:
import Start from "./pages/Start.jsx";
import QuestionnaireLegacy from "./pages/Questionnaire.jsx";
import ThankYou from "./pages/ThankYou.jsx";

// ---------------------------------------------------------------
function Router() {
  const { isAuthenticated } = useAuth();

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={HomePage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/login" component={LoginPage} />

      {/* Legacy quick path (optional): */}
      <Route path="/start" component={Start} />
      <Route path="/thanks" component={ThankYou} />
      <Route path="/questionnaire-legacy" component={QuestionnaireLegacy} />

      {/* Auth flow (modern) */}
      <Route path="/auth-callback" component={AuthCallbackPage} />
      <Route path="/auth-portal" component={AuthPortalPage} />

      {/* Shared view (public) */}
      <Route path="/shared/:shareId" component={SharedQuestionnairePage} />
      <Route path="/aatmaarpanastuti" component={AatmaarpanastutiPage} />

    #  {/* Auth-gated routes */}
    <Route
       path="/questionnaire/:sessionId"
       element={
      <RequireAuth>
      <QuestionnairePage />
    </RequireAuth>
  }
/>

    <Route
       path="/review-declined/:sessionId"
       element={
      <RequireAuth>
      <ReviewDeclinedPage />
    </RequireAuth>
  }
/>

    <Route
       path="/complete/:sessionId"
       element={
      <RequireAuth>
      <CompletionPage />
    </RequireAuth>
  }
/>

    <Route
       path="/admin"
       element={
      <RequireAuth>
      <AdminPage />
    </RequireAuth>
  }
/>
      {/* Default 404 */}
      <Route component={NotFoundPage} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Navbar />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
