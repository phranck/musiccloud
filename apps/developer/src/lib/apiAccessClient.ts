/**
 * @file Browser-side client for the developer self-service API-access
 * endpoints (`/api/dev/api-access/*`, MC-089).
 *
 * The dashboard panels are React islands that call the same-origin BFF
 * (which proxies to the backend and relays the `mc_dev_session` cookie).
 * This module centralises the transport (JSON encode/decode, credentials,
 * error + 429 normalisation) and the response DTO shapes so the panels only
 * describe what they render. Server-side (SSR) reads live in
 * `apiAccessServer.ts` instead — different transport, same DTOs.
 */
import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";

/** Maximum `appName` length accepted by the backend (mirrored for inline validation). */
export const MAX_APP_NAME_LENGTH = 200;
/** Maximum `appDescription` length accepted by the backend (mirrored for inline validation). */
export const MAX_APP_DESCRIPTION_LENGTH = 2000;
/** HTTP 429 — the backend's rate-limit response, carrying `retryAfterSeconds`. */
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;

/**
 * Review lifecycle of an API-access request, as returned by the backend.
 * PascalCase members per the project domain-literals policy; the values are
 * the wire strings.
 */
export const AccessRequestStatus = {
  /** Submitted, awaiting admin review. */
  Pending: "pending",
  /** Approved — a client was created for it. */
  Approved: "approved",
  /** Rejected by an admin (see `reviewNote`). */
  Rejected: "rejected",
  /** Archived after handling; kept for history. */
  Archived: "archived",
} as const;

/** An {@link AccessRequestStatus} member value. */
export type AccessRequestStatusValue = (typeof AccessRequestStatus)[keyof typeof AccessRequestStatus];

/** Lifecycle of an approved API client ("app"). */
export const ApiClientStatus = {
  /** Live — its tokens authenticate requests. */
  Active: "active",
  /** Temporarily blocked by an admin. */
  Suspended: "suspended",
  /** Permanently withdrawn. */
  Revoked: "revoked",
} as const;

/** An {@link ApiClientStatus} member value. */
export type ApiClientStatusValue = (typeof ApiClientStatus)[keyof typeof ApiClientStatus];

/** Lifecycle of an issued bearer token. */
export const ApiTokenStatus = {
  /** Valid for authentication. */
  Active: "active",
  /** Explicitly revoked; permanently invalid. */
  Revoked: "revoked",
  /** Replaced by a rotation; permanently invalid. */
  Rotated: "rotated",
} as const;

/** An {@link ApiTokenStatus} member value. */
export type ApiTokenStatusValue = (typeof ApiTokenStatus)[keyof typeof ApiTokenStatus];

/**
 * An API-access request as returned by the self-service endpoints
 * (`toRequestResponse` in `apps/backend/src/routes/dev-api-access.ts`).
 */
export interface AccessRequestDto {
  /** Stable request id. */
  id: string;
  /** Name of the app access was requested for. */
  appName: string;
  /** Free-text description of the app. */
  appDescription: string;
  /** The developer's own traffic estimate. */
  estimatedRequestsPerDay: number;
  /** Review status (an {@link AccessRequestStatus} value). */
  status: string;
  /** Submission timestamp, ISO-8601. */
  submittedAt: string;
  /** Review timestamp, ISO-8601, or `null` while pending. */
  reviewedAt: string | null;
  /** Admin note from the review (set on rejection), or `null`. */
  reviewNote: string | null;
}

/**
 * An issued token as returned by the self-service endpoints. `rawToken` is
 * present exactly once, on the create/rotate response, and never again.
 */
export interface ApiTokenDto {
  /** Stable token id. */
  id: string;
  /** Non-secret display prefix (see {@link maskToken}). */
  tokenPrefix: string;
  /** Token status (an {@link ApiTokenStatus} value). */
  status: string;
  /** Creation timestamp, ISO-8601. */
  createdAt: string;
  /** Last authenticated use, ISO-8601, or `null` if never used. */
  lastUsedAt: string | null;
  /** Revocation timestamp, ISO-8601, or `null`. */
  revokedAt: string | null;
  /** The full secret token — present only on the create/rotate response. */
  rawToken?: string;
}

/** An approved API client with its tokens, as returned by `clientsList`. */
export interface ApiClientDto {
  /** Stable client id. */
  id: string;
  /** Name of the app. */
  appName: string;
  /** Free-text description. */
  description: string;
  /** Client status (an {@link ApiClientStatus} value). */
  status: string;
  /** Per-minute request quota enforced by the public API. */
  requestsPerMinute: number;
  /** Per-day request quota enforced by the public API. */
  requestsPerDay: number;
  /** Creation timestamp, ISO-8601. */
  createdAt: string;
  /** The client's tokens, newest first. */
  tokens: ApiTokenDto[];
}

/**
 * Normalised outcome of an API-access call.
 *
 * @property ok - Whether the response status was 2xx.
 * @property status - The HTTP status code (0 on a transport/network failure).
 * @property data - The parsed JSON body on success.
 * @property code - The backend `error` machine code on failure, if present.
 * @property message - The backend `message`, if present.
 * @property retryAfterSeconds - On a `429`, the backend's suggested wait.
 */
export interface ApiAccessResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
}

/**
 * Fetch a same-origin API-access endpoint and normalise the result. Sends
 * `credentials: "same-origin"` so the BFF can forward the session cookie.
 * Never throws: transport failures yield `{ ok: false, status: 0 }`, and a
 * `429` surfaces the backend's `retryAfterSeconds` for a friendly retry hint.
 *
 * @param path - Same-origin endpoint path.
 * @param init - Optional method/body/signal; defaults to a GET.
 * @returns The normalised {@link ApiAccessResult}.
 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<ApiAccessResult<T>> {
  try {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      ...init,
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // Empty or non-JSON body (e.g. a proxy error page); leave undefined.
    }

    if (res.ok) return { ok: true, status: res.status, data: body as T };

    const errorBody = (body ?? {}) as {
      error?: string;
      message?: string;
      context?: { retryAfterSeconds?: number };
    };
    return {
      ok: false,
      status: res.status,
      code: errorBody.error,
      message: errorBody.message,
      retryAfterSeconds: errorBody.context?.retryAfterSeconds,
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Formats a token's stored prefix for display, mirroring the backend's
 * `formatApiTokenForDisplay` — label + prefix + masked secret half.
 *
 * @param tokenPrefix - The token's non-secret `tokenPrefix`.
 * @returns e.g. `mc_live_AbC123••••••••`.
 */
export function maskToken(tokenPrefix: string): string {
  return `mc_live_${tokenPrefix}••••••••`;
}

/**
 * Lists the caller's own API-access requests, newest first.
 *
 * @param signal - Abort signal for the mount effect's cleanup.
 */
export function listAccessRequests(signal?: AbortSignal): Promise<ApiAccessResult<{ requests: AccessRequestDto[] }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.requestsList, { signal });
}

/**
 * Submits a new API-access request.
 *
 * @param body - App name, description, and the traffic estimate.
 */
export function submitAccessRequest(body: {
  appName: string;
  appDescription: string;
  estimatedRequestsPerDay: number;
}): Promise<ApiAccessResult<{ request: AccessRequestDto }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.requestsCreate, { method: "POST", body: JSON.stringify(body) });
}

/**
 * Lists the caller's own API clients including their tokens (never a hash).
 *
 * @param signal - Abort signal for the mount effect's cleanup.
 */
export function listApiClients(signal?: AbortSignal): Promise<ApiAccessResult<{ clients: ApiClientDto[] }>> {
  return requestJson(ENDPOINTS.dev.apiAccess.clientsList, { signal });
}

/**
 * Creates a new token for one of the caller's own clients. The response's
 * `token.rawToken` is shown exactly once.
 *
 * @param clientId - The owning client.
 */
export function createClientToken(clientId: string): Promise<ApiAccessResult<{ token: ApiTokenDto }>> {
  return requestJson(ROUTE_TEMPLATES.dev.apiAccess.clientCreateToken.replace(":id", clientId), { method: "POST" });
}

/**
 * Rotates one of the caller's own tokens: the old token is invalidated and
 * the response carries the replacement's `rawToken` exactly once.
 *
 * @param tokenId - The token to rotate.
 */
export function rotateClientToken(tokenId: string): Promise<ApiAccessResult<{ token: ApiTokenDto }>> {
  return requestJson(ROUTE_TEMPLATES.dev.apiAccess.tokenRotate.replace(":id", tokenId), { method: "POST" });
}

/**
 * Revokes one of the caller's own tokens permanently.
 *
 * @param tokenId - The token to revoke.
 */
export function revokeClientToken(tokenId: string): Promise<ApiAccessResult<{ token: ApiTokenDto }>> {
  return requestJson(ROUTE_TEMPLATES.dev.apiAccess.tokenRevoke.replace(":id", tokenId), { method: "POST" });
}
