//requires 
#
#function ProtectedRoute({ children }: { children: React.ReactNode }) {
#  const { isAuthenticated, isLoading } = useAuth();
#  if (isLoading) { /* …spinner… */ }
#  if (!isAuthenticated) return <Navigate to="/login" replace />;
#  return <>{children}</>;
#}
