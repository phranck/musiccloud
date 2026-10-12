import type {
  ApiAccessAuditTrail,
  ApiTier,
  BillingPeriodValue,
  CreemModeValue,
  CreemProductMapping,
  PortalInvitation,
  SellingModeReadiness,
  TierOffer,
} from "@musiccloud/shared";
import {
  type ApiClientStatusValue,
  type ApiTokenStatusValue,
  type ClientRegistrationTypeValue,
  type DeveloperAccountStatusValue,
  type DeveloperProjectStatusValue,
  ENDPOINTS,
} from "@musiccloud/shared";
import { api } from "@/lib/api";

/** The two switches behind the developer portal's gate. */
export interface DeveloperPortalAvailability {
  maintenance: boolean;
  public: boolean;
}

/** One recorded change of the portal's availability: the state an owner set, when, and who it was. */
export interface DeveloperPortalAvailabilityChange extends DeveloperPortalAvailability {
  /** ISO 8601 timestamp of the change. */
  occurredAt: string;
  actor: { username: string; firstName: string | null; lastName: string | null };
}

/** The portal's availability with the change that produced it, or `null` before the first one. */
export interface DeveloperPortalAvailabilityState extends DeveloperPortalAvailability {
  lastChange: DeveloperPortalAvailabilityChange | null;
}

export function fetchDeveloperPortalAvailability(): Promise<DeveloperPortalAvailabilityState> {
  return api.get<DeveloperPortalAvailabilityState>(ENDPOINTS.admin.developer.portalAvailability);
}

/**
 * Stores both switches. The server records the change against the owner who
 * sent it, so the body carries the switches and nothing else.
 *
 * @param next - The availability to store.
 * @returns The stored state with its newest change.
 */
export function updateDeveloperPortalAvailability(
  next: DeveloperPortalAvailability,
): Promise<DeveloperPortalAvailabilityState> {
  return api.patch<DeveloperPortalAvailabilityState>(ENDPOINTS.admin.developer.portalAvailability, {
    public: next.public,
    maintenance: next.maintenance,
  });
}

export function fetchPortalInvitations(): Promise<{ invitations: PortalInvitation[] }> {
  return api.get<{ invitations: PortalInvitation[] }>(ENDPOINTS.admin.developer.portalInvitations);
}

/**
 * Invites an address into the closed portal, or sends its open invitation
 * again. The invitation and its mail are one step on the server, so a failure
 * here means nothing was stored.
 *
 * @param email - The address to invite.
 * @returns The invitation as it now stands.
 */
export function invitePortalDeveloper(email: string): Promise<{ invitation: PortalInvitation }> {
  return api.post<{ invitation: PortalInvitation }>(ENDPOINTS.admin.developer.portalInvitations, { email });
}

/**
 * Sends an open invitation again, with a new link. The old link stops working.
 *
 * @param id - The invitation.
 * @returns The invitation as it now stands.
 */
export function resendPortalInvitation(id: string): Promise<{ invitation: PortalInvitation }> {
  return api.post<{ invitation: PortalInvitation }>(ENDPOINTS.admin.developer.portalInvitationResend(id));
}

/**
 * Withdraws an invitation, together with the access it gave.
 *
 * @param id - The invitation.
 * @returns The invitation as it now stands.
 */
export function withdrawPortalInvitation(id: string): Promise<{ invitation: PortalInvitation }> {
  return api.delete<{ invitation: PortalInvitation }>(ENDPOINTS.admin.developer.portalInvitationDetail(id));
}

/** The bounds the operator has set on the open self-service creation path. */
export interface DeveloperLimits {
  /** How many projects one developer account may hold at once. */
  maxProjectsPerAccount: number;
}

export function fetchDeveloperLimits(): Promise<DeveloperLimits> {
  return api.get<DeveloperLimits>(ENDPOINTS.admin.developer.limits);
}

export function updateDeveloperLimits(next: DeveloperLimits): Promise<DeveloperLimits> {
  return api.patch<DeveloperLimits>(ENDPOINTS.admin.developer.limits, next);
}

/**
 * A token as the API describes it. The token itself is never part of this
 * shape: it exists once, in the response that issues it, and is not stored
 * anywhere afterwards.
 */
export interface ApiClientTokenResponse {
  id: string;
  tokenPrefix: string;
  status: ApiTokenStatusValue;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiClientResponse {
  id: string;
  developerAccountId: string;
  projectId: string;
  publicClientId: string;
  registrationType: ClientRegistrationTypeValue;
  capabilities: string[];
  projectDisplayName: string;
  projectStatus: DeveloperProjectStatusValue;
  projectRequestsPerMinute: number | null;
  projectRequestsPerDay: number | null;
  appName: string;
  contactEmail: string;
  description: string;
  /** Where this one application can be looked at, or `null`. Always `http` or `https`. */
  websiteUrl: string | null;
  status: ApiClientStatusValue;
  /** Optional registration cap. It can narrow, never widen, the project limit. */
  requestsPerMinute: number | null;
  /** Optional daily registration cap, or `null` when the project limit applies. */
  requestsPerDay: number | null;
  /** Display name of the selected project tier, or `null` when unassigned. */
  tierName: string | null;
  /** The tier's per-minute limit (what applies when the override is cleared), or `null` when unassigned. */
  tierRequestsPerMinute: number | null;
  /** The tier's per-day limit, or `null` when unassigned. */
  tierRequestsPerDay: number | null;
  /** Resolved limit (override ?? granting tier) that is actually enforced, or `null` when no plan grants one. */
  effectiveRequestsPerMinute: number | null;
  /** Resolved daily limit (same precedence). */
  effectiveRequestsPerDay: number | null;
  createdAt: string;
  updatedAt: string;
  tokens: ApiClientTokenResponse[];
}

export interface DeveloperProjectResponse {
  id: string;
  developerAccountId: string;
  displayName: string;
  status: DeveloperProjectStatusValue;
  requestsPerMinute: number | null;
  requestsPerDay: number | null;
  tierId: string | null;
  tierName: string | null;
  tierRequestsPerMinute: number | null;
  tierRequestsPerDay: number | null;
  /** Resolved limit that is actually enforced, or `null` when no plan grants one. */
  effectiveRequestsPerMinute: number | null;
  /** Resolved daily limit, or `null` when no plan grants one. */
  effectiveRequestsPerDay: number | null;
  createdAt: string;
  updatedAt: string;
  suspendedAt: string | null;
  deletedAt: string | null;
  createdByAdminId: string | null;
}

export interface ApiAccessOverview {
  clients: ApiClientResponse[];
}

/**
 * The subscription row that grants a project its plan.
 *
 * It is separate from the project because a plan has a life of its own: it is
 * bought, it renews, and it can be cancelled whilst the project stays.
 */
export interface DeveloperProjectSubscriptionResponse {
  id: string;
  projectId: string;
  tierId: string | null;
  creemSubscriptionId: string | null;
  creemCustomerId: string | null;
  status: string;
  interval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * One project with everything the detail screen shows.
 *
 * The route answers with all three in one response, so the screen needs no
 * second call to list the registrations under the project.
 *
 * @property subscription - The granting subscription, or `null` when the
 *   project has no plan and therefore no quota.
 */
export interface DeveloperProjectDetail {
  project: DeveloperProjectResponse;
  subscription: DeveloperProjectSubscriptionResponse | null;
  registrations: ApiClientResponse[];
}

export interface DeveloperAccountResponse {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Where the operator writes about this account's applications, or `null`. Never verified. */
  technicalContactEmail: string | null;
  /** Assigned tier id, or `null` when no tier is assigned. */
  tierId: string | null;
  /** Display name of the assigned tier, or `null`. */
  tierName: string | null;
  /** Whether the assigned tier is still offered; `false` marks a legacy assignment, `null` when unassigned. */
  tierEnabled: boolean | null;
  status: DeveloperAccountStatusValue;
  clientCount: number;
  appName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export function fetchDeveloperAccount(id: string): Promise<DeveloperAccountResponse> {
  return api.get<DeveloperAccountResponse>(ENDPOINTS.admin.developer.accountDetail(id));
}

export function updateDeveloperAccount(
  id: string,
  body: { email?: string; displayName?: string | null; tierId?: string | null; status?: DeveloperAccountStatusValue },
): Promise<DeveloperAccountResponse> {
  return api.patch<DeveloperAccountResponse>(ENDPOINTS.admin.developer.accountDetail(id), body);
}

export function deleteDeveloperAccount(id: string): Promise<void> {
  return api.delete(ENDPOINTS.admin.developer.accountDetail(id));
}

export function fetchApiAccessOverview(): Promise<ApiAccessOverview> {
  return api.get<ApiAccessOverview>(ENDPOINTS.admin.developer.apiAccess.overview);
}

export function createClientToken(id: string): Promise<{ token: ApiClientTokenResponse & { rawToken: string } }> {
  return api.post<{ token: ApiClientTokenResponse & { rawToken: string } }>(
    ENDPOINTS.admin.developer.apiAccess.clientCreateToken(id),
  );
}

export function fetchDeveloperProjects(accountId: string): Promise<{ projects: DeveloperProjectResponse[] }> {
  return api.get<{ projects: DeveloperProjectResponse[] }>(
    ENDPOINTS.admin.developer.apiAccess.accountProjects(accountId),
  );
}

/** One step of a usage series, stamped with the moment the step begins. */
export interface UsageBucketResponse {
  startedAt: string;
  total: number;
}

/**
 * Aggregated usage for one project, with the quota it is measured against.
 *
 * The quota arrives with the counts rather than from a second read, so a
 * screen never shows a number against a limit taken at a different moment.
 */
export interface ProjectUsageResponse {
  windows: {
    minute: { from: string; to: string; total: number };
    day: { from: string; to: string; total: number };
  };
  range: {
    from: string;
    to: string;
    bucket: string;
    total: number;
    byRegistration: { registrationId: string; total: number }[];
    buckets: UsageBucketResponse[];
  };
  quota: {
    requestsPerMinute: number | null;
    requestsPerDay: number | null;
  };
}

export function fetchProjectUsage(id: string): Promise<ProjectUsageResponse> {
  return api.get<ProjectUsageResponse>(ENDPOINTS.admin.developer.apiAccess.projectUsage(id));
}

/**
 * One Project's audit trail over the last thirty days, newest first, which is
 * the range the read covers when it names none.
 *
 * @param id - The Project.
 * @returns The trail, and whether the range holds more than it returned.
 */
export function fetchProjectAudit(id: string): Promise<ApiAccessAuditTrail> {
  return api.get<ApiAccessAuditTrail>(ENDPOINTS.admin.developer.apiAccess.projectAudit(id));
}

export function fetchDeveloperProject(id: string): Promise<DeveloperProjectDetail> {
  return api.get<DeveloperProjectDetail>(ENDPOINTS.admin.developer.apiAccess.projectDetail(id));
}

export function updateDeveloperProject(
  id: string,
  body: {
    displayName?: string;
    status?: DeveloperProjectStatusValue;
    requestsPerMinute?: number | null;
    requestsPerDay?: number | null;
  },
): Promise<{ project: DeveloperProjectResponse }> {
  return api.patch<{ project: DeveloperProjectResponse }>(ENDPOINTS.admin.developer.apiAccess.projectDetail(id), body);
}

export function updateDeveloperProjectSubscription(
  id: string,
  body: { tierId: string | null; status?: string; interval?: string | null },
): Promise<{ subscription: { projectId: string; tierId: string | null; status: string } }> {
  return api.put<{ subscription: { projectId: string; tierId: string | null; status: string } }>(
    ENDPOINTS.admin.developer.apiAccess.projectSubscription(id),
    body,
  );
}

export function activateToken(id: string): Promise<{ token: ApiClientTokenResponse }> {
  return api.post<{ token: ApiClientTokenResponse }>(ENDPOINTS.admin.developer.apiAccess.tokenActivate(id));
}

export function deactivateToken(id: string): Promise<{ token: ApiClientTokenResponse }> {
  return api.post<{ token: ApiClientTokenResponse }>(ENDPOINTS.admin.developer.apiAccess.tokenDeactivate(id));
}

export function fetchDeveloperAccounts(): Promise<{ accounts: DeveloperAccountResponse[] }> {
  return api.get<{ accounts: DeveloperAccountResponse[] }>(ENDPOINTS.admin.developer.accounts);
}

/**
 * A plan as the admin plan list returns it, with its offers.
 *
 * The offers are the plan's price, one per billing period, so a plan with none
 * is free.
 */
export type TierListItem = ApiTier & { offers: TierOffer[] };

export function fetchTiers(): Promise<TierListItem[]> {
  return api.get<TierListItem[]>(ENDPOINTS.admin.developer.tiers);
}

export function createTier(
  body: Pick<ApiTier, "name" | "requestsPerMinute" | "requestsPerDay"> &
    Partial<
      Pick<
        ApiTier,
        | "attributionRequired"
        | "color"
        | "icon"
        | "buttonLabel"
        | "description"
        | "enabled"
        | "disableReason"
        | "recommended"
        | "sortOrder"
        | "features"
      >
    >,
): Promise<ApiTier> {
  return api.post<ApiTier>(ENDPOINTS.admin.developer.tiers, body);
}

export function updateTier(
  id: string,
  body: Partial<
    Pick<
      ApiTier,
      | "name"
      | "requestsPerMinute"
      | "requestsPerDay"
      | "attributionRequired"
      | "color"
      | "icon"
      | "buttonLabel"
      | "description"
      | "enabled"
      | "disableReason"
      | "recommended"
      | "sortOrder"
      | "features"
    >
  >,
): Promise<ApiTier> {
  return api.patch<ApiTier>(ENDPOINTS.admin.developer.tierDetail(id), body);
}

export function deleteTier(id: string): Promise<void> {
  return api.delete(ENDPOINTS.admin.developer.tierDetail(id));
}

/**
 * Every Creem product mapping, plus the environments this deployment can act
 * on at all.
 *
 * An environment is missing from `writableModes` when no API key is configured
 * for it, which is the normal state before the live account exists. The editor
 * still shows it, so an operator sees what is not set up yet rather than a
 * control that simply fails.
 */
export interface CreemProductsResponse {
  writableModes: CreemModeValue[];
  products: CreemProductMapping[];
}

export function fetchCreemProducts(): Promise<CreemProductsResponse> {
  return api.get<CreemProductsResponse>(ENDPOINTS.admin.developer.creemProducts);
}

/**
 * Creates the product for a tier and interval at Creem, or records one that
 * was created in the Creem dashboard.
 *
 * @param body - The tier and interval, and optionally an existing product id.
 */
export function createCreemProduct(body: {
  tierId: string;
  billingPeriod: BillingPeriodValue;
  mode: CreemModeValue;
  creemProductId?: string;
}): Promise<CreemProductMapping> {
  return api.post<CreemProductMapping>(ENDPOINTS.admin.developer.creemProducts, body);
}

/**
 * Applies the offer's amount to the product at Creem, keeping its id and its
 * subscriptions.
 *
 * The request carries no price. The server reads the amount from the plan's
 * offer for that billing period, because the offer is the only place a price
 * is entered.
 *
 * @param tierId - The tier the product belongs to.
 * @param billingPeriod - Which of the plan's products to reprice.
 * @param mode - The Creem environment the product lives in.
 */
export function updateCreemProductPrice(
  tierId: string,
  billingPeriod: BillingPeriodValue,
  mode: CreemModeValue,
): Promise<CreemProductMapping & { price: number; currency: string }> {
  return api.patch<CreemProductMapping & { price: number; currency: string }>(
    ENDPOINTS.admin.developer.creemProductDetail(tierId, billingPeriod, mode),
  );
}

/**
 * Archives the product at Creem and removes its mapping, as one operation.
 *
 * @param tierId - The tier the product belongs to.
 * @param billingPeriod - Which of the plan's products to archive.
 * @param mode - The Creem environment the product lives in.
 */
export function archiveCreemProduct(
  tierId: string,
  billingPeriod: BillingPeriodValue,
  mode: CreemModeValue,
): Promise<void> {
  return api.delete(ENDPOINTS.admin.developer.creemProductDetail(tierId, billingPeriod, mode));
}

/** Which environment the shop sells from, and what each one would need. */
export interface CreemSellingModeResponse {
  sellingMode: CreemModeValue;
  configuredModes: CreemModeValue[];
  readiness: SellingModeReadiness[];
}

export function fetchCreemSellingMode(): Promise<CreemSellingModeResponse> {
  return api.get<CreemSellingModeResponse>(ENDPOINTS.admin.developer.creemSellingMode);
}

/**
 * Moves the shop to another Creem environment.
 *
 * This is the switch that decides whether a purchase charges a real card. The
 * server refuses an environment it holds no key for, and one where a buyable
 * plan has no product yet.
 *
 * @param sellingMode - The environment to sell from.
 */
export function updateCreemSellingMode(sellingMode: CreemModeValue): Promise<CreemSellingModeResponse> {
  return api.patch<CreemSellingModeResponse>(ENDPOINTS.admin.developer.creemSellingMode, { sellingMode });
}

/** The fields an offer is created with. The rest take their default. */
export type TierOfferCreate = Pick<TierOffer, "billingPeriod" | "priceCents"> &
  Partial<Omit<TierOffer, "id" | "tierId" | "billingPeriod" | "priceCents">>;

export function fetchPlanOffers(tierId: string): Promise<TierOffer[]> {
  return api.get<TierOffer[]>(ENDPOINTS.admin.developer.planOffers(tierId));
}

/**
 * Adds an offer to a plan.
 *
 * Nothing reaches Creem here. The product is created afterwards, deliberately,
 * from the Creem section of the same page.
 *
 * @param tierId - The plan the offer belongs to.
 * @param body - What is being sold and on what terms.
 */
export function createPlanOffer(tierId: string, body: TierOfferCreate): Promise<TierOffer> {
  return api.post<TierOffer>(ENDPOINTS.admin.developer.planOffers(tierId), body);
}

/**
 * Changes an offer. The product already at Creem keeps its price until the
 * offer's amount is applied to it from the Creem section.
 *
 * @param id - The offer to change.
 * @param body - The fields to change.
 */
export function updatePlanOffer(id: string, body: Partial<TierOfferCreate>): Promise<TierOffer> {
  return api.patch<TierOffer>(ENDPOINTS.admin.developer.planOfferDetail(id), body);
}

export function deletePlanOffer(id: string): Promise<void> {
  return api.delete(ENDPOINTS.admin.developer.planOfferDetail(id));
}
