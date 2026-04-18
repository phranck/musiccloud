import { ENDPOINTS } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EmailTemplate } from "@/shared/contracts/admin-email-templates";

export type { EmailTemplate };

export type EmailTemplateInput = Omit<EmailTemplate, "id" | "createdAt" | "updatedAt" | "isSystemTemplate">;

export type ImportEmailTemplateInput = EmailTemplateInput & { overwrite: boolean };

export function useEmailTemplates() {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: () => api.get<EmailTemplate[]>(ENDPOINTS.admin.emailTemplates.list),
  });
}

export function useEmailTemplate(id: number) {
  return useQuery({
    queryKey: ["email-template", id],
    queryFn: () => api.get<EmailTemplate>(ENDPOINTS.admin.emailTemplates.detail(id)),
    enabled: id > 0,
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmailTemplateInput) => api.post<EmailTemplate>(ENDPOINTS.admin.emailTemplates.list, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
}

export function useUpdateEmailTemplate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<EmailTemplateInput>) =>
      api.put<EmailTemplate>(ENDPOINTS.admin.emailTemplates.detail(id), input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-templates"] });
      void qc.invalidateQueries({ queryKey: ["email-template", id] });
    },
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(ENDPOINTS.admin.emailTemplates.detail(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: (id: number) => api.post<{ sent: true; to: string }>(ENDPOINTS.admin.emailTemplates.test(id), {}),
  });
}

export function useImportEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportEmailTemplateInput) =>
      api.post<EmailTemplate>(ENDPOINTS.admin.emailTemplates.import, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
}
