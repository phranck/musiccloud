import { ENDPOINTS, type NavId, type NavItem, type NavItemInput } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export function useAdminNav(navId: NavId) {
  return useQuery({
    queryKey: ["admin-nav", navId],
    queryFn: () => api.get<NavItem[]>(ENDPOINTS.admin.navigations.detail(navId)),
  });
}

export function useSaveNav(navId: NavId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: NavItemInput[]) => api.put<NavItem[]>(ENDPOINTS.admin.navigations.detail(navId), { items }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-nav", navId] });
      qc.invalidateQueries({ queryKey: ["nav", navId] });
    },
  });
}
