import React from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function RequireAuth({
  children,
  redirectTo = "/login",
  showSpinner = true,
}: {
  children: React.ReactNode;
  redirectTo?: string;
  showSpinner?: boolean;
}) {
  const { ready, isLoading } = useRequireAuth({ redirectTo });

  if (!ready) {
    if (!showSpinner) return null;
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Checking session…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
