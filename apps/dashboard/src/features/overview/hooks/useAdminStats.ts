import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminStats } from "@/shared/types/admin";

export function useAdminStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get<AdminStats>("/admin/stats"),
  });
}
