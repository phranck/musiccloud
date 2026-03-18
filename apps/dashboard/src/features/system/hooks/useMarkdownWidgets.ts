import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface MarkdownWidget {
  id: number;
  key: string;
  name: string;
  type: "html" | "iframe";
  enabled: boolean;
  description: string;
  defaultHeight: number;
  snippet: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export function useMarkdownWidgets() {
  return useQuery({
    queryKey: ["markdown-widgets"],
    queryFn: () => api.get<MarkdownWidget[]>("/admin/markdown-widgets"),
  });
}

export function useSaveMarkdownWidget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MarkdownWidget> }) =>
      api.patch<MarkdownWidget>(`/admin/markdown-widgets/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markdown-widgets"] }),
  });
}

export function useCreateMarkdownWidget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<MarkdownWidget>) =>
      api.post<MarkdownWidget>("/admin/markdown-widgets", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markdown-widgets"] }),
  });
}

export function useDeleteMarkdownWidget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/markdown-widgets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markdown-widgets"] }),
  });
}
