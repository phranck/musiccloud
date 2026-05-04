import { Navigate, Outlet } from "react-router";

import { useAuth } from "@/features/auth/AuthContext";

export function RequireNonModerator() {
  const { user } = useAuth();
  if (user?.role === "moderator") return <Navigate to="/" replace />;
  return <Outlet />;
}
