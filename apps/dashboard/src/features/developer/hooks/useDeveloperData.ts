import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ApiAccessOverview,
  approveApiAccessRequest,
  createClientToken,
  fetchApiAccessOverview,
  fetchDeveloperAccounts,
  rejectApiAccessRequest,
  revokeToken,
  rotateToken,
} from "@/features/developer/api";

export function useApiAccessOverview(status?: string) {
  return useQuery<ApiAccessOverview>({
    queryKey: ["developer", "api-access", status ?? "all"],
    queryFn: () => fetchApiAccessOverview(status),
  });
}

export function useDeveloperAccounts() {
  return useQuery({
    queryKey: ["developer", "accounts"],
    queryFn: fetchDeveloperAccounts,
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; requestsPerMinute?: number; requestsPerDay?: number }) =>
      approveApiAccessRequest(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reviewNote }: { id: string; reviewNote: string }) => rejectApiAccessRequest(id, { reviewNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => createClientToken(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => revokeToken(tokenId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useRotateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => rotateToken(tokenId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}
