import { Navigate, Outlet } from "react-router";

import { useAuth } from "@/features/auth/AuthContext";

export function RequireAuth() {
  const { user, needsSetup } = useAuth();
  if (!user) return <Navigate to={needsSetup ? "/setup" : "/login"} replace />;
  return <Outlet />;
}
