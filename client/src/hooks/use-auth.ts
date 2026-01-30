import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";

type User = {
  id: string;
  username: string;
};

export function useAuth(options: { redirectTo?: string } = {}) {
  const { redirectTo = "/admin/login" } = options;
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !user && redirectTo) {
      setLocation(redirectTo);
    }
  }, [isLoading, user, redirectTo, setLocation]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
  };
}
