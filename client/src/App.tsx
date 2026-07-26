import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

const AuthPage = lazy(() => import("@/pages/auth"));
const AuthPortalPage = lazy(() => import("@/pages/auth-portal"));
const AuthCallbackPage = lazy(() => import("@/pages/auth-callback"));
const QuestionnairePage = lazy(() => import("@/pages/questionnaire"));
const CompletionPage = lazy(() => import("@/pages/completion"));
const ReviewDeclinedPage = lazy(() => import("@/pages/review-declined"));
const SharedQuestionnairePage = lazy(() => import("@/pages/shared-questionnaire"));
const AdminPage = lazy(() => import("@/pages/admin"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

function PageLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading...</p>
      </div>
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading, error } = useAuth();

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

  return (
    <Switch>
      {/* Public routes - always available */}
      <Route path="/auth-callback" component={AuthCallbackPage} />
      <Route path="/shared/:shareId" component={SharedQuestionnairePage} />

      {!isAuthenticated ? (
        <>
          <Route path="/" component={AuthPage} />
          <Route path="/auth-portal" component={AuthPortalPage} />
        </>
      ) : (
        <>
          <Route path="/" component={QuestionnairePage} />
          <Route path="/questionnaire/:sessionId" component={QuestionnairePage} />
          <Route path="/review-declined/:sessionId" component={ReviewDeclinedPage} />
          <Route path="/complete/:sessionId" component={CompletionPage} />
          <Route path="/admin" component={AdminPage} />
        </>
      )}
      <Route component={NotFoundPage} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Suspense fallback={<PageLoading />}>
          <Router />
        </Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;