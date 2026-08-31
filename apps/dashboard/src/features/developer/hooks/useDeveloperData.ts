import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ApiAccessOverview,
  activateToken,
  createClientToken,
  createTier,
  type DeveloperAccountResponse,
  type DeveloperProjectDetail,
  deactivateToken,
  deleteDeveloperAccount,
  deleteTier,
  fetchApiAccessOverview,
  fetchDeveloperAccount,
  fetchDeveloperAccounts,
  fetchDeveloperProject,
  fetchDeveloperProjects,
  fetchProjectUsage,
  fetchTiers,
  type ProjectUsageResponse,
  type TierResponse,
  updateDeveloperAccount,
  updateDeveloperProject,
  updateDeveloperProjectSubscription,
  updateTier,
} from "@/features/developer/api";

export function useApiAccessOverview() {
  return useQuery<ApiAccessOverview>({
    queryKey: ["developer", "api-access"],
    queryFn: fetchApiAccessOverview,
  });
}

/**
 * The projects one developer account holds.
 *
 * @param accountId - The owning account; the query idles until it is known.
 */
export function useDeveloperProjects(accountId: string) {
  return useQuery({
    queryKey: ["developer", "account-projects", accountId],
    queryFn: () => fetchDeveloperProjects(accountId),
    enabled: !!accountId,
  });
}

/**
 * One project with its subscription and its registrations.
 *
 * @param id - The project; the query idles until it is known.
 */
export function useDeveloperProject(id: string) {
  return useQuery<DeveloperProjectDetail>({
    queryKey: ["developer", "project", id],
    queryFn: () => fetchDeveloperProject(id),
    enabled: !!id,
  });
}

/**
 * One project's aggregated usage, with the quota it is measured against.
 *
 * @param id - The project; the query idles until it is known.
 */
export function useProjectUsage(id: string) {
  return useQuery<ProjectUsageResponse>({
    queryKey: ["developer", "project-usage", id],
    queryFn: () => fetchProjectUsage(id),
    enabled: !!id,
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

export function useUpdateDeveloperProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      displayName?: string;
      status?: "active" | "suspended" | "deleted";
      requestsPerMinute?: number | null;
      requestsPerDay?: number | null;
    }) => updateDeveloperProject(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

/**
 * Sets the plan a project runs on, and the state of that subscription.
 *
 * The route requires `tierId` on every call, so the caller sends the plan it
 * wants even when only the state is changing.
 */
export function useSetProjectSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; tierId: string | null; status?: string; interval?: string | null }) =>
      updateDeveloperProjectSubscription(id, body),
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
