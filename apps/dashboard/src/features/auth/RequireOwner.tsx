import { Navigate, Outlet } from "react-router";

import { useAuth } from "@/features/auth/AuthContext";

export function RequireOwner() {
  const { user } = useAuth();
  if (!user?.isOwner) return <Navigate to="/" replace />;
  return <Outlet />;
}
