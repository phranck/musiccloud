import type { ContentPage, ContentPageSummary, PageType } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export type { ContentPage, ContentPageSummary } from "@musiccloud/shared";

export function useContentPages() {
  return useQuery({
    queryKey: ["content-pages"],
    queryFn: () => api.get<ContentPageSummary[]>("/admin/pages"),
  });
}

export function useAdminContentPage(slug: string | undefined) {
  return useQuery({
    queryKey: ["content-pages", slug],
    queryFn: () => api.get<ContentPage>(`/admin/pages/${slug}`),
    enabled: !!slug,
  });
}

export function useCreateContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; slug: string; pageType?: PageType }) =>
      api.post<ContentPage>("/admin/pages", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-pages"] }),
  });
}

export function useDeleteContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.delete(`/admin/pages/${slug}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-pages"] }),
  });
}
