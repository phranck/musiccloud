import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface ContentPage {
  id: number;
  title: string;
  slug: string;
  status: "published" | "hidden" | "draft";
  showTitle: boolean;
  body: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useContentPages() {
  return useQuery({
    queryKey: ["content-pages"],
    queryFn: () => api.get<ContentPage[]>("/admin/pages"),
  });
}

export function useAdminContentPage(slug: string | undefined) {
  return useQuery({
    queryKey: ["content-pages", slug],
    queryFn: () => api.get<ContentPage>(`/admin/pages/${slug}`),
    enabled: !!slug,
  });
}

export function useSaveContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: Partial<ContentPage> }) =>
      api.patch<ContentPage>(`/admin/pages/${slug}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-pages"] }),
  });
}

export function useCreateContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; slug: string }) => api.post<ContentPage>("/admin/pages", data),
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

export function usePatchContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: Partial<ContentPage> }) =>
      api.patch<ContentPage>(`/admin/pages/${slug}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-pages"] }),
  });
}
