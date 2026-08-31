import { ENDPOINTS } from "@musiccloud/shared";
import { api } from "@/lib/api";

export interface DeveloperPortalAvailability {
  maintenance: boolean;
  public: boolean;
}

export function fetchDeveloperPortalAvailability(): Promise<DeveloperPortalAvailability> {
  return api.get<DeveloperPortalAvailability>(ENDPOINTS.admin.developer.portalAvailability);
}

export function updateDeveloperPortalAvailability(
  next: DeveloperPortalAvailability,
): Promise<DeveloperPortalAvailability> {
  return api.patch<DeveloperPortalAvailability>(ENDPOINTS.admin.developer.portalAvailability, next);
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
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiClientResponse {
  id: string;
  developerAccountId: string;
  projectId: string;
  publicClientId: string;
  registrationType: "development" | "confidential" | "public";
  capabilities: string[];
  projectDisplayName: string;
  projectStatus: string;
  projectRequestsPerMinute: number | null;
  projectRequestsPerDay: number | null;
  appName: string;
  contactEmail: string;
  description: string;
  /** Where this one application can be looked at, or `null`. Always `http` or `https`. */
  websiteUrl: string | null;
  status: string;
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
  status: "active" | "suspended" | "deleted";
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
  status: string;
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
  body: { email?: string; displayName?: string | null; tierId?: string | null; status?: string },
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

export function fetchDeveloperProject(id: string): Promise<DeveloperProjectDetail> {
  return api.get<DeveloperProjectDetail>(ENDPOINTS.admin.developer.apiAccess.projectDetail(id));
}

export function updateDeveloperProject(
  id: string,
  body: {
    displayName?: string;
    status?: "active" | "suspended" | "deleted";
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

export interface TierResponse {
  id: string;
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired: boolean;
  /** Monthly price in euros as a numeric string (e.g. "9" or "9.90"), or `null` for free tiers. */
  price: string | null;
  /** Yearly price in euros as a numeric string, or `null` when no yearly billing is offered. */
  priceYearly: string | null;
  color: string;
  /** Iconsax icon name for the tier (one of the shared `TIER_ICONS`), or `null` for none. */
  icon: string | null;
  /** Custom label for the pricing-card CTA button, or `null` to use the portal default. */
  buttonLabel: string | null;
  description: string;
  enabled: boolean;
  disableReason: string;
  /** Whether this tier is the highlighted "recommended" one on the pricing page. At most one tier is recommended at a time (server-enforced); may be none. */
  recommended: boolean;
  sortOrder: number;
  /** Ordered feature labels shown on the public pricing card. At most 12 non-empty strings. */
  features: string[];
  createdAt: number;
  updatedAt: number;
}

export function fetchTiers(): Promise<TierResponse[]> {
  return api.get<TierResponse[]>(ENDPOINTS.admin.developer.tiers);
}

export function createTier(
  body: Pick<TierResponse, "name" | "requestsPerMinute" | "requestsPerDay"> &
    Partial<
      Pick<
        TierResponse,
        | "attributionRequired"
        | "price"
        | "priceYearly"
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
): Promise<TierResponse> {
  return api.post<TierResponse>(ENDPOINTS.admin.developer.tiers, body);
}

export function updateTier(
  id: string,
  body: Partial<
    Pick<
      TierResponse,
      | "name"
      | "requestsPerMinute"
      | "requestsPerDay"
      | "attributionRequired"
      | "price"
      | "priceYearly"
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
): Promise<TierResponse> {
  return api.patch<TierResponse>(ENDPOINTS.admin.developer.tierDetail(id), body);
}

export function deleteTier(id: string): Promise<void> {
  return api.delete(ENDPOINTS.admin.developer.tierDetail(id));
}
