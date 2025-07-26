import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthPage from "@/pages/auth";
import QuestionnairePage from "@/pages/questionnaire";
import CompletionPage from "@/pages/completion";
import ReviewDeclinedPage from "@/pages/review-declined";
import NotFoundPage from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/questionnaire/:sessionId" component={QuestionnairePage} />
      <Route path="/review-declined/:sessionId" component={ReviewDeclinedPage} />
      <Route path="/complete/:sessionId" component={CompletionPage} />
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