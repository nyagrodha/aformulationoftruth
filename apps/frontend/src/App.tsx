import React from 'react';
import { Routes, Route } from 'react-router-dom';

import LandingHero from "./componetns/LandingHero";

// page imports
import AuthPortalPage from "@/pages/auth-portal";
import HomePage from "@/pages/home";
import LoginPage from "@/pages/login";
import AuthCallbackPage from "@/pages/auth-callback";
import StartPage from "@/pages/start";
import ThankYouPage from "@/pages/thank-you";
import AboutPage from "@/pages/about";
import ContactPage from "@/pages/contact";
import AatmaarpanastutiPage from "@/pages/aatmaarpanastuti";
import QuestionnairePage from "@/pages/questionnaire";
import CompletionPage from "@/pages/completion";
import ReviewDeclinedPage from "@/pages/review-declined";
import SharedQuestionnairePage from "@/pages/shared";
import AdminPage from "@/pages/admin";
import NotFoundPage from "@/pages/not-found";

//wrappers 

import RequireAuth from "@/components/RequireAuth";

export default function App() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Hello from App.tsx</h1>
        <LandingHero />
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
        <Route
          path="/questionnaire"
          element={
            <RequireAuth>
              <QuestionnairePage />
            </RequireAuth>
          }
        />
        <Route
          path="/completion"
          element={
            <RequireAuth>
              <CompletionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/review-declined"
          element={
            <RequireAuth>
              <ReviewDeclinedPage />
            </RequireAuth>
          }
        />
        <Route
          path="/shared/:id"
          element={
            <RequireAuth>
              <SharedQuestionnairePage />
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

        {/* Catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </main>
  );
}
