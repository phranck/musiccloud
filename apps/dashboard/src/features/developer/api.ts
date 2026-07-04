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
  createdAt: string;
  lastLoginAt: string | null;
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

export function revokeToken(id: string): Promise<{ token: ApiClientTokenResponse }> {
  return api.post<{ token: ApiClientTokenResponse }>(ENDPOINTS.admin.developer.apiAccess.tokenRevoke(id));
}

export function rotateToken(id: string): Promise<{ token: ApiClientTokenResponse & { rawToken: string } }> {
  return api.post<{ token: ApiClientTokenResponse & { rawToken: string } }>(
    ENDPOINTS.admin.developer.apiAccess.tokenRotate(id),
  );
}

export function fetchDeveloperAccounts(): Promise<{ accounts: DeveloperAccountResponse[] }> {
  return api.get<{ accounts: DeveloperAccountResponse[] }>(ENDPOINTS.admin.developer.accounts);
}
