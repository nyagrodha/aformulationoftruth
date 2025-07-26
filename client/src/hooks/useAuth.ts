import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading, error, isError } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/user", {
        credentials: "include",
      });
      
      if (response.status === 401) {
        return null; // Not authenticated, return null instead of throwing
      }
      
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // User is authenticated if we have user data and no error
  const isAuthenticated = !!user && !isError;

  return {
    user,
    isLoading,
    isAuthenticated,
    error,
  };
}