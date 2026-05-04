import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useAuth } from "@/features/auth/AuthContext";

export function SetupGate({ children }: { children: ReactNode }) {
  const { user, needsSetup } = useAuth();
  if (!needsSetup) return <Navigate to={user ? "/" : "/login"} replace />;
  return <>{children}</>;
}
