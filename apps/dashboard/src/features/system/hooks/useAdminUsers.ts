import { type AdminUserResponse, ENDPOINTS } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fileToDataUrl } from "@/lib/files";
import type { EditableAdminRole } from "@/shared/constants/domain";
import type { AdminUserInvite } from "@/shared/types/admin";

export interface CreateUserFormData {
  username: string;
  email: string;
  role?: EditableAdminRole;
}

export const EMPTY_CREATE_USER_FORM: CreateUserFormData = {
  username: "",
  email: "",
};

export function useAdminUsers() {
  return useQuery({
    queryKey: ["users-admin"],
    queryFn: () => api.get<AdminUserResponse[]>(ENDPOINTS.admin.users.list),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserFormData) => api.post<AdminUserInvite>(ENDPOINTS.admin.users.list, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-admin"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(ENDPOINTS.admin.users.detail(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-admin"] }),
  });
}

interface UpdateUserFormData {
  username?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: EditableAdminRole;
  sessionTimeoutMinutes?: number | null;
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserFormData }) =>
      api.patch<AdminUserResponse>(ENDPOINTS.admin.users.detail(id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useSaveUserAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const dataUrl = await fileToDataUrl(file);
      return api.post<AdminUserResponse>(ENDPOINTS.admin.users.avatar(id), { dataUrl });
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
      api.patch<AdminUserResponse>(ENDPOINTS.admin.users.avatar(id), { gravatarUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useDeleteUserAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(ENDPOINTS.admin.users.avatar(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
