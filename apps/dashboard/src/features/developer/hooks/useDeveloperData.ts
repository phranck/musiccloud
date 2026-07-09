import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ApiAccessOverview,
  activateToken,
  approveApiAccessRequest,
  createClientToken,
  createTier,
  type DeveloperAccountResponse,
  deactivateToken,
  deleteDeveloperAccount,
  deleteTier,
  fetchApiAccessOverview,
  fetchDeveloperAccount,
  fetchDeveloperAccounts,
  fetchTiers,
  rejectApiAccessRequest,
  type TierResponse,
  updateApiClient,
  updateDeveloperAccount,
  updateTier,
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

export function useDeveloperAccount(id: string) {
  return useQuery<DeveloperAccountResponse>({
    queryKey: ["developer", "account", id],
    queryFn: () => fetchDeveloperAccount(id),
    enabled: !!id,
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

export function useUpdateDeveloperAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      email?: string;
      displayName?: string | null;
      tierId?: string | null;
      status?: string;
    }) => updateDeveloperAccount(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useDeleteDeveloperAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDeveloperAccount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useActivateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => activateToken(tokenId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useDeactivateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => deactivateToken(tokenId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; requestsPerMinute?: number | null; requestsPerDay?: number | null }) =>
      updateApiClient(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useTiers() {
  return useQuery<TierResponse[]>({
    queryKey: ["developer", "tiers"],
    queryFn: fetchTiers,
  });
}

export function useCreateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer", "tiers"] });
    },
  });
}

export function useUpdateTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      requestsPerMinute?: number;
      requestsPerDay?: number;
      attributionRequired?: boolean;
      price?: string | null;
      priceYearly?: string | null;
      color?: string;
      icon?: string | null;
      buttonLabel?: string | null;
      description?: string;
      enabled?: boolean;
      disableReason?: string;
      recommended?: boolean;
      sortOrder?: number;
      features?: string[];
    }) => updateTier(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer", "tiers"] });
    },
  });
}

export function useDeleteTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer", "tiers"] });
    },
  });
}
