import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/hooks/useAuth';
import RequireAuth from '@/components/RequireAuth';

// Import all pages with their correct, consistent paths
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

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Router>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<AuthPortalPage />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/start" element={<StartPage />} />
                <Route path="/thank-you" element={<ThankYouPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/aatmaarpanastuti" element={<AatmaarpanastutiPage />} />

                {/* Protected Routes */}
                <Route path="/questionnaire" element={<RequireAuth><QuestionnairePage /></RequireAuth>} />
                <Route path="/completion" element={<RequireAuth><CompletionPage /></RequireAuth>} />
                <Route path="/review-declined" element={<RequireAuth><ReviewDeclinedPage /></RequireAuth>} />
                <Route path="/shared/:id" element={<RequireAuth><SharedQuestionnairePage /></RequireAuth>} />
                <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
                
                {/* Not Found Route */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Router>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
