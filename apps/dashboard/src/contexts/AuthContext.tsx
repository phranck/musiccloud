import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "admin_token";

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, username: string) => void;
  logout: () => void;
}

function parseJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const expiry = parseJwtExpiry(token);
  if (expiry === null) return false;
  return Date.now() < expiry;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { token, username } = JSON.parse(stored) as { token: string; username: string };
        if (token && isTokenValid(token)) {
          return { token, username, isAuthenticated: true };
        }
      } catch {
        // ignore malformed storage
      }
    }
    return { token: null, username: null, isAuthenticated: false };
  });

  useEffect(() => {
    if (!state.isAuthenticated) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state.isAuthenticated]);

  function login(token: string, username: string) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, username }));
    setState({ token, username, isAuthenticated: true });
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setState({ token: null, username: null, isAuthenticated: false });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
