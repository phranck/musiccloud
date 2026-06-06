import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FormConfig } from "@/shared/contracts";

export function useFormConfigs() {
  return useQuery({
    queryKey: ["form-configs"],
    queryFn: () => api.get<FormConfig[]>("/admin/forms"),
  });
}

export function useCreateFormConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; slug: string }) => api.post<FormConfig>("/admin/forms", data),
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
