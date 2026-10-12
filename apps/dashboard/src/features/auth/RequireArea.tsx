import { Navigate, Outlet } from "react-router";

import { useAuth } from "@/features/auth/AuthContext";
import { type AdminArea, canAccessArea } from "@/shared/constants/domain";

/**
 * Route guard for an area of the dashboard. A user whose role may not open the
 * area is sent to the dashboard root. The Sidebar asks the same question
 * through {@link canAccessArea}, so it never offers a link this guard refuses.
 *
 * @param area - The area the nested routes belong to.
 */
export function RequireArea({ area }: { area: AdminArea }) {
  const { user } = useAuth();
  if (!canAccessArea(user?.role, area)) return <Navigate to="/" replace />;
  return <Outlet />;
}
