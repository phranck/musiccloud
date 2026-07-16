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

export interface ApiAccessRequestResponse {
  id: string;
  developerAccountId: string;
  contactEmail: string;
  appName: string;
  appDescription: string;
  estimatedRequestsPerDay: number;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
}

export interface ApiClientTokenResponse {
  id: string;
  tokenPrefix: string;
  /** The full plaintext token. Present for created tokens (stored as `token_raw`), `null` for rotated ones. */
  rawToken: string | null;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiClientResponse {
  id: string;
  requestId: string;
  developerAccountId: string;
  appName: string;
  contactEmail: string;
  description: string;
  status: string;
  /** Per-key override, or `null` when the client inherits the account tier's limit. */
  requestsPerMinute: number | null;
  /** Per-key override, or `null` when the client inherits the account tier's limit. */
  requestsPerDay: number | null;
  /** Display name of the owning account's tier, or `null` when unassigned. */
  tierName: string | null;
  /** The tier's per-minute limit (what applies when the override is cleared), or `null` when unassigned. */
  tierRequestsPerMinute: number | null;
  /** The tier's per-day limit, or `null` when unassigned. */
  tierRequestsPerDay: number | null;
  /** Resolved limit (override ?? tier ?? fallback) that is actually enforced. */
  effectiveRequestsPerMinute: number;
  /** Resolved daily limit (same precedence). */
  effectiveRequestsPerDay: number;
  createdAt: string;
  updatedAt: string;
  tokens: ApiClientTokenResponse[];
}

export interface ApiAccessOverview {
  requests: ApiAccessRequestResponse[];
  clients: ApiClientResponse[];
}

export interface DeveloperAccountResponse {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  displayName: string | null;
  avatarUrl: string | null;
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

export function fetchApiAccessOverview(status?: string): Promise<ApiAccessOverview> {
  const qs = status ? `?status=${status}` : "";
  return api.get<ApiAccessOverview>(ENDPOINTS.admin.developer.apiAccess.overview + qs);
}

export function approveApiAccessRequest(
  id: string,
  body?: { requestsPerMinute?: number; requestsPerDay?: number },
): Promise<{ request: ApiAccessRequestResponse; client: ApiClientResponse }> {
  return api.post<{ request: ApiAccessRequestResponse; client: ApiClientResponse }>(
    ENDPOINTS.admin.developer.apiAccess.requestApprove(id),
    body,
  );
}

export function rejectApiAccessRequest(
  id: string,
  body: { reviewNote: string },
): Promise<{ request: ApiAccessRequestResponse }> {
  return api.post<{ request: ApiAccessRequestResponse }>(ENDPOINTS.admin.developer.apiAccess.requestReject(id), body);
}

export function createClientToken(id: string): Promise<{ token: ApiClientTokenResponse & { rawToken: string } }> {
  return api.post<{ token: ApiClientTokenResponse & { rawToken: string } }>(
    ENDPOINTS.admin.developer.apiAccess.clientCreateToken(id),
  );
}

export function updateApiClient(
  id: string,
  body: { status?: string; requestsPerMinute?: number | null; requestsPerDay?: number | null },
): Promise<{ client: ApiClientResponse }> {
  return api.patch<{ client: ApiClientResponse }>(ENDPOINTS.admin.developer.apiAccess.clientUpdate(id), body);
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
