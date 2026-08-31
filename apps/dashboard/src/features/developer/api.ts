import { ENDPOINTS } from "@musiccloud/shared";
import type { BillingInterval, CreemMode } from "@/features/developer/domain";
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

/** One tier's Creem product in one environment. */
export interface CreemProductMapping {
  tierId: string;
  /** One of {@link BillingInterval}. */
  interval: BillingInterval;
  /** Which Creem environment holds this product. */
  mode: CreemMode;
  /** The Creem product id. */
  creemProductId: string;
}

/**
 * Every Creem product mapping, plus the environment this backend can write to.
 *
 * A backend holds one API key and therefore talks to one Creem account. The
 * editor shows both environments so an operator can see what still has to be
 * set up, and lets them change only the one `mode` names.
 */
export interface CreemProductsResponse {
  mode: CreemMode;
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
  interval: BillingInterval;
  creemProductId?: string;
}): Promise<CreemProductMapping> {
  return api.post<CreemProductMapping>(ENDPOINTS.admin.developer.creemProducts, body);
}

/**
 * Changes the product's price at Creem, keeping its id and its subscriptions.
 *
 * @param tierId - The tier the product belongs to.
 * @param interval - Which of the tier's products to reprice.
 * @param priceCents - The new price in cents.
 */
export function updateCreemProductPrice(
  tierId: string,
  interval: BillingInterval,
  priceCents: number,
): Promise<CreemProductMapping & { price: number; currency: string }> {
  return api.patch<CreemProductMapping & { price: number; currency: string }>(
    ENDPOINTS.admin.developer.creemProductDetail(tierId, interval),
    { priceCents },
  );
}

/**
 * Archives the product at Creem and removes its mapping, as one operation.
 *
 * @param tierId - The tier the product belongs to.
 * @param interval - Which of the tier's products to archive.
 */
export function archiveCreemProduct(tierId: string, interval: BillingInterval): Promise<void> {
  return api.delete(ENDPOINTS.admin.developer.creemProductDetail(tierId, interval));
}
