import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FooterConfig } from "@/shared/contracts";

export function useFooterConfig() {
  return useQuery({
    queryKey: ["footer-config"],
    queryFn: () => api.get<FooterConfig>("/admin/footer-config"),
  });
}

export function useSaveFooterConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FooterConfig) => api.put<FooterConfig>("/admin/footer-config", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["footer-config"] }),
  });
}

export function useFooterPreview() {
  return useMutation({
    mutationFn: (config: FooterConfig) => api.post<{ sessionId: string }>("/admin/footer-config/preview", config),
  });
}
