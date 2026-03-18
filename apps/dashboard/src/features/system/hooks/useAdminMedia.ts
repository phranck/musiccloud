import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { MediaAsset } from "@/shared/types/media";
import { api } from "@/lib/api";

export function useAdminMedia() {
  return useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<MediaAsset[]>("/admin/media"),
  });
}

export function useUploadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.upload<MediaAsset>("/admin/media", fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}

export function useRenameMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, displayName }: { id: number; displayName: string }) =>
      api.patch<MediaAsset>(`/admin/media/${id}`, { displayName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/media/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}

export function useSyncMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/admin/media/sync"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}
