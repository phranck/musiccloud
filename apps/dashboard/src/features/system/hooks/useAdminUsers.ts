import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminUser, AdminUserInvite } from "@/shared/types/admin";

export interface CreateUserFormData {
  username: string;
  email: string;
  role?: "admin" | "moderator";
  welcomeTemplateId?: number;
}

export const EMPTY_CREATE_USER_FORM: CreateUserFormData = {
  username: "",
  email: "",
};

export function useAdminUsers() {
  return useQuery({
    queryKey: ["users-admin"],
    queryFn: () => api.get<AdminUser[]>("/admin/users"),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserFormData) => api.post<AdminUserInvite>("/admin/users", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-admin"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-admin"] }),
  });
}

interface UpdateUserFormData {
  username?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  locale?: "de" | "en";
  role?: "admin" | "moderator";
  sessionTimeoutMinutes?: number | null;
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserFormData }) =>
      api.patch<AdminUser>(`/admin/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function useSaveUserAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const dataUrl = await fileToDataUrl(file);
      return api.post<AdminUser>(`/admin/users/${id}/avatar`, { dataUrl });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useSetGravatarAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, gravatarUrl }: { id: string; gravatarUrl: string }) =>
      api.patch<AdminUser>(`/admin/users/${id}/avatar`, { gravatarUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useDeleteUserAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}/avatar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
