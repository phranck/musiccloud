import { ENDPOINTS } from "@musiccloud/shared";
import { api } from "@/lib/api";

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
  requestsPerMinute: number;
  requestsPerDay: number;
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
  plan: string;
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
  body: { email?: string; displayName?: string | null; plan?: string; status?: string },
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
  body: { status?: string; requestsPerMinute?: number; requestsPerDay?: number },
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
  price: string | null;
  color: string;
  description: string;
  enabled: boolean;
  disableReason: string;
  sortOrder: number;
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
        "attributionRequired" | "price" | "color" | "description" | "enabled" | "disableReason" | "sortOrder"
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
      | "color"
      | "description"
      | "enabled"
      | "disableReason"
      | "sortOrder"
    >
  >,
): Promise<TierResponse> {
  return api.patch<TierResponse>(ENDPOINTS.admin.developer.tierDetail(id), body);
}

export function deleteTier(id: string): Promise<void> {
  return api.delete(ENDPOINTS.admin.developer.tierDetail(id));
}
