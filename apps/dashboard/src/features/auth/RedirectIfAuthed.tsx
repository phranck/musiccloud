import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useAuth } from "@/features/auth/AuthContext";

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}
