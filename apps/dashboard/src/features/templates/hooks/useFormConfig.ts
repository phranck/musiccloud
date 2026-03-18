import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { FormConfig } from "@/shared/contracts";
import { api } from "@/lib/api";

export function useFormConfigs() {
  return useQuery({
    queryKey: ["form-configs"],
    queryFn: () => api.get<FormConfig[]>("/admin/forms"),
  });
}

export function useFormConfig(name: string | undefined) {
  return useQuery({
    queryKey: ["form-configs", name],
    queryFn: () => api.get<FormConfig>(`/admin/forms/${name}`),
    enabled: !!name,
  });
}

export function useCreateFormConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; slug: string }) =>
      api.post<FormConfig>("/admin/forms", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-configs"] }),
  });
}

export function useSaveFormConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Partial<FormConfig> }) =>
      api.patch<FormConfig>(`/admin/forms/${name}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-configs"] }),
  });
}

export function useDeleteFormConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.delete(`/admin/forms/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-configs"] }),
  });
}

export function useSetFormConfigActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, active }: { name: string; active: boolean }) =>
      api.patch<FormConfig>(`/admin/forms/${name}`, { isActive: active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-configs"] }),
  });
}

export function useImportFormConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; slug?: string; rows: FormConfig["rows"]; submissionConfig?: FormConfig["submissionConfig"]; overwrite?: boolean }) =>
      api.post<FormConfig>("/admin/forms/import", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-configs"] }),
  });
}
