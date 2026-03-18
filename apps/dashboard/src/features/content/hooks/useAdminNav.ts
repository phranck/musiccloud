import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface NavItem {
  label: string;
  href: string;
  type: "page" | "url" | "form";
}

export interface NavConfig {
  id: string;
  items: NavItem[];
}

export function useAdminNav(navId: string) {
  return useQuery({
    queryKey: ["nav", navId],
    queryFn: () => api.get<NavConfig>(`/admin/nav/${navId}`),
  });
}

export function useSaveNav() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ navId, items }: { navId: string; items: NavItem[] }) =>
      api.put<NavConfig>(`/admin/nav/${navId}`, { items }),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ["nav", variables.navId] }),
  });
}
