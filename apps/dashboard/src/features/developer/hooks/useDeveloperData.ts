import type {
  ApiAccessAuditTrail,
  BillingPeriodValue,
  CreemModeValue,
  PortalInvitation,
  TierOffer,
} from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ApiAccessOverview,
  activateToken,
  archiveCreemProduct,
  type CreemProductsResponse,
  type CreemSellingModeResponse,
  createClientToken,
  createCreemProduct,
  createPlanOffer,
  createTier,
  type DeveloperAccountResponse,
  type DeveloperProjectDetail,
  deactivateToken,
  deleteDeveloperAccount,
  deletePlanOffer,
  deleteTier,
  fetchApiAccessOverview,
  fetchCreemProducts,
  fetchCreemSellingMode,
  fetchDeveloperAccount,
  fetchDeveloperAccounts,
  fetchDeveloperProject,
  fetchDeveloperProjects,
  fetchPlanOffers,
  fetchPortalInvitations,
  fetchProjectAudit,
  fetchProjectUsage,
  fetchTiers,
  invitePortalDeveloper,
  type ProjectUsageResponse,
  resendPortalInvitation,
  type TierListItem,
  type TierOfferCreate,
  updateCreemProductPrice,
  updateCreemSellingMode,
  updateDeveloperAccount,
  updateDeveloperProject,
  updateDeveloperProjectSubscription,
  updatePlanOffer,
  updateTier,
  withdrawPortalInvitation,
} from "@/features/developer/api";
import type { ApiRequestError } from "@/shared/utils/api-error";

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

/**
 * One Project's audit trail. It sits under the `developer` key like the
 * Project's other reads, so every change made from the dashboard refreshes it.
 *
 * @param id - The Project.
 * @returns The query.
 */
export function useProjectAudit(id: string) {
  return useQuery<ApiAccessAuditTrail, ApiRequestError>({
    queryKey: ["developer", "project-audit", id],
    queryFn: () => fetchProjectAudit(id),
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
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof updateDeveloperAccount>[1]) =>
      updateDeveloperAccount(id, body),
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
    mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof updateDeveloperProject>[1]) =>
      updateDeveloperProject(id, body),
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
  return useQuery<TierListItem[]>({
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

/**
 * Every Creem product mapping across both environments, plus which of the two
 * this backend can write to.
 */
export function useCreemProducts() {
  return useQuery<CreemProductsResponse>({
    queryKey: ["developer", "creem-products"],
    queryFn: fetchCreemProducts,
  });
}

export function useCreateCreemProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCreemProduct,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer", "creem-products"] });
    },
  });
}

/** Applies the offer's amount to one product at Creem. */
export function useUpdateCreemProductPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tierId,
      billingPeriod,
      mode,
    }: {
      tierId: string;
      billingPeriod: BillingPeriodValue;
      mode: CreemModeValue;
    }) => updateCreemProductPrice(tierId, billingPeriod, mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer", "creem-products"] });
    },
  });
}

/**
 * Archives the product at Creem and removes its mapping. The tier list is
 * invalidated too, because the pricing page's price follows the product and a
 * period without one falls back to its offer's amount.
 */
export function useArchiveCreemProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tierId,
      billingPeriod,
      mode,
    }: {
      tierId: string;
      billingPeriod: BillingPeriodValue;
      mode: CreemModeValue;
    }) => archiveCreemProduct(tierId, billingPeriod, mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer", "creem-products"] });
      qc.invalidateQueries({ queryKey: ["developer", "tiers"] });
    },
  });
}

/**
 * Which Creem environment the shop sells from, and what each environment would
 * need before it could be sold from.
 */
export function useCreemSellingMode() {
  return useQuery<CreemSellingModeResponse>({
    queryKey: ["developer", "creem-selling-mode"],
    queryFn: fetchCreemSellingMode,
  });
}

/**
 * Moves the shop to another Creem environment.
 *
 * The catalogue behind the pricing page follows the selling environment, so
 * the tier list is invalidated with it.
 */
export function useUpdateCreemSellingMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateCreemSellingMode,
    onSuccess: (next) => {
      qc.setQueryData(["developer", "creem-selling-mode"], next);
      qc.invalidateQueries({ queryKey: ["developer", "tiers"] });
    },
  });
}

/** Every offer of one plan, which is what it costs. */
export function usePlanOffers(tierId: string | undefined) {
  return useQuery<TierOffer[]>({
    queryKey: ["developer", "plan-offers", tierId],
    queryFn: () => fetchPlanOffers(tierId as string),
    enabled: Boolean(tierId),
  });
}

/**
 * Invalidates everything a change to an offer can be seen in: the offers
 * themselves, the plan list whose displayed price follows them, and the Creem
 * products, which are addressed by an offer's period.
 */
function invalidateOffers(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["developer", "plan-offers"] });
  qc.invalidateQueries({ queryKey: ["developer", "tiers"] });
  qc.invalidateQueries({ queryKey: ["developer", "creem-products"] });
}

export function useCreatePlanOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tierId, body }: { tierId: string; body: TierOfferCreate }) => createPlanOffer(tierId, body),
    onSuccess: () => invalidateOffers(qc),
  });
}

export function useUpdatePlanOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<TierOfferCreate> }) => updatePlanOffer(id, body),
    onSuccess: () => invalidateOffers(qc),
  });
}

export function useDeletePlanOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePlanOffer,
    onSuccess: () => invalidateOffers(qc),
  });
}

/** The key every invitation read sits under, so a change refreshes the list. */
const PORTAL_INVITATIONS_KEY = ["developer", "portal-invitations"] as const;

/** Every invitation into the closed portal, the most recently sent first. */
export function usePortalInvitations() {
  return useQuery<{ invitations: PortalInvitation[] }, ApiRequestError>({
    queryKey: PORTAL_INVITATIONS_KEY,
    queryFn: fetchPortalInvitations,
  });
}

/**
 * One change to the invitations, which refreshes the list once it has worked.
 *
 * @param mutationFn - The request the change makes.
 * @returns The mutation.
 */
function usePortalInvitationChange<Variables>(
  mutationFn: (variables: Variables) => Promise<{ invitation: PortalInvitation }>,
) {
  const qc = useQueryClient();
  return useMutation<{ invitation: PortalInvitation }, ApiRequestError, Variables>({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: PORTAL_INVITATIONS_KEY }),
  });
}

/** Invites an address, or sends its open invitation again. */
export function useInvitePortalDeveloper() {
  return usePortalInvitationChange(invitePortalDeveloper);
}

/** Sends an open invitation again, with a new link. */
export function useResendPortalInvitation() {
  return usePortalInvitationChange(resendPortalInvitation);
}

/** Withdraws an invitation, together with the access it gave. */
export function useWithdrawPortalInvitation() {
  return usePortalInvitationChange(withdrawPortalInvitation);
}
