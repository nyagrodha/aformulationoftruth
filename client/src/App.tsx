import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import AuthPage from "@/pages/auth";
import AuthPortalPage from "@/pages/auth-portal";
import AuthCallbackPage from "@/pages/auth-callback";
import QuestionnairePage from "@/pages/questionnaire";
import CompletionPage from "@/pages/completion";
import ReviewDeclinedPage from "@/pages/review-declined";
import SharedQuestionnairePage from "@/pages/shared-questionnaire";
import AdminPage from "@/pages/admin";
import NotFoundPage from "@/pages/not-found";

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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;