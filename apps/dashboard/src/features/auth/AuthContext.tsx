import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useMemo } from "react";

import type { AdminUser } from "@/shared/types/admin";

import { api } from "@/lib/api";

const TOKEN_KEY = "admin_token";

interface AuthState {
  user: AdminUser | null;
  isLoading: boolean;
  needsSetup: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const authMeQueryKey = ["auth", "me"] as const;
const authSetupQueryKey = ["auth", "setup"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery<AdminUser | null>({
    queryKey: authMeQueryKey,
    queryFn: () => api.get<AdminUser>("/admin/auth/me"),
    retry: false,
  });

  const setupQuery = useQuery({
    queryKey: authSetupQueryKey,
    queryFn: () => api.get<{ needsSetup: boolean }>("/admin/auth/setup-status"),
    enabled: meQuery.isError,
    retry: false,
  });

  const user = meQuery.data ?? null;
  const isLoading = meQuery.isLoading || (meQuery.isError && setupQuery.isLoading);
  const needsSetup = !user && meQuery.isError ? (setupQuery.data?.needsSetup ?? false) : false;

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: authMeQueryKey }),
      queryClient.invalidateQueries({ queryKey: authSetupQueryKey }),
    ]);

    await Promise.all([
      queryClient.refetchQueries({ queryKey: authMeQueryKey, type: "active" }),
      queryClient.refetchQueries({ queryKey: authSetupQueryKey, type: "active" }),
    ]);
  }, [queryClient]);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await api.post<{ token: string; user: AdminUser }>("/admin/auth/login", {
        username,
        password,
      });
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: result.token }));
      queryClient.setQueryData(authMeQueryKey, result.user);
      queryClient.setQueryData(authSetupQueryKey, { needsSetup: false });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    localStorage.removeItem(TOKEN_KEY);
    queryClient.setQueryData(authMeQueryKey, null);
    queryClient.setQueryData(authSetupQueryKey, { needsSetup: false });
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, isLoading, needsSetup, login, logout, refresh }),
    [user, isLoading, needsSetup, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
