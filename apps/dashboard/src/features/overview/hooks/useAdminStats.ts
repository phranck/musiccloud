import { useQuery } from "@tanstack/react-query";

import type { AdminStats } from "@/shared/types/admin";
import { api } from "@/lib/api";

export function useAdminStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get<AdminStats>("/admin/stats"),
  });
}
