import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

import type { AdminUser } from "@/shared/types/admin";

import { api } from "@/lib/api";

const TOKEN_KEY = "admin_token";

function getTokenExpiry(): number | null {
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return null;
    const { token } = JSON.parse(stored) as { token: string };
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

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
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // JWT auto-refresh: check every 60s, refresh if token expires within 5 minutes
  useEffect(() => {
    refreshTimerRef.current = setInterval(async () => {
      const expiry = getTokenExpiry();
      if (!expiry) return;
      const msUntilExpiry = expiry - Date.now();
      if (msUntilExpiry > 0 && msUntilExpiry < 5 * 60 * 1000) {
        try {
          const result = await api.post<{ token: string }>("/admin/auth/refresh");
          localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: result.token }));
        } catch {
          // refresh failed (token already expired) – let the next /me call handle it
        }
      }
    }, 60 * 1000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  // Inactivity logout: track activity and check every 30s
  useEffect(() => {
    if (!user?.sessionTimeoutMinutes) return;

    const timeoutMs = user.sessionTimeoutMinutes * 60 * 1000;

    const handleActivity = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));

    inactivityTimerRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        void logout();
      }
    }, 30 * 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    };
  }, [user?.sessionTimeoutMinutes, logout]);

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
