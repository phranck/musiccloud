import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  headerBanner: string;
  headerText: string;
  bodyText: string;
  footerBanner: string;
  footerText: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: () => api.get<EmailTemplate[]>("/admin/email-templates"),
  });
}

export function useEmailTemplate(id: number | null) {
  return useQuery({
    queryKey: ["email-templates", id],
    queryFn: () => api.get<EmailTemplate>(`/admin/email-templates/${id}`),
    enabled: id !== null,
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailTemplate>) =>
      api.post<EmailTemplate>("/admin/email-templates", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

export function useSaveEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<EmailTemplate> }) =>
      api.patch<EmailTemplate>(`/admin/email-templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/email-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}
